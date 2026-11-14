/** Local, reviewed legacy runner registry. This is not an API authorization boundary. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const RUNNER_PATH = path.resolve(__dirname, '../correction-lab/levels.js');
const REVIEWED_SHA256 = '3d56a460006b29d70ac9fcc95a7a192a92478001da93d9ef7f5d25a236fdb404';
const REVIEWED_TEST_IDS = Object.freeze({
  'cart-checkout@1': ['normal-total', 'normal-discount', 'full-discount', 'reject-negative', 'reject-fraction', 'discount-range', 'empty-average', 'normal-average'],
  'quiz-permissions@1': ['admin-delete', 'student-denied', 'guest-denied'],
  'notes-save@1': ['pending-state', 'successful-save', 'failure-preserves-draft', 'retry-save'],
});

function verifiedInventory() {
  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  const actualHash = createHash('sha256').update(source).digest('hex');
  if (actualHash !== REVIEWED_SHA256) throw new Error('Reviewed runner source changed');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: RUNNER_PATH, timeout: 1000 });
  return context.window.SkillLoopLevels;
}

function hasTrustedRunner(definition) {
  const key = `${definition.caseId}@${definition.caseVersion}`;
  if (key === 'retry-queue@1') {
    const file = require.resolve('./m5-retry-runner.cjs');
    const source = fs.readFileSync(file, 'utf8');
    if (createHash('sha256').update(source).digest('hex') !== 'f43b94f1e73c440057a71137d66d3dca26e8372cf4491d37ad558e24c3cff42f')
      throw new Error('Reviewed retry runner source changed');
    const { level } = require(file);
    const ids = ['ordinary-retry', 'retry-cap', 'invalid-retry'];
    return JSON.stringify(level.checks.map((check) => check.testId)) === JSON.stringify(ids) &&
      JSON.stringify(definition.publicTests.map((test) => test.testId)) === JSON.stringify(ids);
  }
  const registered = REVIEWED_TEST_IDS[key];
  if (!registered) return false;
  const runner = verifiedInventory()?.[definition.caseId];
  return !!(runner?.fns?.length && runner?.checks?.length && runner.repair && runner.detectors &&
    JSON.stringify(Array.from(runner.checks, (check) => check.testId)) === JSON.stringify(registered) &&
    JSON.stringify(definition.publicTests.map((test) => test.testId)) === JSON.stringify(registered));
}

module.exports = { hasTrustedRunner, verifiedInventory };
