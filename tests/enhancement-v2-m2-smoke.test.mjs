import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createMockTeachingProvider } = require('../enhancement-v2/m2-demo-mock.cjs');
const { proposalFromMockDraft } = require('./m2-model-proposal-fixture.cjs');
const { runOfflineEvaluation } = require('../enhancement-v2/m2-offline-evaluation.cjs');
const { createQuotaTestSession } = require('../enhancement-v2/m2-openrouter-provider.cjs');
const { studentTeachingResponse } = require('../enhancement-v2/m2-teaching-generator.cjs');
const { fixtures } = require('../enhancement-v2/m2-preflight/diagnosis-fixtures.json');
const { main: smokeCli } = require('../enhancement-v2/m2-smoke-cli.cjs');

const input = { fixture: fixtures[0], caseId: 'cart-checkout', caseVersion: 1,
  conceptId: 'edge-cases', requirementIds: ['empty-cart'] };
const usage = { prompt_tokens: 100, completion_tokens: 120, total_tokens: 220,
  prompt_tokens_details: { cached_tokens: 20 }, cost: 0.0001 };

test('smoke CLI requires explicit live arguments and opt-in before any transport', async () => {
  await assert.rejects(smokeCli([], {}), /Usage:/);
  await assert.rejects(smokeCli(['--live', '--output-dir', 'unused'], {}), /opt-in/);
});

async function validResponse(options, change = {}) {
  const body = JSON.parse(options.body);
  const request = JSON.parse(body.messages[1].content);
  const draft = await createMockTeachingProvider().generate(request);
  const proposal = proposalFromMockDraft(draft);
  return new Response(JSON.stringify({ model: body.model, usage,
    openrouter_metadata: { endpoints: { available: [{ provider: 'FakeHost', selected: true }] } },
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(proposal) } }],
    ...change }), { status: 200 });
}

