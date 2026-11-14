/** Prepared one-call v2 smoke. A future explicit paid-call authorization is required. */
const { LIVE_TOKEN } = require('./m2-offline-evaluation.cjs');
const { runGoalSingle, V2_SMOKE_CAMPAIGN_ID, V2_SMOKE_OPT_IN } =
  require('./m2-goal-runner.cjs');

async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 3 || args[0] !== '--live' || args[1] !== '--output-dir')
    throw new Error('Usage: m2-v2-smoke-cli.cjs --live --output-dir ABSOLUTE_EXTERNAL_DIRECTORY');
  if (env.SKILLLOOP_M2_LIVE_OPT_IN !== LIVE_TOKEN ||
      env.SKILLLOOP_M2_V2_SMOKE_OPT_IN !== V2_SMOKE_OPT_IN)
    throw new Error('Explicit v2 smoke opt-in is required');
  const result = await runGoalSingle({ mode: 'live', scenario: 'student-a',
    campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory: args[2], env });
  console.log(JSON.stringify({ status: result.status, stopReason: result.stopReason,
    plannedGenerations: result.plannedGenerations, completedGenerations: result.completedGenerations,
    attemptedCalls: result.attemptedCalls, billedCostUsd: result.billedCostUsd,
    outputDirectory: result.outputDirectory, runId: result.runId,
    cumulative: result.cumulative, preflight: result.preflight }));
}

if (require.main === module) main().catch((error) => {
  console.error(error.code || 'V2_SMOKE_PREFLIGHT_FAILED');
  process.exitCode = 1;
});

module.exports = { main, V2_SMOKE_OPT_IN };
