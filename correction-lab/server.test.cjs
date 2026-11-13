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

test('a comma-separated model list is sent as fallbacks', async () => {
  let sent;
  const fetchImpl = async (url, options) => {
    sent = JSON.parse(options.body);
    return reply(JSON.stringify(cases[0]))();
  };
  await service.draft(body(), { env: { ...env, OPENROUTER_MODEL: 'a/one:free, b/two:free' }, fetchImpl, example: cases[0] });
  assert.deepEqual(sent.models, ['a/one:free', 'b/two:free']);
});

test('AI Gateway is preferred and can use the OIDC token', async () => {
  let url;
  let sent;
  const fetchImpl = async (target, options) => {
    url = target;
    sent = options;
    return reply(JSON.stringify(cases[0]))();
  };
  const gateway = { ...env, AI_GATEWAY_MODEL: 'anthropic/claude-haiku-5.5' };
  const out = await service.draft(body(), { env: gateway, fetchImpl, example: cases[0], oidcToken: 'oidc' });
  assert.equal(out.source, 'ai');
  assert.match(url, /ai-gateway\.vercel\.sh/);
  assert.equal(JSON.parse(sent.body).model, 'anthropic/claude-haiku-5.5');
  assert.equal(sent.headers.Authorization, 'Bearer oidc');
});

test('without a gateway token, OpenRouter is used', () => {
  const ai = service.provider({ ...env, AI_GATEWAY_MODEL: 'x/y' }, undefined);
  assert.equal(ai.name, 'OpenRouter');
});

test('a draft that stays imperfect is returned for the teacher to fix', async () => {
  const half = JSON.stringify({ title: 'Half a case', lines: ['a', 'b'], flaws: [0], cause: { options: [{ text: 'x' }] } });
  const out = await service.draft(body(), { env, fetchImpl: reply(half), example: cases[0] });
  assert.equal(out.source, 'ai');
  assert.ok(out.problems.length > 0);
  assert.equal(out.result.cause.options.length, 3);
  assert.deepEqual(out.result.fix.criteria, []);
});

test('an unreadable reply twice is an error', async () => {
  await assert.rejects(
    service.draft(body(), { env, fetchImpl: reply('no json here'), example: cases[0] }),
    /not readable/
  );
});

test('a timeout gives a clear message', async () => {
  const fetchImpl = async () => {
    throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  };
  await assert.rejects(service.draft(body(), { env, fetchImpl, example: cases[0] }), /took too long/);
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
    /provider is unavailable/
  );
});

test('short notes are rejected', () => {
  assert.throws(() => service.readRequest({ action: 'draft', request: { notes: 'hi' } }), /lecture notes/);
});

/* ---- Part 4 review ---- */
const shared = require('./shared-samples.js');
const reviewBody = (caseId, status = 'pass') => ({
  action: 'review',
  caseId,
  tests: shared.cases[caseId].tests.map((spec) => ({ testId: spec.testId, status, actual: 'x' })),
  plan: [{ issueId: shared.cases[caseId].issues[0].issueId, changeRequest: 'Reject it.' }],
});
const ai = (data) => async ({ validate }) => {
  if (validate(data) !== true) throw Object.assign(new Error('invalid'), { code: 'INVALID_OUTPUT' });
  return { data, model: 'm', aiSource: 'api' };
};

test('review output has the part 4 handoff shape and keeps the runner results', async () => {
  const body = reviewBody('cart-checkout');
  body.tests[4].status = 'fail';
  const out = await service.review(body, { callAIJson: ai({ aiReview: 'Fractions are still accepted.', reviewTopics: ['edge-cases'] }) });
  assert.deepEqual(Object.keys(out), ['caseId', 'aiSource', 'verification']);
  assert.deepEqual(Object.keys(out.verification), ['testSource', 'tests', 'outcome', 'aiReview', 'reviewTopics']);
  assert.equal(out.aiSource, 'api');
  assert.equal(out.verification.testSource, 'runner');
  assert.equal(out.verification.outcome, 'needs_revision');
  assert.deepEqual(out.verification.tests, body.tests);
});

test('the model cannot add fields, invent topics or change the outcome', async () => {
  const body = reviewBody('quiz-permissions', 'fail');
  for (const bad of [
    { aiReview: 'ok', reviewTopics: ['security'] },
    { aiReview: '', reviewTopics: [] },
    { aiReview: 'ok', reviewTopics: [], outcome: 'passed' },
  ]) {
    await assert.rejects(service.review(body, { callAIJson: ai(bad) }));
  }
  const out = await service.review(body, { callAIJson: ai({ aiReview: 'All good!', reviewTopics: [] }) });
  assert.equal(out.verification.outcome, 'needs_revision');
});

test('results from another case or with unknown statuses are refused', () => {
  const mixed = reviewBody('cart-checkout');
  mixed.caseId = 'notes-save';
  assert.throws(() => service.readReview(mixed), /one result for each test/);
  const odd = reviewBody('notes-save');
  odd.tests[0].status = 'passed';
  assert.throws(() => service.readReview(odd), /one result for each test/);
  assert.throws(() => service.readReview({ action: 'review', caseId: 'nope', tests: [] }), /Unknown case/);
});

test('the review prompt is built from the shared case, not from the request', () => {
  const prompt = service.reviewPrompt(shared.cases['notes-save']);
  assert.match(prompt, /Show saved only after the request confirms success/);
  assert.match(prompt, /Never say a test passed or failed differently/);
});

test('the endpoint creates no global window, so the shared AI helper can run', () => {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, ['-e', "require('./api/correction.js'); console.log(typeof window)"], {
    cwd: require('node:path').join(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.equal(out.trim(), 'undefined');
});

test('without AI configuration the review endpoint answers NOT_CONFIGURED', () => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const handler = require('./api/correction.js');
    const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(v) { console.log(this.c, v.code); } };
    handler({ method: 'POST', headers: {}, body: ${JSON.stringify(JSON.stringify(reviewBody('cart-checkout')))} }, res);`;
  const env = { ...process.env };
  ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'].forEach((name) => delete env[name]);
  const out = execFileSync(process.execPath, ['-e', script], { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', env });
  assert.equal(out.trim(), '503 NOT_CONFIGURED');
});
