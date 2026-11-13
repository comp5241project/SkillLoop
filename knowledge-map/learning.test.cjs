const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { topics } = require('../docs/team-samples/samples.json');
const cases = require('./learning-part1-cases.js');
const { validInput, validRecord, validOutput, buildOutput } = require('./learning-contract.js');
const adapter = require('./learning-part1-adapter.js');
global.window = {};
require('./learning-content.js');
require('./learning-feedback.js');
const content = window.SkillLoopLearningContent;
const feedback = window.SkillLoopLearningFeedback;
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'learning-samples.js'), 'utf8'), context);
const samples = context.window.SkillLoopSamples;

function record(id, source = 'ai', questionSource = 'authored') {
  return { schemaVersion: 2, caseId: id, source, questionSource,
    learner: { background: 'student', goal: 'internship' },
    responses: Array.from({ length: 4 }, (_, i) => ({ questionId: `q-${i}`, optionId: `o-${i}`, explanation: '' })),
    ...(questionSource === 'ai' ? { questions: cases[id].topicIds.map((conceptId, i) => ({
      id: `q-${i}`, conceptId, prompt: `Question about ${conceptId}?`, strength: 'A useful observation.', gap: 'Check the missing case.',
      options: [0, 1, 2].map((score, n) => ({ id: `o-${n}`, score, label: `Option ${n}`, feedback: `Feedback ${n}` })),
    })) } : {}),
    result: structuredClone(samples.samples[id].part2.input.result), updatedAt: '2026-11-13T00:00:00.000Z' };
}

test('fixture uses adopted case IDs and shared topic IDs', () => {
  assert.deepEqual(Object.keys(cases), ['cart-checkout', 'quiz-permissions', 'notes-save']);
  assert.deepEqual(JSON.stringify(samples.cases), JSON.stringify(cases));
  assert.deepEqual(JSON.stringify(samples.topics), JSON.stringify(topics));
});

for (const id of Object.keys(cases)) test(`${id}: all valid topics have cards and input adapts`, () => {
  const input = samples.samples[id].part2.input;
  assert.equal(validInput(input, samples), true);
  assert.ok(cases[id].topicIds.every((topicId) => content[id][topicId]?.exercise && content[id][topicId]?.focus));
  const incoming = record(id);
  assert.equal(validRecord(incoming, samples), true);
  assert.equal(adapter.fromRecord(incoming, samples, { validRecord }).case.caseId, id);
  const output = { caseId: id, aiSource: 'sample', learning: { studiedTopics: [input.result.priorities[0]], needsPractice: [], practiceFocus: ['Explain one check.'] } };
  assert.equal(validOutput(output, input, samples), true);
});

test('missing, invalid and cross-case records never become Sample input', () => {
  assert.throws(() => adapter.read({ read: () => null }, samples, { validRecord }), /missing or invalid/);
  const invalid = record('cart-checkout'); invalid.schemaVersion = 1;
  assert.equal(validRecord(invalid, samples), false);
  invalid.schemaVersion = 2; invalid.result.caseId = 'notes-save';
  assert.equal(validRecord(invalid, samples), false);
  assert.notEqual(samples.samples['cart-checkout'].part2.input.case.caseId, samples.samples['notes-save'].part2.input.case.caseId);
});

test('valid AI/local diagnosis and AI/authored question sources stay distinct', () => {
  const ai = record('cart-checkout', 'ai', 'ai');
  ai.responses.forEach((response) => { response.optionId = 'o-0'; });
  assert.equal(validRecord(ai, samples), true);
  const mixed = record('cart-checkout', 'local', 'ai');
  mixed.responses.forEach((response) => { response.optionId = 'o-1'; });
  assert.equal(validRecord(mixed, samples), true);
  assert.equal(validRecord(record('cart-checkout', 'local', 'authored'), samples), true);
  const missingQuestions = structuredClone(mixed); delete missingQuestions.questions;
  assert.equal(validRecord(missingQuestions, samples), false);
  const badOption = structuredClone(mixed); badOption.responses[0].optionId = 'foreign';
  assert.equal(validRecord(badOption, samples), false);
});

