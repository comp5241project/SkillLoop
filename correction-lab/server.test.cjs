/** Run: node --test correction-lab/*.test.cjs  (no network; the AI provider is mocked). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('./case-check.js');
const service = require('./server.cjs');

global.window = {};
require('./cases.js');
const cases = global.window.SkillLoopCases;
const env = { OPENROUTER_API_KEY: 'test', OPENROUTER_MODEL: 'test/model:free', CORRECTION_TEACHER_CODE: 'teach' };
const body = (extra = {}) => ({
  action: 'draft',
  teacherCode: 'teach',
  request: { topic: cases[0].topic, notes: 'Requirements must be verifiable with a finite check.', format: 'text' },
  ...extra,
});
const reply = (content, status = 200) => async () => ({
  ok: status === 200,
  status,
  json: async () => ({ choices: [{ message: { content } }] }),
  text: async () => content,
});

test('every built-in case passes the shape check', () => {
  cases.forEach((item) => assert.deepEqual(check(item), [], item.id));
});

test('the shape check reports a wrong answer key', () => {
  const broken = { ...cases[0], flaws: [99], cause: { ...cases[0].cause, answer: 5 } };
  const errors = check(broken);
  assert.ok(errors.some((e) => e.includes('does not exist')));
  assert.ok(errors.some((e) => e.includes('correct option')));
});

test('without configuration the draft is the labelled sample', async () => {
  const out = await service.draft(body(), { env: {} });
  assert.equal(out.source, 'demo');
  assert.deepEqual(check(out.result), []);
});

test('a wrong teacher code is refused before calling the AI', async () => {
  let called = false;
  await assert.rejects(
    service.draft(body({ teacherCode: 'nope' }), { env, fetchImpl: async () => (called = true) }),
    (error) => error.status === 403
  );
  assert.equal(called, false);
});

test('a valid AI reply becomes a checked draft with a fresh id', async () => {
  const content = 'Here you go:\n```json\n' + JSON.stringify(cases[0]) + '\n```';
  const out = await service.draft(body(), { env, fetchImpl: reply(content), example: cases[0] });
  assert.equal(out.source, 'ai');
  assert.match(out.result.id, /^ai-/);
  assert.equal(out.result.origin, 'ai-draft');
  assert.deepEqual(check(out.result), []);
});

test('an invalid reply is retried once with the problems', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(JSON.parse(options.body));
    const content = calls.length === 1 ? '{"title": "half a case"}' : JSON.stringify(cases[1]);
    return reply(content)();
  };
  const out = await service.draft(body(), { env, fetchImpl, example: cases[0] });
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /problems/);
  assert.equal(out.source, 'ai');
});

test('a rate limit returns a clear message', async () => {
  await assert.rejects(
    service.draft(body(), { env, fetchImpl: reply('', 429), example: cases[0] }),
    /quota/
  );
});

test('a missing model gets a specific message', async () => {
  await assert.rejects(
    service.draft(body(), { env, fetchImpl: reply('{"error":"No endpoints"}', 404), example: cases[0] }),
    /model was not found/
  );
});

test('short notes are rejected', () => {
  assert.throws(() => service.readRequest({ action: 'draft', request: { notes: 'hi' } }), /lecture notes/);
});
