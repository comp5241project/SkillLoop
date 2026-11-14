import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { fixtures } = require('../enhancement-v2/m2-preflight/diagnosis-fixtures.json');
const { createMockTeachingProvider } = require('../enhancement-v2/m2-demo-mock.cjs');
const { proposalFromMockDraft } = require('./m2-model-proposal-fixture.cjs');
const { MODEL_OUTPUT_PROTOCOL_VERSION, PROMPT_VERSION, validateModelProposal } =
  require('../enhancement-v2/m2-model-proposal.cjs');
const { buildFactPack, buildTeachingContext, validateTeachingDraft, projectPublicCard,
  assembleModelTeachingDraft } =
  require('../enhancement-v2/m2-teaching-contract.cjs');
const { generateTeachingCard, studentTeachingResponse, reviewTeachingCard } =
  require('../enhancement-v2/m2-teaching-generator.cjs');
const { createOpenRouterProvider, createAuthorizedLiveProvider, createQuotaTestSession, prepareOutputDirectory,
  estimatedCostUsd, normalizeUsage, ENDPOINT, DEFAULT_MODEL } =
  require('../enhancement-v2/m2-openrouter-provider.cjs');
const { runOfflineEvaluation, assertOutputDirectory, LIVE_TOKEN } =
  require('../enhancement-v2/m2-offline-evaluation.cjs');

const env = { OPENROUTER_API_KEY: 'fake-secret-for-tests' };
const input = (fixture = fixtures[0], requirementId = 'empty-cart') => ({ fixture,
  caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases', requirementIds: [requirementId] });
const usage = (prompt = 100) => ({ prompt_tokens: prompt, completion_tokens: 120,
  total_tokens: prompt + 120, prompt_tokens_details: { cached_tokens: Math.min(prompt, 20) }, cost: 0.0001,
  is_byok: false });
function responseFor(options, change = {}) {
  const body = JSON.parse(options.body);
  const request = JSON.parse(body.messages[1].content);
  const proposal = createMockTeachingProvider().generate(request);
  return Promise.resolve(proposal).then((draft) => {
    const modelProposal = proposalFromMockDraft(draft);
    const payload = { model: body.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(modelProposal) } }],
      usage: usage(), openrouter_metadata: { endpoints: { available: [{ provider: 'FakeHost', selected: true }] } },
      ...change };
    return new Response(JSON.stringify(payload), { status: 200 });
  });
}

test('OpenRouter request is bounded, non-thinking, structured and source-safe', async () => {
  let captured;
  const provider = createOpenRouterProvider({ env, fetchImpl: async (url, options) => {
    captured = { url, options }; return responseFor(options);
  } });
  const result = await generateTeachingCard(input(), provider);
  assert.equal(result.status, 'success');
  assert.deepEqual(studentTeachingResponse(result), { state: 'generated-pending-review' });
  assert.equal(reviewTeachingCard(result, 'synthetic-a-acceptance-approval').state, 'generated-pending-review');
  assert.equal(captured.url, ENDPOINT);
  assert.equal(captured.options.headers.Authorization, 'Bearer M2_FAKE_TRANSPORT_ONLY');
  assert.equal(captured.options.headers['X-OpenRouter-Metadata'], 'enabled');
  assert.equal(captured.options.redirect, 'error');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, DEFAULT_MODEL);
  assert.deepEqual(body.reasoning, { enabled: false });
  assert.equal('thinking' in body, false);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.provider.require_parameters, true);
  assert.equal(body.provider.allow_fallbacks, true);
  assert.deepEqual(body.provider.max_price, { prompt: 0.30, completion: 1.20 });
  assert.equal(body.max_completion_tokens, 1200);
  assert.match(body.messages[0].content, /untrusted data/);
  assert.match(body.messages[0].content, /JSON schema/);
  assert.match(body.messages[0].content, /application owns those source and authority fields/);
  assert.match(body.messages[0].content, /publicContent\.objective under 200 characters/);
  assert.match(body.messages[0].content, /internalProposal\.targetGap under 160/);
  assert.equal(body.response_format.json_schema.name, 'skillloop_model_proposal_v2');
  const schema = body.response_format.json_schema.schema;
  assert.equal(schema.properties.protocolVersion.const, MODEL_OUTPUT_PROTOCOL_VERSION);
  assert.equal(schema.properties.publicContent.properties.objective.maxLength, 240);
  assert.equal(schema.properties.publicContent.properties.explanation.maxLength, 1200);
  assert.equal(schema.properties.publicContent.properties.codeTracePrompt.maxLength, 300);
  assert.equal(schema.properties.publicContent.properties.exercise.properties.prompt.maxLength, 400);
  assert.equal(schema.properties.publicContent.properties.exercise.properties.publicHints.maxItems, 3);
  assert.equal(schema.properties.publicContent.properties.exercise.properties.publicHints.items.maxLength, 180);
  assert.equal(schema.properties.internalProposal.properties.targetGap.maxLength, 200);
  assert.equal(schema.properties.internalProposal.properties.expectedElements.items.maxLength, 240);
  assert.equal(schema.properties.internalProposal.properties.observableCriteria.items.maxLength, 240);
  assert.equal(schema.properties.internalProposal.properties.followUpPolicy.properties.correct.maxLength, 240);
  for (const forbidden of ['diagnosisEvidence', 'codeExample', 'requirementRefs', 'caseId', 'metadata'])
    assert.equal(JSON.stringify(schema).includes(`"${forbidden}"`), false);
  const request = JSON.parse(body.messages[1].content);
  assert.equal(request.target.requirementId, 'empty-cart');
  assert.equal(typeof request.target.evidence.quote, 'string');
  assert.equal(request.case.selectedTraceExcerpt, 'return total / count;');
  for (const privateName of ['referenceCode', 'hiddenAssertions', 'reviewId', 'internalAssessment'])
    assert.equal(body.messages[1].content.includes(`"${privateName}"`), false);
  assert.equal(body.messages[1].content.includes(env.OPENROUTER_API_KEY), false);
  const events = provider.drainTelemetry();
  assert.equal(events.length, 1);
  assert.equal(events[0].routedProvider, 'FakeHost');
  assert.equal(events[0].usage.cacheHitTokens, 20);
  assert.equal(events[0].usage.cacheMissTokens, 80);
  assert.equal(events[0].billedCostUsd, 0.0001);
  assert.equal(JSON.stringify(events).includes(env.OPENROUTER_API_KEY), false);
  assert.deepEqual(provider.drainTelemetry(), []);
});

