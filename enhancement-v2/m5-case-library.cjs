const path = require('node:path');
const { convertLegacyCatalog } = require('./legacy-adapter.cjs');
const { studentView, validateDefinition } = require('./case-contract.cjs');
const { verifiedInventory, hasTrustedRunner } = require('./trusted-runner-registry.cjs');
const diagnosisData = require('../learning-path/data.js');
const { createMockTeachingProvider } = require('./m2-demo-mock.cjs');
const fourth = require('./m5-retry-queue.json');

const root = path.resolve(__dirname, '..');
const legacyTeaching = {
  'cart-checkout': {
    conceptId: 'edge-cases',
    templateProvider: createMockTeachingProvider(),
    targets: [{
      questionId: 'cart-checkout-code-reading', requirementId: 'empty-cart', issueId: 'empty-cart',
      explanation: 'On an empty cart both the accumulated total and count are zero. JavaScript evaluates 0 / 0 as NaN. Trace the empty input separately from a normal weighted average. The contract requires a numeric zero.',
      excerpt: 'return total / count;',
      practice: { prompt: 'What must averagePrice([]) return?', options: ['NaN', 'Numeric 0', 'The text N/A'], correct: 1,
        followUp: ['Trace the two zero values, then compare NaN with the required return value.', 'Now predict the weighted average when the cart has two units of the same item.', 'A string cannot behave as a price. Re-read the numeric return requirement.'] },
    }, {
      questionId: 'cart-checkout-edge-cases', requirementId: 'discount', issueId: 'discount-range',
      explanation: 'The discount has an inclusive interval from 0 to 100. Check both endpoints and their invalid neighbors. Clamping an invalid value changes the request and can give away a free order.',
      excerpt: 'return total * (1 - discountPercent / 100);',
      practice: { prompt: 'What happens when a customer enters a 101% discount?', options: ['Clamp it to 100%', 'Accept it and compute a negative total', 'Reject it with a clear message'], correct: 2,
        followUp: ['Compare 100, which is an allowed endpoint, with 101, which must be refused.', 'Compute what multiplication by a negative discount multiplier would do to the total.', 'Now check the opposite boundary with -1 and 0.'] },
    }],
  },
};

function entry(caseId) {
  if (caseId === fourth.definition.caseId) return {
    definition: validateDefinition(fourth.definition), teaching: fourth.teaching, diagnosis: fourth.diagnosis,
  };
  const teaching = Object.hasOwn(legacyTeaching, caseId) ? legacyTeaching[caseId] : null;
  if (!teaching) return null;
  return { definition: convertLegacyCatalog(root)[caseId], teaching, diagnosis: diagnosisData.findCase(caseId) };
}

function journeyCase(caseId, caseVersion, conceptId) {
  const item = entry(caseId);
  if (!item || item.definition.caseVersion !== caseVersion || item.teaching.conceptId !== conceptId) return null;
  return { ...item, publicCase: studentView(item.definition) };
}

function supportedCourses() {
  return [...Object.keys(legacyTeaching), fourth.definition.caseId].map((caseId) => {
    const { definition, teaching } = entry(caseId);
    return { caseId, caseVersion: definition.caseVersion, conceptId: teaching.conceptId, title: definition.title };
  });
}

function approvedRunner(definition) {
  if (!definition.capabilities.executableVerification || !hasTrustedRunner(definition)) return null;
  return definition.caseId === fourth.definition.caseId ? require('./m5-retry-runner.cjs').level : verifiedInventory()[definition.caseId];
}

module.exports = { journeyCase, supportedCourses, approvedRunner };
