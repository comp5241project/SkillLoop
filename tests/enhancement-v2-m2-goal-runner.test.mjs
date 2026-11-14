import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createMockTeachingProvider } = require('../enhancement-v2/m2-demo-mock.cjs');
const { proposalFromMockDraft } = require('./m2-model-proposal-fixture.cjs');
const { runGoalSingle, readLedger, V2_SMOKE_CAMPAIGN_ID } =
  require('../enhancement-v2/m2-goal-runner.cjs');
const { main: v2SmokeCli } = require('../enhancement-v2/m2-v2-smoke-cli.cjs');
const { main: v2EvaluationCli } = require('../enhancement-v2/m2-v2-evaluation-cli.cjs');

async function inTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skillloop-m2-goal-'));
  try { return await run(directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function fakeSuccess(_, options) {
  const body = JSON.parse(options.body);
  const request = JSON.parse(body.messages[1].content);
  const draft = await createMockTeachingProvider().generate(request);
  const proposal = proposalFromMockDraft(draft);
  return new Response(JSON.stringify({ model: body.model, choices: [
    { finish_reason: 'stop', message: { content: JSON.stringify(proposal) } }],
  usage: { prompt_tokens: 100, completion_tokens: 120, total_tokens: 220,
    prompt_tokens_details: { cached_tokens: 20 }, cost: 0.0001 } }), { status: 200 });
}

test('protected ledger survives new sessions and caps nine generations and three per scenario', async () => {
  await inTempDirectory(async (outputDirectory) => {
    let calls = 0;
    for (const scenario of ['student-a', 'student-b', 'reviewed-paraphrase']) {
      for (let i = 0; i < 3; i++) {
        const result = await runGoalSingle({ mode: 'fake', scenario, outputDirectory,
          env: {}, fetchImpl: (...args) => { calls++; return fakeSuccess(...args); } });
        assert.equal(result.attemptedCalls, 1);
        assert.equal(result.status, 'ready-for-human-review');
      }
    }
    assert.equal(calls, 9);
    const ledger = await readLedger(outputDirectory);
    assert.equal(ledger.generations, 9);
    assert.equal(ledger.attempts, 9);
    assert.ok(Math.abs(ledger.spentUsd - 0.0009) < 1e-12);
    assert.deepEqual(Object.values(ledger.scenarioCounts), [3, 3, 3]);
    await assert.rejects(runGoalSingle({ mode: 'fake', scenario: 'student-a', outputDirectory,
      env: {}, fetchImpl: () => { calls++; throw new Error('unexpected call'); } }),
    { code: 'EXPERIMENT_LIMIT_REACHED' });
    assert.equal(calls, 9);
    assert.equal((await fs.readdir(outputDirectory)).includes('.m2-06b-real-evaluation.lock'), false);
  });
});

test('concurrent processes cannot claim the same ledger slot', async () => {
  await inTempDirectory(async (outputDirectory) => {
    let calls = 0;
    const work = () => runGoalSingle({ mode: 'fake', scenario: 'student-a',
      outputDirectory, env: {}, fetchImpl: (...args) => { calls++; return fakeSuccess(...args); } });
    const results = await Promise.allSettled([work(), work()]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(calls, 1);
    assert.equal((await readLedger(outputDirectory)).generations, 1);
  });
});

test('unknown billing preserves lock and blocks restart', async () => {
  await inTempDirectory(async (outputDirectory) => {
    let calls = 0;
    await assert.rejects(runGoalSingle({ mode: 'fake', scenario: 'student-a',
      outputDirectory, env: {}, fetchImpl: async () => {
        calls++; return new Response('{}', { status: 429 });
      } }), { code: 'EXPERIMENT_LEDGER_UNVERIFIABLE' });
    assert.equal(calls, 1);
    assert.equal((await fs.readdir(outputDirectory)).includes('.m2-06b-real-evaluation.lock'), true);
    await assert.rejects(runGoalSingle({ mode: 'fake', scenario: 'student-a',
      outputDirectory, env: {}, fetchImpl: async () => { calls++; return fakeSuccess(); } }));
    assert.equal(calls, 1);
  });
});

test('v2 campaign keeps prior cost, requires A first and allows one call per scenario', async () => {
  await assert.rejects(v2SmokeCli([], {}), /Usage:/);
  await assert.rejects(v2SmokeCli(['--live', '--output-dir', 'unused'], {}), /opt-in/);
  await assert.rejects(v2EvaluationCli([], {}), /Usage:/);
  await assert.rejects(v2EvaluationCli(['--live', '--scenario', 'student-b', '--output-dir', 'unused'], {}), /opt-in/);
  await inTempDirectory(async (outputDirectory) => {
    await assert.rejects(runGoalSingle({ mode: 'live', scenario: 'student-a',
      campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory,
      env: { SKILLLOOP_M2_LIVE_OPT_IN: 'RUN_M2_06_PAID_EXPERIMENT' } }),
    { code: 'V2_SMOKE_OPT_IN_REQUIRED' });
    let calls = 0;
    const fetchImpl = (...args) => { calls++; return fakeSuccess(...args); };
    for (let i = 0; i < 3; i++)
      await runGoalSingle({ mode: 'fake', scenario: 'student-a',
        outputDirectory, env: {}, fetchImpl });
    await assert.rejects(runGoalSingle({ mode: 'fake', scenario: 'student-a',
      outputDirectory, env: {}, fetchImpl }), { code: 'EXPERIMENT_LIMIT_REACHED' });
    await assert.rejects(runGoalSingle({ mode: 'fake', scenario: 'student-b',
      campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory, env: {}, fetchImpl }),
    { code: 'V2_A_NOT_VALIDATED' });
    const next = await runGoalSingle({ mode: 'fake', scenario: 'student-a',
      campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory, env: {}, fetchImpl });
    assert.equal(next.attemptedCalls, 1);
    assert.equal(next.cumulative.generations, 1);
    assert.ok(Math.abs(next.cumulative.spentUsd - 0.0004) < 1e-12);
    assert.equal(calls, 4);
    await assert.rejects(runGoalSingle({ mode: 'fake', scenario: 'student-a',
      campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory, env: {}, fetchImpl }),
    { code: 'EXPERIMENT_LIMIT_REACHED' });
    for (const scenario of ['student-b', 'reviewed-paraphrase']) {
      const result = await runGoalSingle({ mode: 'fake', scenario,
        campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory, env: {}, fetchImpl });
      assert.equal(result.attemptedCalls, 1);
    }
    assert.equal(calls, 6);
    const ledger = await readLedger(outputDirectory, V2_SMOKE_CAMPAIGN_ID);
    assert.equal(ledger.generations, 3);
    assert.equal(ledger.attempts, 3);
    assert.deepEqual(Object.values(ledger.scenarioCounts), [1, 1, 1]);
    assert.ok(Math.abs(ledger.spentUsd - 0.0006) < 1e-12);
    await assert.rejects(runGoalSingle({ mode: 'fake', scenario: 'student-b',
      campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory, env: {}, fetchImpl }),
    { code: 'EXPERIMENT_LIMIT_REACHED' });
    assert.equal(calls, 6);
  });
});
