/** Explicit one-generation continuation for the bounded M2-06B evaluation. */
const { LIVE_TOKEN } = require('./m2-offline-evaluation.cjs');
const { runGoalSingle } = require('./m2-goal-runner.cjs');

async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 5 || args[0] !== '--live' || args[1] !== '--scenario' ||
      args[3] !== '--output-dir' ||
      !['student-a', 'student-b', 'reviewed-paraphrase'].includes(args[2]))
    throw new Error('Usage: m2-evaluation-cli.cjs --live --scenario student-a|student-b|reviewed-paraphrase --output-dir ABSOLUTE_EXTERNAL_DIRECTORY');
  if (env.SKILLLOOP_M2_LIVE_OPT_IN !== LIVE_TOKEN)
    throw new Error('Explicit live opt-in is required');
  const result = await runGoalSingle({ mode: 'live', scenario: args[2],
    outputDirectory: args[4], env });
  console.log(JSON.stringify({ status: result.status, stopReason: result.stopReason,
    plannedGenerations: result.plannedGenerations, completedGenerations: result.completedGenerations,
    attemptedCalls: result.attemptedCalls, billedCostUsd: result.billedCostUsd,
    outputDirectory: result.outputDirectory, runId: result.runId,
    cumulative: result.cumulative, preflight: result.preflight }));
}

if (require.main === module) main().catch((error) => {
  console.error(error.code || 'EVALUATION_PREFLIGHT_FAILED');
  process.exitCode = 1;
});

module.exports = { main };
