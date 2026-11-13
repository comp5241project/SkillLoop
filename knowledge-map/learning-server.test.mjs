import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AIError } from '../server/ai.mjs';
import { generate, validateFeedback, validateReflection, validateRequest, buildPrompt } from './learning-server.mjs';
import { handleLearningRequest } from './learning-api.mjs';
const require = createRequire(import.meta.url);
const cases = require('./learning-part1-cases.js');
const priorities = { 'cart-checkout': ['requirements'], 'quiz-permissions': ['communication'], 'notes-save': ['edge-cases'] };
const input = (id) => ({ case: cases[id], result: { caseId: id, overall: { level: 'developing', summary: 'Sample diagnosis.' },
  dimensions: cases[id].topicIds.map((conceptId) => ({ conceptId, level: 'developing', evidence: 'Sample answer', strength: 'One useful observation.', gap: `Check ${conceptId}.` })),
  priorities: priorities[id], nextSteps: ['Clarify the expected result.', 'Request a regression check.'] } });
const request = (id, action = 'feedback') => ({ action, input: structuredClone(input(id)),
  topicId: action === 'feedback' ? priorities[id][0] : null,
  answer: action === 'feedback' ? 'I would check the actual result against the case brief.' : null,
  observations: action === 'feedback' ? null : priorities[id].map((topicId) =>
    ({ topicId, judgment: 'incomplete', needsPractice: true, practiceFocus: 'Check the actual behavior.' })) });

for (const id of Object.keys(cases)) test(`${id}: prompt carries Part 1 case, dimension and next steps`, async () => {
  const body = request(id);
  assert.equal(validateRequest(body), true);
  const prompt = buildPrompt(body);
  assert.ok(prompt.includes(cases[id].starterCode));
  assert.ok(prompt.includes(cases[id].summary));
  assert.ok(prompt.includes(body.input.result.dimensions.find((item) => item.conceptId === body.topicId).gap));
  assert.ok(prompt.includes(body.input.result.nextSteps[0]));
  const result = await generate(body, async (options) => {
    assert.equal(options.messages[0].role, 'user');
    assert.ok(options.messages[0].content.includes(body.answer));
    assert.equal(options.validate({ judgment: 'incomplete', explanation: 'Check the boundary.', followUp: null, needsPractice: true, practiceFocus: 'Check the failed request.' }), true);
    return { data: { judgment: 'incomplete', explanation: 'Check the boundary.', followUp: null, needsPractice: true, practiceFocus: 'Check the failed request.' }, aiSource: 'api' };
  });
  assert.equal(result.aiSource, 'api');
});

test('feedback, reflection and requests reject malformed fields and foreign IDs', () => {
  assert.equal(validateFeedback({ judgment: 'correct', explanation: 'Yes', followUp: null, needsPractice: false }), false);
  assert.equal(validateReflection({ reflection: 'Review.', needsPractice: ['foreign'], practiceFocus: ['Check it'] }, ['requirements']), false);
  const body = request('cart-checkout'); body.topicId = 'communication'; assert.equal(validateRequest(body), false);
  const swapped = request('cart-checkout'); swapped.input.case.starterCode = 'wrong code'; assert.equal(validateRequest(swapped), false);
});

test('reflection uses only completed priority topics', async () => {
  const body = request('notes-save', 'reflection');
  const result = await generate(body, async ({ validate }) => {
    const data = { reflection: 'Check the unsent edit.', needsPractice: ['edge-cases'], practiceFocus: ['Ask for a reload check.'] };
    assert.equal(validate(data), true);
    return { data, aiSource: 'api' };
  });
  assert.equal(result.aiSource, 'api');
});

test('API error and retry preserve the submitted answer', async () => {
  const body = request('cart-checkout');
  const make = () => new Request('http://localhost/api/knowledge-learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const failed = await handleLearningRequest(make(), async () => { throw new AIError('TIMEOUT', 'The AI request timed out.'); });
  assert.equal(failed.status, 504);
  assert.equal((await failed.json()).code, 'TIMEOUT');
  const retried = await handleLearningRequest(make(), async (same) => {
    assert.equal(same.answer, body.answer);
    return { aiSource: 'api', judgment: 'incomplete', explanation: 'Check the boundary.', followUp: null, needsPractice: true, practiceFocus: 'Check the normal case.' };
  });
  assert.equal(retried.status, 200);
});
