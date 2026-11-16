import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generate, validateRequest } from '../knowledge-map/learning-server.mjs';
import { handleLearningRequest } from '../knowledge-map/learning-api.mjs';
import dialogue from '../interview/dialogue-server.cjs';

const require = createRequire(import.meta.url);
const part1 = require('../learning-path/data.js');
const diagnosis = require('../learning-path/diagnosis-model.js');
const content = require('../knowledge-map/learning-content.js');
const contract = require('../knowledge-map/learning-contract.js');
const adapter = require('../knowledge-map/learning-part1-adapter.js');
const flow = require('../shared/flow.js');
const dialogueModel = require('../interview/dialogue-model.js');
const catalog = adapter.catalog(dialogue.catalog.topics, part1);

function recordFor(item) {
  const responses = item.questions.map((question) => ({
    questionId: question.id, optionId: question.options.find((option) => option.score === 0).id, explanation: '',
  }));
  return {
    schemaVersion: 2, caseId: item.id, learner: { background: 'student', goal: 'build' }, responses,
    result: diagnosis.buildLocalDiagnosis(item, responses), source: 'local', questionSource: 'authored',
    updatedAt: '2026-11-15T00:00:00Z',
  };
}

for (const item of part1.cases) test(`${item.id}: diagnosis links, individualized lessons and learning record`, async () => {
  const record = recordFor(item);
  const input = adapter.fromRecord(record, catalog, contract, part1);
  const selected = record.result.priorities;
  const origin = 'https://skillloop.example';
  for (const id of selected) {
    const link = `${origin}/knowledge-map/concept/?graph=software-development&topic=${id}`;
    assert.equal(adapter.priorityTarget(link, origin + '/learning-path/', record), '/knowledge-map/#topic-' + id);
    assert.equal(adapter.priorityTarget(link, origin + '/knowledge-map/explore/', record), null);
    assert.equal(adapter.priorityTarget(link + '&version=v1', origin + '/learning-path/', record), null);
  }
  assert.ok(item.knowledgePoints.every((id) => content[item.id][id].exercise && content[item.id][id].focus));

  const generated = { lessons: selected.map((topicId) => ({
    topicId, explanation: 'Explain a concept from this case.', example: 'Use the delivered behavior.',
    prompt: 'Describe the expected behavior in one test.',
  })).reverse() };
  const request = () => new Request(origin + '/api/knowledge-learning', {
    method: 'POST', body: JSON.stringify({ action: 'generate-lessons', input }),
  });
  const response = await handleLearningRequest(request(), (body) => generate(body, async ({ messages, validate }) => {
    const data = JSON.parse(messages[0].content);
    assert.equal(data.case.starterCode, item.snippet);
    assert.deepEqual(data.priorityTopics.map((topic) => topic.topicId), selected);
    assert.ok(data.priorityTopics.every((topic) => topic.evidence && topic.gap));
    assert.equal(validate(generated), true);
    assert.equal(validate({ lessons: [...generated.lessons, generated.lessons[0]] }), false);
    assert.equal(validate({ lessons: generated.lessons.map((lesson) => ({ ...lesson, topicId: 'foreign' })) }), false);
    assert.equal(validate({ lessons: generated.lessons.slice(1) }), false);
    return { aiSource: 'api', data: generated };
  }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).result.lessons, generated.lessons);

  const submittedLesson = generated.lessons[0];
  const grading = {
    action: 'feedback', input, topicId: submittedLesson.topicId, lesson: submittedLesson,
    answer: 'Private draft answer for Part 2.', observations: null,
  };
  assert.equal(validateRequest({ ...grading, lesson: { ...submittedLesson, topicId: 'foreign' } }), false);
  await generate(grading, async ({ messages }) => {
    const data = JSON.parse(messages[0].content);
    assert.equal(data.lesson.prompt, submittedLesson.prompt);
    assert.equal(data.case.starterCode, item.snippet);
    return { aiSource: 'api', data: {} };
  });

  for (const courseSource of ['ai-generated', 'authored-fallback']) {
    const mode = courseSource === 'ai-generated' ? 'api' : 'sample';
    const values = new Map([['learningPathDiagnosis', record]]);
    const store = { read: (key, fallback) => values.get(key) ?? fallback, write: (key, value) => !!values.set(key, value) };
    const results = new Map(selected.map((topicId) => [topicId, {
      aiSource: mode, judgment: 'incomplete', needsPractice: true, explanation: 'Observe the boundary.',
      answer: grading.answer,
    }]));
    const reflection = { aiSource: 'api', needsPractice: selected, practiceFocus: ['Probe the case boundary.'] };
    const output = contract.buildOutput(input, results, mode, reflection, content, catalog, courseSource);
    assert.deepEqual(output.learning.activities.map((entry) => entry.topicId), selected);
    assert.ok(!JSON.stringify(output).includes(grading.answer));
    assert.ok(flow.saveLearning(store, input, output));
    const handoff = flow.dialogueInput(store, dialogue.catalog, item.id);
    if (!part1.isSharedCase(item.id)) {
      assert.equal(handoff, null);
      continue;
    }
    const session = dialogueModel.create(handoff, dialogue.catalog, 'api', false);
    const restored = dialogue.read({ action: 'open', session });
    await dialogue.opening(restored, { async callAIJson({ messages }) {
      assert.deepEqual(JSON.parse(messages[0].content).learning, output.learning);
      return { data: { reply: 'Review the boundary in this code.', code: '' } };
    } });
    values.set('learningPathDiagnosis', { ...record, updatedAt: '2026-11-15T01:00:00Z' });
    assert.equal(flow.dialogueInput(store, dialogue.catalog, item.id), null);
  }
});