test('model proposal cannot author evidence, identity or public code and remains pending review', async () => {
  const factPack = buildFactPack({ caseId: 'cart-checkout', caseVersion: 1,
    conceptId: 'edge-cases', requirementIds: ['empty-cart'] });
  const context = buildTeachingContext({ fixture: fixtures[0], factPack });
  const request = { case: { caseId: context.caseId, caseVersion: context.caseVersion,
    conceptId: context.conceptId }, target: { requirementId: 'empty-cart',
    evidence: { quote: context.diagnosis.evidence.quote } } };
  const mockDraft = await createMockTeachingProvider().generate(request);
  const proposal = proposalFromMockDraft(mockDraft);
  assert.equal(validateModelProposal(proposal), proposal);
  const { draft, sourceReference } = assembleModelTeachingDraft(proposal, context);
  assert.equal(draft.metadata.schemaVersion, 1);
  assert.equal(draft.metadata.promptVersion, PROMPT_VERSION);
  assert.equal(draft.internalAssessment.diagnosisEvidence, context.diagnosis.evidence.quote);
  assert.equal(draft.publicCard.requirementRefs[0], 'empty-cart');
  assert.equal(draft.publicCard.codeExample.excerpt,
    context.factPack.starterCode.slice(sourceReference.excerptStart,
      sourceReference.excerptStart + sourceReference.excerptLength));
  assert.equal(validateTeachingDraft(draft, context), draft);
  const publicCard = projectPublicCard(draft, context);
  assert.equal('internalAssessment' in publicCard, false);
  assert.equal(JSON.stringify(publicCard).includes(context.diagnosis.evidence.quote), false);
  for (const [field, value] of [['diagnosisEvidence', 'fabricated'],
    ['codeExample', { excerpt: 'return 999;' }], ['requirementRefs', ['discount']],
    ['caseId', 'other']]) {
    const invalid = structuredClone(proposal);
    invalid[field] = value;
    assert.throws(() => assembleModelTeachingDraft(invalid, context), /model proposal protocol/);
  }
  const verbose = structuredClone(proposal);
  verbose.publicContent.objective = 'x'.repeat(257);
  assert.throws(() => assembleModelTeachingDraft(verbose, context), /model-authored public content/);
  verbose.publicContent.objective = 'x'.repeat(240);
  verbose.internalProposal.targetGap = 'x'.repeat(251);
  assert.throws(() => assembleModelTeachingDraft(verbose, context), /model-authored assessment proposal/);
  verbose.internalProposal.targetGap = 'x'.repeat(200);
  assert.equal(validateTeachingDraft(assembleModelTeachingDraft(verbose, context).draft, context).publicCard.objective.length, 240);
  const leaked = structuredClone(proposal);
  leaked.publicContent.explanation = context.diagnosis.evidence.quote;
  assert.throws(() => assembleModelTeachingDraft(leaked, context), /Private diagnosis evidence/);
  assert.throws(() => assembleModelTeachingDraft(proposal, structuredClone(context)), /requires review/);
});