test('priorities reject unknown, duplicate, cross-case and invalid counts', () => {
  for (const value of [[], ['communication'], ['requirements', 'requirements'], ['requirements', 'code-reading', 'software-testing', 'edge-cases']]) {
    const input = structuredClone(samples.samples['cart-checkout'].part2.input);
    input.result.priorities = value;
    assert.equal(validInput(input, samples), false);
  }
});

test('missing dimensions and malformed diagnosis fields fail', () => {
  const input = structuredClone(samples.samples['notes-save'].part2.input);
  input.result.dimensions.pop(); assert.equal(validInput(input, samples), false);
  input.result.dimensions = samples.samples['notes-save'].part2.input.result.dimensions;
  delete input.result.nextSteps; assert.equal(validInput(input, samples), false);
});

test('completed output requires valid IDs, fields and Module 2 source', () => {
  const input = samples.samples['cart-checkout'].part2.input;
  const base = { caseId: 'cart-checkout', aiSource: 'api', learning: { studiedTopics: ['requirements'], needsPractice: ['requirements'], practiceFocus: ['Check coupon expiry.'] } };
  assert.equal(validOutput(base, input, samples), true);
  for (const edit of [
    (o) => { o.learning.studiedTopics = ['foreign']; },
    (o) => { o.learning.needsPractice = ['code-reading']; },
    (o) => { delete o.learning.practiceFocus; },
    (o) => { o.aiSource = 'local'; },
    (o) => { o.caseId = 'notes-save'; },
  ]) { const output = structuredClone(base); edit(output); assert.equal(validOutput(output, input, samples), false); }
});

test('current Part 1 material mismatch blocks adaptation', () => {
  const part1Data = { findCase: () => ({ summary: 'changed', snippet: cases['cart-checkout'].starterCode, knowledgePoints: cases['cart-checkout'].topicIds }) };
  assert.throws(() => adapter.fromRecord(record('cart-checkout'), samples, { validRecord }, part1Data), /materials differ/);
});

test('Sample feedback remains explicitly separate from API', async () => {
  const exercise = content['cart-checkout'].requirements.exercise;
  assert.equal((await feedback.evaluate({ exercise, answer: String(exercise.correct) })).aiSource, 'sample');
  assert.equal((await feedback.evaluate({ exercise, answer: String((exercise.correct + 1) % exercise.options.length) })).needsPractice, true);
});

for (const id of Object.keys(cases)) test(`${id}: completed Sample activities produce a valid handoff`, async () => {
  const input = samples.samples[id].part2.input;
  const results = new Map();
  const first = input.result.priorities[0];
  const exercise = content[id][first].exercise;
  results.set(first, await feedback.evaluate({ exercise, answer: exercise.kind === 'choice' ? String(exercise.correct) : 'incorrect' }));
  assert.throws(() => buildOutput(input, results, 'sample', null, content, samples), /incomplete/);
  for (const topicId of input.result.priorities.slice(1)) {
    const activity = content[id][topicId].exercise;
    results.set(topicId, await feedback.evaluate({ exercise: activity, answer: 'incorrect' }));
  }
  const output = buildOutput(input, results, 'sample', null, content, samples);
  assert.deepEqual(output.learning.studiedTopics, input.result.priorities);
  assert.deepEqual(output.learning.needsPractice, input.result.priorities.filter((topicId) => results.get(topicId).needsPractice));
  assert.equal(output.aiSource, 'sample');
  assert.equal(validOutput(output, input, samples), true);
  const nextId = Object.keys(cases).find((candidate) => candidate !== id);
  assert.throws(() => buildOutput(samples.samples[nextId].part2.input, results, 'sample', null, content, samples), /incomplete/);
});
