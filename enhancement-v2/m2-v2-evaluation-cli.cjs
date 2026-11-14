/** Explicit one-call B or paraphrase continuation after the v2 Student A smoke. */
const { LIVE_TOKEN } = require('./m2-offline-evaluation.cjs');
const { runGoalSingle, readLedger, V2_SMOKE_CAMPAIGN_ID, V2_SMOKE_OPT_IN } =
  require('./m2-goal-runner.cjs');
const { assertOutputDirectory } = require('./m2-openrouter-provider.cjs');

async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 5 || args[0] !== '--live' || args[1] !== '--scenario' ||
      !['student-b', 'reviewed-paraphrase'].includes(args[2]) || args[3] !== '--output-dir')
    throw new Error('Usage: m2-v2-evaluation-cli.cjs --live --scenario student-b|reviewed-paraphrase --output-dir ABSOLUTE_EXTERNAL_DIRECTORY');
  if (env.SKILLLOOP_M2_LIVE_OPT_IN !== LIVE_TOKEN ||
      env.SKILLLOOP_M2_V2_SMOKE_OPT_IN !== V2_SMOKE_OPT_IN)
    throw new Error('Explicit v2 experiment opt-in is required');
  const directory = assertOutputDirectory(args[4]);
  const before = await readLedger(directory, V2_SMOKE_CAMPAIGN_ID);
  if (before.scenarioCounts['student-a'] !== 1 ||
      before.scenarioOutcomes['student-a'][0] !== 'success')
    throw new Error('A validated v2 Student A smoke is required first');
  const result = await runGoalSingle({ mode: 'live', scenario: args[2],
    campaignId: V2_SMOKE_CAMPAIGN_ID, outputDirectory: directory, env });
  console.log(JSON.stringify({ status: result.status, stopReason: result.stopReason,
    plannedGenerations: result.plannedGenerations, completedGenerations: result.completedGenerations,
    attemptedCalls: result.attemptedCalls, billedCostUsd: result.billedCostUsd,
    outputDirectory: result.outputDirectory, runId: result.runId,
    cumulative: result.cumulative, preflight: result.preflight }));
}

if (require.main === module) main().catch((error) => {
  console.error(error.code || 'V2_EVALUATION_PREFLIGHT_FAILED');
  process.exitCode = 1;
});

module.exports = { main };