test('injected fake transport ignores configured keys; errors omit upstream bodies', async () => {
  let calls = 0;
  const noKey = createOpenRouterProvider({ env,
    fetchImpl: () => { calls++; throw new Error('must not call'); } });
  await assert.rejects(noKey.generate({}), { code: 'NETWORK_ERROR' });
  assert.equal(calls, 1);
  for (const [status, code] of [[401, 'AUTH_FAILED'], [403, 'ACCESS_DENIED'],
    [402, 'BUDGET_EXHAUSTED'], [404, 'MODEL_OR_ROUTE_UNAVAILABLE'], [400, 'PROVIDER_ERROR']]) {
    const provider = createOpenRouterProvider({ env, fetchImpl: async () =>
      new Response('fake-secret-for-tests upstream diagnostics', { status }) });
    await assert.rejects(provider.generate({ task: 'test' }), (error) =>
      error.code === code && !error.message.includes(env.OPENROUTER_API_KEY));
  }
});

test('rate limit and network error retry once; permanent content errors do not retry', async () => {
  let calls = 0;
  const rate = createOpenRouterProvider({ env, fetchImpl: async (_, options) => {
    calls++; return calls === 1 ? new Response('rate limit', { status: 429 }) : responseFor(options);
  } });
  assert.equal((await generateTeachingCard(input(), rate)).attempts, 2);
  assert.equal(calls, 2);
  assert.deepEqual(rate.drainTelemetry().map((e) => e.code), ['RATE_LIMITED', null]);
  calls = 0;
  const network = createOpenRouterProvider({ env, fetchImpl: async (_, options) => {
    calls++; if (calls === 1) throw new Error('fake-secret-for-tests network'); return responseFor(options);
  } });
  assert.equal((await generateTeachingCard(input(), network)).attempts, 2);
  assert.equal(calls, 2);
  const invalidCases = [
    (o) => responseFor(o, { choices: [{ finish_reason: 'stop', message: { content: '   ' } }] }),
    (o) => responseFor(o, { choices: [{ finish_reason: 'stop', message: { content: '{broken' } }] }),
    (o) => responseFor(o, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    (o) => responseFor(o, { usage: undefined }),
    (o) => responseFor(o, { model: 'another/model' }),
    () => Promise.resolve(new Response('x'.repeat(64001))),
  ];
  for (const respond of invalidCases) {
    let count = 0;
    const provider = createOpenRouterProvider({ env, fetchImpl: (_, options) => { count++; return respond(options); } });
    const result = await generateTeachingCard(input(), provider);
    assert.equal(result.status, 'provider-error'); assert.equal(count, 1);
    assert.deepEqual(studentTeachingResponse(result), { state: 'rejected' });
  }
});

test('unsupported draft reaches existing validators and cannot become student material', async () => {
  const provider = createOpenRouterProvider({ env, fetchImpl: async (_, options) => {
    const ordinary = await responseFor(options);
    const payload = await ordinary.json();
    const proposal = JSON.parse(payload.choices[0].message.content);
    proposal.publicContent.explanation = 'The empty-cart requirement is to return 999.';
    payload.choices[0].message.content = JSON.stringify(proposal);
    return new Response(JSON.stringify(payload));
  } });
  const result = await generateTeachingCard(input(), provider);
  assert.equal(result.status, 'invalid-output');
  assert.deepEqual(studentTeachingResponse(result), { state: 'rejected' });
});

test('fake transport cannot inject source-owned fields into model proposal', async () => {
  const provider = createOpenRouterProvider({ fetchImpl: async (_, options) => {
    const response = await responseFor(options);
    const payload = await response.json();
    const proposal = JSON.parse(payload.choices[0].message.content);
    proposal.diagnosisEvidence = 'fabricated';
    proposal.codeExample = { excerpt: 'return 999;' };
    payload.choices[0].message.content = JSON.stringify(proposal);
    return new Response(JSON.stringify(payload), { status: 200 });
  } });
  const result = await generateTeachingCard(input(), provider);
  assert.equal(result.status, 'invalid-output');
  assert.equal(result.publicCard, null);
  assert.deepEqual(studentTeachingResponse(result), { state: 'rejected' });
  const [event] = provider.drainTelemetry();
  assert.equal(event.status, 'success'); // Transport succeeded; application validation rejected it.
  assert.match(event.rawContent, /fabricated/);
});

test('transport abort settles for retry; ignored cancellation prevents overlap and late publish', async () => {
  let calls = 0;
  const cooperative = createOpenRouterProvider({ env, transportTimeoutMs: 5,
    fetchImpl: (_, options) => { calls++; return calls === 1 ? new Promise((_, reject) =>
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) : responseFor(options); } });
  const recovered = await generateTeachingCard(input(), cooperative, { timeoutMs: 50 });
  assert.equal(recovered.status, 'success'); assert.equal(recovered.attempts, 2); assert.equal(calls, 2);
  let resolveLate; calls = 0;
  const stubborn = createOpenRouterProvider({ env, transportTimeoutMs: 5,
    fetchImpl: () => { calls++; return new Promise((resolve) => { resolveLate = resolve; }); } });
  const failed = await generateTeachingCard(input(), stubborn, { timeoutMs: 12 });
  assert.equal(failed.status, 'provider-error'); assert.equal(calls, 1);
  assert.deepEqual(studentTeachingResponse(failed), { state: 'rejected' });
  resolveLate(new Response('{}'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(studentTeachingResponse(failed), { state: 'rejected' });
});

test('usage accounting separates cached tokens, billed cost and conservative estimate', () => {
  const normalized = normalizeUsage({ prompt_tokens: 100, completion_tokens: 50,
    total_tokens: 150, prompt_tokens_details: { cached_tokens: 40 }, cost: 0.00005, is_byok: false });
  assert.equal(normalized.cacheHitTokens, 40); assert.equal(normalized.cacheMissTokens, 60);
  assert.equal(estimatedCostUsd(normalized), (40 * 0.30 + 60 * 0.30 + 50 * 1.20) / 1000000);
  assert.throws(() => normalizeUsage({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }),
    { code: 'COST_UNVERIFIABLE' });
  assert.throws(() => normalizeUsage({ ...usage(), is_byok: true }), { code: 'COST_UNVERIFIABLE' });
});

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skillloop-m2-06a-'));
  try { return await callback(directory); }
  finally {
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unsafe cleanup target');
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('offline fake run records nine generations outside repo with blinded review worksheet', async () => {
  await withTempDirectory(async (directory) => {
    let calls = 0;
    const summary = await runOfflineEvaluation({ outputDirectory: directory, env, fetchImpl: (_, options) => {
      calls++; return responseFor(options);
    } });
    assert.equal(summary.status, 'ready-for-human-review');
    assert.equal(summary.completedGenerations, 9); assert.equal(summary.attemptedCalls, 9); assert.equal(calls, 9);
    const names = await fs.readdir(directory);
    assert.equal(names.filter((name) => name.endsWith('.json')).length, 12);
    const worksheet = JSON.parse(await fs.readFile(path.join(directory, `${summary.runId}-review-worksheet.json`)));
    const candidates = JSON.parse(await fs.readFile(path.join(directory, `${summary.runId}-review-candidates.json`)));
    const sourceMap = JSON.parse(await fs.readFile(path.join(directory, `${summary.runId}-source-map.json`)));
    assert.equal(worksheet.length, 13); assert.equal(candidates.length, 13); assert.equal(sourceMap.length, 13);
    assert.equal(JSON.stringify(worksheet).includes('model-proposal'), false);
    assert.equal(JSON.stringify(worksheet).includes('authored'), false);
    assert.equal(JSON.stringify(candidates).includes('fake-secret-for-tests'), false);
    assert.equal(JSON.stringify(candidates).includes('model-proposal'), false);
    assert.equal(JSON.stringify(candidates).includes('authored'), false);
    assert.equal(JSON.stringify(candidates).includes('"correct"'), false);
    assert.deepEqual(Object.keys(candidates[0]), Object.keys(candidates.at(-1)));
    assert.deepEqual(Object.keys(candidates[0].card), Object.keys(candidates.at(-1).card));
    assert.deepEqual(Object.keys(candidates[0].assessment), Object.keys(candidates.at(-1).assessment));
    assert.equal(Object.values(worksheet[0].dimensions).every((x) => x.score === null), true);
    const record = JSON.parse(await fs.readFile(path.join(directory, `${worksheet[0].candidateId}.json`)));
    assert.equal(record.humanReviewStatus, 'pending');
    assert.equal(record.model, DEFAULT_MODEL); assert.equal(record.promptVersion, PROMPT_VERSION);
    assert.equal(record.modelOutputProtocolVersion, MODEL_OUTPUT_PROTOCOL_VERSION);
    assert.equal(record.generationStatus, 'success'); assert.equal(record.attempts, 1);
    assert.equal(record.usage.cacheHitTokens, 20); assert.equal(record.billedCostUsd, 0.0001);
    assert.equal(record.internalDraft.internalAssessment.status, 'untrusted-proposal');
    assert.equal(JSON.stringify(record).includes(env.OPENROUTER_API_KEY), false);
    assert.deepEqual(record.rawResponses.length, 1);
    const modelRecords = await Promise.all(names.filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))
      .map(async (name) => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))));
    assert.deepEqual(new Set(modelRecords.map((item) => item.scenario)),
      new Set(['student-a', 'student-b', 'reviewed-paraphrase']));
    for (const item of modelRecords) {
      const excerpt = item.scenario === 'student-b'
        ? 'return total * (1 - discountPercent / 100);' : 'return total / count;';
      assert.equal(item.internalDraft.publicCard.codeExample.excerpt, excerpt);
      assert.equal(item.internalDraft.evaluationTrace.sourceReference.excerptLength, excerpt.length);
      assert.equal(item.internalDraft.internalAssessment.diagnosisEvidence,
        item.internalDraft.evaluationTrace.evidenceQuote);
      assert.equal(item.internalDraft.evaluationTrace.modelOutputProtocolVersion, 2);
      assert.equal(item.internalDraft.reviewStatus, 'human-review-required');
    }
  });
});

