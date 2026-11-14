/** Explicit one-call M2-06B entrypoint. Importing initiates no network or artifact write. */
const { LIVE_TOKEN } = require('./m2-offline-evaluation.cjs');
const { runGoalSingle } = require('./m2-goal-runner.cjs');

async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 3 || args[0] !== '--live' || args[1] !== '--output-dir')
    throw new Error('Usage: m2-smoke-cli.cjs --live --output-dir ABSOLUTE_EXTERNAL_DIRECTORY');
  if (env.SKILLLOOP_M2_LIVE_OPT_IN !== LIVE_TOKEN)
    throw new Error('Explicit live opt-in is required');
  const result = await runGoalSingle({ mode: 'live', scenario: 'student-a',
    outputDirectory: args[2], env });
  // The candidate and raw response stay in the private output directory.
  console.log(JSON.stringify({ status: result.status, stopReason: result.stopReason,
    plannedGenerations: result.plannedGenerations, completedGenerations: result.completedGenerations,
    attemptedCalls: result.attemptedCalls, billedCostUsd: result.billedCostUsd,
    outputDirectory: result.outputDirectory, runId: result.runId,
    cumulative: result.cumulative, preflight: result.preflight }));
}

if (require.main === module) main().catch((error) => {
  console.error(error.code || 'SMOKE_PREFLIGHT_FAILED');
  process.exitCode = 1;
});

module.exports = { main };