async function inPrivateTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skillloop-m2-smoke-test-'));
  try { return await run(directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function runFakeSmoke(fetchImpl) {
  return inPrivateTempDirectory(async (outputDirectory) => {
    const summary = await runOfflineEvaluation({ mode: 'fake', smoke: true, repetitions: 1,
      outputDirectory, fetchImpl, env: {} });
    const files = await fs.readdir(outputDirectory);
    const records = [];
    for (const file of files.filter((name) => /^[0-9a-f-]{36}\.json$/.test(name)))
      records.push(JSON.parse(await fs.readFile(path.join(outputDirectory, file), 'utf8')));
    return { summary, records, files };
  });
}

test('single-call smoke success writes only Student A as a pending internal candidate', async () => {
  let calls = 0;
  const { summary, records, files } = await runFakeSmoke(async (_, options) => {
    calls++; return validResponse(options);
  });
  assert.equal(calls, 1);
  assert.equal(summary.plannedGenerations, 1);
  assert.equal(summary.completedGenerations, 1);
  assert.equal(summary.attemptedCalls, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].scenario, 'student-a');
  assert.equal(records[0].generationStatus, 'success');
  assert.equal(records[0].attempts, 1);
  assert.equal(records[0].humanReviewStatus, 'pending');
  assert.equal(records[0].internalDraft.reviewStatus, 'human-review-required');
  assert.equal(records[0].internalDraft.evaluationTrace.requirementId, 'empty-cart');
  assert.deepEqual(studentTeachingResponse(records[0].internalDraft), { state: 'rejected' });
  assert.equal(records[0].rawResponses.length, 1);
  assert.equal(records[0].routedProviders[0], 'FakeHost');
  assert.equal(records[0].usage.inputTokens, 100);
  assert.equal(records[0].usage.outputTokens, 120);
  assert.equal(records[0].usage.cacheHitTokens, 20);
  assert.equal(files.filter((name) => name.endsWith('-review-worksheet.json')).length, 1);
  assert.equal(files.filter((name) => name.endsWith('-review-candidates.json')).length, 1);
  assert.equal(files.filter((name) => name.endsWith('-source-map.json')).length, 1);
});

test('single-call session keeps a validated result behind the student review gate', async () => {
  let calls = 0;
  const session = createQuotaTestSession({ repetitions: 1, generationLimit: 1, attemptLimit: 1,
    fetchImpl: async (_, options) => { calls++; return validResponse(options); } });
  const result = await session.generateTeachingCard(input);
  assert.equal(result.status, 'success');
  assert.equal(result.reviewStatus, 'human-review-required');
  assert.deepEqual(studentTeachingResponse(result), { state: 'generated-pending-review' });
  assert.equal('publicCard' in studentTeachingResponse(result), false);
  assert.equal('internalAssessment' in studentTeachingResponse(result), false);
  assert.equal('evaluationTrace' in studentTeachingResponse(result), false);
  assert.equal(calls, 1);
  assert.equal(session.snapshot().maxGenerations, 1);
  assert.equal(session.snapshot().maxAttempts, 1);
  assert.throws(() => session.generateTeachingCard(input), { code: 'SESSION_EXHAUSTED' });
});

for (const [name, makeFetch] of [
  ['rate limit with known billing', async () => new Response(JSON.stringify({ usage }), { status: 429 })],
  ['network error', async () => { throw new Error('synthetic network failure'); }],
  ['invalid JSON', async (_, options) => validResponse(options, { choices: [
    { finish_reason: 'stop', message: { content: '{bad json' } }] })],
  ['invalid teaching content', async (_, options) => {
    const response = await validResponse(options);
    const payload = await response.json();
    const proposal = JSON.parse(payload.choices[0].message.content);
    proposal.publicContent.explanation = 'The empty-cart requirement is to return 999.';
    payload.choices[0].message.content = JSON.stringify(proposal);
    return new Response(JSON.stringify(payload), { status: 200 });
  }],
]) {
  test(`single-call smoke ${name} never retries`, async () => {
    let calls = 0;
    const { summary, records } = await runFakeSmoke((url, options) => {
      calls++; return makeFetch(url, options);
    });
    assert.equal(calls, 1);
    assert.equal(summary.plannedGenerations, 1);
    assert.equal(summary.attemptedCalls, 1);
    assert.equal(summary.status, 'stopped');
    assert.equal(records.length, 1);
    assert.equal(records[0].attempts, 1);
    assert.notEqual(records[0].generationStatus, 'success');
    assert.equal(records[0].internalDraft, null);
  });
}

test('single-call smoke timeout and late response cannot cause retry or publication', async () => {
  let calls = 0; let finish; let captured;
  const session = createQuotaTestSession({ repetitions: 1, generationLimit: 1, attemptLimit: 1,
    transportTimeoutMs: 5, outerTimeoutMs: 12,
    fetchImpl: (_, options) => { calls++; captured = options;
      return new Promise((resolve) => { finish = resolve; }); } });
  const result = await session.generateTeachingCard(input);
  assert.equal(calls, 1);
  assert.equal(result.status, 'provider-error');
  assert.deepEqual(studentTeachingResponse(result), { state: 'rejected' });
  assert.equal(session.snapshot().generations, 1);
  assert.equal(session.snapshot().attempts, 1);
  assert.equal(session.snapshot().terminal, true);
  assert.equal(session.snapshot().outstandingAttempts, 1);
  finish(await validResponse(captured));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(session.snapshot().terminal, true);
  assert.throws(() => session.generateTeachingCard(input), { code: 'SESSION_EXHAUSTED' });
});

test('single-call smoke unknown cost is terminal and cannot start another request', async () => {
  let calls = 0;
  const session = createQuotaTestSession({ repetitions: 1, generationLimit: 1, attemptLimit: 1,
    fetchImpl: async () => { calls++; return new Response('{}', { status: 429 }); } });
  const result = await session.generateTeachingCard(input);
  assert.equal(result.status, 'provider-error');
  assert.equal(calls, 1);
  assert.equal(session.snapshot().attempts, 1);
  assert.equal(session.snapshot().terminal, true);
  assert.equal(session.snapshot().outstandingAttempts, 1);
  assert.throws(() => session.generateTeachingCard(input), { code: 'SESSION_EXHAUSTED' });
  assert.equal(calls, 1);
});

test('default one-repetition runner still executes all three scenarios', async () => {
  let calls = 0;
  await inPrivateTempDirectory(async (outputDirectory) => {
    const result = await runOfflineEvaluation({ mode: 'fake', repetitions: 1,
      outputDirectory, env: {}, fetchImpl: async (_, options) => {
        calls++; return validResponse(options);
      } });
    assert.equal(result.plannedGenerations, 3);
    assert.equal(result.completedGenerations, 3);
    assert.equal(result.attemptedCalls, 3);
  });
  assert.equal(calls, 3);
});