test('live mode is gated before network; missing usage and budget failures stop fake runner', async () => {
  await withTempDirectory(async (directory) => {
    let calls = 0;
    await assert.rejects(runOfflineEvaluation({ mode: 'live', outputDirectory: directory,
      env: { ...env }, fetchImpl: () => { calls++; throw new Error('network'); } }), /explicit opt-in/);
    assert.equal(calls, 0);
    await assert.rejects(runOfflineEvaluation({ outputDirectory: directory, env }), /injected fake fetch/);
    await assert.rejects(runOfflineEvaluation({ outputDirectory: directory, env,
      fetchImpl: globalThis.fetch }), /injected fake fetch/);
    assert.equal(calls, 0);
  });
  assert.throws(() => createOpenRouterProvider({ env: {},
    fetchImpl: globalThis.fetch }), { code: 'INVALID_CONFIGURATION' });
  await withTempDirectory(async (directory) => {
    let calls = 0;
    const stopped = await runOfflineEvaluation({ outputDirectory: directory, env,
      budgetUsd: 0.05, fetchImpl: () => { calls++; throw new Error('network'); } });
    assert.equal(stopped.stopReason, 'budget-reservation'); assert.equal(calls, 0);
  });
  await withTempDirectory(async (directory) => {
    let calls = 0;
    const stopped = await runOfflineEvaluation({ outputDirectory: directory, env,
      fetchImpl: (_, options) => { calls++; return responseFor(options, { usage: undefined }); } });
    assert.equal(stopped.stopReason, 'usage-or-cost-unverifiable'); assert.equal(calls, 1);
    assert.equal(stopped.completedGenerations, 1);
  });
  assert.throws(() => assertOutputDirectory(process.cwd()), /outside the repository/);
  assert.equal(typeof LIVE_TOKEN, 'string');
});

test('fake transport runs without an API key or global fetch; alternate model needs a price ceiling', async () => {
  const provider = createOpenRouterProvider({ env: {}, fakeTransport: true,
    fetchImpl: (_, options) => responseFor(options) });
  assert.equal((await generateTeachingCard(input(), provider)).status, 'success');
  await withTempDirectory(async (directory) => {
    const summary = await runOfflineEvaluation({ outputDirectory: directory, env: {}, repetitions: 1,
      fetchImpl: (_, options) => responseFor(options) });
    assert.equal(summary.completedGenerations, 3);
  });
  await withTempDirectory(async (directory) => {
    await assert.rejects(runOfflineEvaluation({ outputDirectory: directory, env: {},
      model: 'another/model', fetchImpl: (_, options) => responseFor(options) }), /verified price/);
  });
  const alternate = createOpenRouterProvider({ env: {}, fakeTransport: true, model: 'another/model',
    priceCeiling: { prompt: 0.5, cacheRead: 0.5, completion: 2 },
    fetchImpl: (_, options) => responseFor(options) });
  assert.equal((await generateTeachingCard(input(), alternate)).status, 'success');
});

test('input usage threshold and unexpected routed cost stop before subsequent fake calls', async () => {
  await withTempDirectory(async (directory) => {
    let calls = 0;
    const summary = await runOfflineEvaluation({ outputDirectory: directory, env: {},
      fetchImpl: (_, options) => { calls++; return responseFor(options, { usage: usage(6001) }); } });
    assert.equal(summary.stopReason, 'input-token-threshold'); assert.equal(calls, 1);
  });
  await withTempDirectory(async (directory) => {
    let calls = 0;
    const summary = await runOfflineEvaluation({ outputDirectory: directory, env: {},
      fetchImpl: (_, options) => { calls++; return responseFor(options, { usage: { ...usage(), cost: 0.5 } }); } });
    assert.equal(summary.stopReason, 'pricing-exceeded'); assert.equal(calls, 1);
  });
});

test('public provider is offline by default even with a key or forged live flags', async () => {
  let calls = 0;
  const provider = createOpenRouterProvider({ env: { ...env, SKILLLOOP_M2_LIVE_OPT_IN: LIVE_TOKEN },
    live: true, approved: true, fetchImpl: (_, options) => { calls++; return responseFor(options); } });
  assert.equal((await generateTeachingCard(input(), provider)).status, 'success');
  assert.equal(calls, 1);
  assert.throws(() => createOpenRouterProvider({ env, live: true, fetchImpl: globalThis.fetch }),
    { code: 'INVALID_CONFIGURATION' });
  assert.throws(() => createOpenRouterProvider({ env, live: true }),
    { code: 'INVALID_CONFIGURATION' });
  await withTempDirectory(async (directory) => {
    await assert.rejects(createAuthorizedLiveProvider({ env, outputDirectory: directory,
      liveOptIn: LIVE_TOKEN }), /explicit opt-in/);
    await assert.rejects(createAuthorizedLiveProvider({ env: { ...env, SKILLLOOP_M2_LIVE_OPT_IN: LIVE_TOKEN },
      outputDirectory: directory, liveOptIn: LIVE_TOKEN }), /explicit opt-in/);
  });
});

test('truncated billable response rejects output while retaining usage and cost', async () => {
  const provider = createOpenRouterProvider({ fetchImpl: (_, options) => responseFor(options,
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) });
  const result = await generateTeachingCard(input(), provider);
  assert.equal(result.status, 'provider-error');
  assert.deepEqual(studentTeachingResponse(result), { state: 'rejected' });
  assert.equal(result.attempts, 1);
  const [event] = provider.drainTelemetry();
  assert.equal(event.code, 'TRUNCATED_RESPONSE');
  assert.equal(event.usage.inputTokens, 100);
  assert.equal(event.billedCostUsd, 0.0001);
});

test('HTTP error retains valid billing; malformed and missing billing remain uncertain', async () => {
  const billable = createOpenRouterProvider({ fetchImpl: async () =>
    new Response(JSON.stringify({ usage: usage() }), { status: 429 }) });
  await assert.rejects(billable.generate({ task: 'probe' }), { code: 'RATE_LIMITED' });
  assert.equal(billable.drainTelemetry()[0].billedCostUsd, 0.0001);
  for (const bad of [undefined, { ...usage(), cost: -1 },
    { ...usage(), total_tokens: 999 }, { ...usage(), cost: Infinity }]) {
    const provider = createOpenRouterProvider({ strictBilling: true, fetchImpl: async () =>
      new Response(JSON.stringify({ usage: bad }), { status: 429 }) });
    await assert.rejects(provider.generate({ task: 'probe' }),
      { code: 'COST_UNVERIFIABLE' });
    assert.equal(provider.drainTelemetry()[0].billedCostUsd, null);
  }
});

test('runner counts a billable retry exactly once per attempt', async () => {
  await withTempDirectory(async (directory) => {
    let calls = 0;
    const summary = await runOfflineEvaluation({ outputDirectory: directory, env: {},
      fetchImpl: (_, options) => {
        calls++;
        return calls === 1 ? new Response(JSON.stringify({ usage: usage() }), { status: 429 }) :
          responseFor(options);
      } });
    assert.equal(summary.completedGenerations, 9);
    assert.equal(summary.attemptedCalls, 10);
    assert.ok(Math.abs(summary.billedCostUsd - 0.001) < 1e-12);
    const names = (await fs.readdir(directory)).filter((name) => /^[0-9a-f-]{36}\.json$/.test(name));
    const records = await Promise.all(names.map(async (name) => JSON.parse(await fs.readFile(path.join(directory, name)))));
    const retried = records.find((record) => record.attempts === 2);
    assert.equal(retried.billedCostUsd, 0.0002);
    assert.equal(retried.attemptBilling.length, 2);
  });
});

test('unresolved potentially billable timeout stops the run and counts its attempt', async () => {
  await withTempDirectory(async (directory) => {
    let calls = 0;
    const summary = await runOfflineEvaluation({ outputDirectory: directory, env: {},
      transportTimeoutMs: 5, outerTimeoutMs: 12,
      fetchImpl: () => { calls++; return new Promise(() => {}); } });
    assert.equal(summary.stopReason, 'usage-or-cost-unverifiable');
    assert.equal(summary.attemptedCalls, 1);
    assert.equal(summary.billedCostUsd, null);
    assert.equal(calls, 1);
  });
});

test('storage preflight rejects repository paths, traversal and symlink redirection', async () => {
  await assert.rejects(prepareOutputDirectory(process.cwd()), /outside the repository/);
  await assert.rejects(prepareOutputDirectory(os.tmpdir() + path.sep + '..' + path.sep + 'm2-output'),
    /Absolute offline directory required/);
  await withTempDirectory(async (directory) => {
    const target = path.join(directory, 'target');
    const link = path.join(directory, 'redirect');
    await fs.mkdir(target);
    await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(prepareOutputDirectory(link), /Unsafe evaluation directory component/);
  });
});

test('authorized live construction validates storage without invoking transport', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('network forbidden in test'); };
  try {
    const liveEnv = { OPENROUTER_API_KEY: 'synthetic-test-only',
      SKILLLOOP_M2_LIVE_OPT_IN: LIVE_TOKEN, SKILLLOOP_M2_ACCOUNT_CAP_USD: '1',
      SKILLLOOP_M2_PRICE_VERIFIED_DATE: new Date().toISOString().slice(0, 10) };
    await assert.rejects(createAuthorizedLiveProvider({ env: liveEnv, liveOptIn: LIVE_TOKEN,
      outputDirectory: process.cwd() }), /outside the repository/);
    await assert.rejects(createAuthorizedLiveProvider({ env: { ...liveEnv,
      SKILLLOOP_M2_ACCOUNT_CAP_USD: 'unverified' }, liveOptIn: LIVE_TOKEN,
      outputDirectory: os.tmpdir() }), /explicit opt-in/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('R2 authorized factory blocks the former 19-call exploit and session reset', () => {
  // Child-process shim supplies only synthetic ACL evidence and a fake global fetch.
  // No file or network is created; the real exported factory and session run unchanged.
  const script = `
    const cp=require('node:child_process'), u=require('node:util');
    const acl=JSON.stringify({owner:'S-1-5-21-TEST',user:'S-1-5-21-TEST',rules:[]});
    cp.execFile=(_f,_a,_o,cb)=>cb(null,acl,'');
    cp.execFile[u.promisify.custom]=async()=>({stdout:acl,stderr:''});
    let calls=0;
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({usage:{prompt_tokens:100,
      completion_tokens:120,total_tokens:220,cost:0.0001}}),{status:429})};
    const m=require('./enhancement-v2/m2-openrouter-provider.cjs');
    const {fixtures}=require('./enhancement-v2/m2-preflight/diagnosis-fixtures.json');
    const env={OPENROUTER_API_KEY:'synthetic-only',SKILLLOOP_M2_LIVE_OPT_IN:m.LIVE_TOKEN,
      SKILLLOOP_M2_ACCOUNT_CAP_USD:'1',SKILLLOOP_M2_PRICE_VERIFIED_DATE:new Date().toISOString().slice(0,10)};
    (async()=>{const config={env,liveOptIn:m.LIVE_TOKEN,outputDirectory:require('node:os').tmpdir()};
      const {session,provider}=await m.createAuthorizedLiveProvider(config);
      let denied=null;
      for(let i=0;i<10;i++)try{await session.generateTeachingCard({fixture:fixtures[0],
        caseId:'cart-checkout',caseVersion:1,conceptId:'edge-cases',requirementIds:['empty-cart']})}
      catch(e){denied=e.code}
      let reset=null;try{await m.createAuthorizedLiveProvider(config)}catch(e){reset=e.code}
      console.log(JSON.stringify({calls,denied,reset,providerExposed:provider!==undefined,
        snapshot:session.snapshot()}));})().catch(e=>{console.error(e.message);process.exitCode=1});`;
  const result = JSON.parse(execFileSync(process.execPath, ['-e', script],
    { cwd: path.resolve(process.cwd()), encoding: 'utf8' }));
  assert.equal(result.calls, 18);
  assert.equal(result.denied, 'SESSION_EXHAUSTED');
  assert.equal(result.reset, 'SESSION_ALREADY_CLAIMED');
  assert.equal(result.providerExposed, false);
  assert.equal(result.snapshot.generations, 9);
  assert.equal(result.snapshot.attempts, 18);
});

test('R2 tiny budget reserves before transport and snapshot mutation cannot reset quota', async () => {
  let calls = 0;
  const session = createQuotaTestSession({ budgetUsd: 0.00001,
    fetchImpl: () => { calls++; throw new Error('transport must not start'); } });
  const result = await session.generateTeachingCard(input());
  assert.equal(result.status, 'provider-error');
  assert.equal(calls, 0);
  const snapshot = session.snapshot();
  snapshot.attempts = 0; snapshot.budgetUsd = 100; snapshot.terminal = false;
  assert.equal(session.snapshot().budgetUsd, 0.00001);
  assert.equal(session.snapshot().attempts, 0);
  assert.equal(Object.isFrozen(session), true);
});

test('R2 unknown cost makes session terminal and retains reservation', async () => {
  let calls = 0;
  const session = createQuotaTestSession({ fetchImpl: async () => {
    calls++; return new Response('upstream diagnostic', { status: 429 });
  } });
  const result = await session.generateTeachingCard(input());
  assert.equal(result.status, 'provider-error');
  assert.equal(calls, 1);
  assert.equal(session.snapshot().terminal, true);
  assert.equal(session.snapshot().outstandingAttempts, 1);
  assert.ok(session.snapshot().reservedUsd > 0);
  assert.throws(() => session.generateTeachingCard(input()), { code: 'SESSION_EXHAUSTED' });
  assert.equal(calls, 1);
});

test('R2 concurrent generations cannot over-reserve the final budget', async () => {
  let firstCalls = 0;
  const probe = createQuotaTestSession({ fetchImpl: async (_, options) => {
    firstCalls++; return responseFor(options);
  } });
  await probe.generateTeachingCard(input());
  const oneReservation = probe.drainTelemetry()[0];
  assert.equal(firstCalls, 1);
  // The conservative reservation is larger than this reported cost. Discover it
  // from a pending fake request in the next session, then compete for 1.5 slots.
  let resolvePending;
  const measuring = createQuotaTestSession({ fetchImpl: () => new Promise((resolve) => {
    resolvePending = resolve;
  }), transportTimeoutMs: 5, outerTimeoutMs: 12 });
  const pending = measuring.generateTeachingCard(input());
  while (!resolvePending) await new Promise((resolve) => setImmediate(resolve));
  const amount = measuring.snapshot().reservedUsd;
  assert.ok(amount > oneReservation.billedCostUsd);
  await pending;
  resolvePending(new Response('{}'));
  let calls = 0;
  const session = createQuotaTestSession({ budgetUsd: amount * 1.5,
    transportTimeoutMs: 5, outerTimeoutMs: 12,
    fetchImpl: () => { calls++; return new Promise(() => {}); } });
  await Promise.all([session.generateTeachingCard(input()), session.generateTeachingCard(input())]);
  assert.equal(calls, 1);
  assert.equal(session.snapshot().attempts, 1);
  assert.equal(session.snapshot().terminal, true);
});

test('R2 known-cost retry uses one generation and two attempt slots', async () => {
  let calls = 0;
  const session = createQuotaTestSession({ fetchImpl: (_, options) => {
    calls++;
    return calls === 1 ? new Response(JSON.stringify({ usage: usage() }), { status: 429 }) :
      responseFor(options);
  } });
  const result = await session.generateTeachingCard(input());
  assert.equal(result.status, 'success');
  assert.deepEqual(studentTeachingResponse(result), { state: 'generated-pending-review' });
  assert.equal(calls, 2);
  assert.equal(session.snapshot().generations, 1);
  assert.equal(session.snapshot().attempts, 2);
  assert.ok(Math.abs(session.snapshot().knownSpentUsd - 0.0002) < 1e-12);
  assert.equal(session.drainTelemetry().length, 2);
});

test('R2 concurrent callers cannot pass nine generations or eighteen attempts', async () => {
  let calls = 0;
  const session = createQuotaTestSession({ fetchImpl: async () => {
    calls++; return new Response(JSON.stringify({ usage: usage() }), { status: 429 });
  } });
  const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
    Promise.resolve().then(() => session.generateTeachingCard(input()))));
  assert.equal(settled.filter((item) => item.status === 'rejected').length, 1);
  assert.equal(settled.find((item) => item.status === 'rejected').reason.code, 'SESSION_EXHAUSTED');
  assert.equal(session.snapshot().generations, 9);
  assert.equal(session.snapshot().attempts, 18);
  assert.equal(calls, 18);
});

test('R2 late billable settlement never reopens a timed-out session', async () => {
  let resolveLate; let optionsLate; let calls = 0;
  const session = createQuotaTestSession({ transportTimeoutMs: 5, outerTimeoutMs: 12,
    fetchImpl: (_, options) => { calls++; optionsLate = options;
      return new Promise((resolve) => { resolveLate = resolve; }); } });
  const result = await session.generateTeachingCard(input());
  assert.equal(result.status, 'provider-error');
  assert.deepEqual(studentTeachingResponse(result), { state: 'rejected' });
  assert.equal(session.snapshot().terminal, true);
  assert.equal(session.snapshot().outstandingAttempts, 1);
  resolveLate(await responseFor(optionsLate));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.snapshot().terminal, true);
  assert.equal(session.snapshot().attempts, 1);
  assert.throws(() => session.generateTeachingCard(input()), { code: 'SESSION_EXHAUSTED' });
  assert.equal(calls, 1);
});
