const { createHash } = require('node:crypto');
const { hasTrustedRunner } = require('./trusted-runner-registry.cjs');

const CASE_VERSION = 1;
const REQUIREMENT_IDS = Object.freeze({
  'cart-checkout': ['quantity', 'ui-zero', 'discount', 'empty-cart', 'valid-totals'],
  'quiz-permissions': ['roles', 'operation-boundary', 'authorization', 'server-boundary'],
  'notes-save': ['pending', 'failure', 'retry', 'single-request'],
});
// The fingerprints pin the reviewed legacy wording. A changed requirement must be reviewed,
// assigned its own stable ID and explicitly added to a new case version.
const REQUIREMENT_FINGERPRINTS = Object.freeze({
  'cart-checkout': ["de43c29c8e00927eeb9261f4e7dae852cdd9eec46b9b26fb13c6d5bfc447bf51","1434f08e1fa0c2e6292f03b95ee9d3425fa7b02e789077d7981ffab6cb80a151","3fb9d29b2ea0935a4345019daab2b4711fec6944e90f7a2b3b283715d8548c5e","fa11f6eb9901cd65757b4b8d4e8f34782505d8ae84ebc5230a00f7b7eb4c9bd1","9929279f005ff95d1957badbcbf71a3a649243942bcba3446adcb4f968ba1783"],
  'quiz-permissions': ["0db59698424ea7d034bbda77f6e519b63d4ead246b91f3b089c2a351fb54524b","825ca41e835a5afeb814bc26811d2b03627e2d8547ca0b046c2657dadbbaad92","0c48af73fc491d50e445f4a06994c2b11225b317812eb377716dcabe0c86939c","6012c3ef8e9c2de5e3d8c4f9abc7aeb84558c52f4a66470e9f5fde709137e331"],
  'notes-save': ["11cf8326f44b864447548c7af2f2194a622c57ce82e9090f4e59c41d492c6fab","255434b99504094028f2aadacc1e8b588ed793b26660d5d6b5324b0be5f1d09d","4d0a01287bc6a26c6e86491a70cd4ff54682ad59e721c460981cee952c19c05f","2d544865f96f9f435656a24e20acf38b018456fff1487eca6e5f131ee3019675"],
});
const digest = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const unique = (values) => new Set(values).size === values.length;
const id = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');

function validateDefinitionShape(definition) {
  if (!definition || definition.schemaVersion !== 1 || !id(definition.caseId) ||
      !Number.isSafeInteger(definition.caseVersion) || definition.caseVersion < 1 ||
      !['draft', 'published'].includes(definition.status) ||
      ![definition.title, definition.scenario, definition.aiClaim, definition.starterCode].every(nonempty))
    throw new Error('Invalid case identity or public text');
  const reqs = definition.requirements;
  if (!Array.isArray(reqs) || !reqs.length || !reqs.every((r) => exactKeys(r, ['requirementId', 'text']) && id(r.requirementId) && nonempty(r.text)) ||
      !unique(reqs.map((r) => r.requirementId)) || !unique(reqs.map((r) => r.text))) throw new Error('Invalid or duplicate requirement');
  if (!Array.isArray(definition.topicIds) || !definition.topicIds.length || !definition.topicIds.every(id) || !unique(definition.topicIds) ||
      JSON.stringify(definition.conceptIds) !== JSON.stringify(definition.topicIds)) throw new Error('Invalid topic/concept mapping');
  const issues = definition.publicIssues, tests = definition.publicTests;
  if (!Array.isArray(issues) || !Array.isArray(tests) || !issues.every((x) => id(x.issueId) && nonempty(x.title) &&
      Array.isArray(x.topicIds) && x.topicIds.every((t) => definition.topicIds.includes(t)) &&
      Array.isArray(x.suggestedChecks)) || !unique(issues.map((x) => x.issueId)) ||
      !tests.every((x) => id(x.testId) && (x.issueId === null || issues.some((issue) => issue.issueId === x.issueId)) &&
      nonempty(x.action) && nonempty(x.expected)) || !unique(tests.map((x) => x.testId)) ||
      issues.some((x) => x.suggestedChecks.some((testId) => !tests.some((t) => t.testId === testId))))
    throw new Error('Invalid issue/test reference or duplicate ID');
  const caps = definition.capabilities;
  if (!exactKeys(caps, ['diagnosis', 'learning', 'repairDialogue', 'executableVerification']) ||
      Object.values(caps).some((v) => typeof v !== 'boolean')) throw new Error('Invalid capabilities');
  return definition;
}

function validateDefinition(definition) {
  validateDefinitionShape(definition);
  if (definition.capabilities.executableVerification && !hasTrustedRunner(definition))
    throw new Error('Executable verification requires a reviewed matching runner fixture');
  return definition;
}

function legacyToDefinition(legacy) {
  const names = REQUIREMENT_IDS[legacy?.caseId], fingerprints = REQUIREMENT_FINGERPRINTS[legacy?.caseId];
  if (!names || !Array.isArray(legacy.requirements) || names.length !== legacy.requirements.length ||
      JSON.stringify(legacy.requirements.map(digest)) !== JSON.stringify(fingerprints))
    throw new Error('Legacy requirements changed: review stable IDs before conversion');
  const definition = {
    schemaVersion: 1, caseId: legacy.caseId, caseVersion: CASE_VERSION, status: 'published',
    title: legacy.title, scenario: legacy.scenario, aiClaim: legacy.aiClaim,
    requirements: legacy.requirements.map((text, i) => ({ requirementId: names[i], text })),
    topicIds: [...legacy.topicIds], conceptIds: [...legacy.topicIds], starterCode: legacy.starterCode,
    publicIssues: legacy.issues.map((x) => ({ issueId: x.issueId, title: x.title, topicIds: [...x.topicIds], observed: x.observed,
      suggestedChange: x.suggestedChange, suggestedChecks: [...x.suggestedChecks] })),
    publicTests: legacy.tests.map((x) => ({ testId: x.testId, issueId: x.issueId, action: x.action, expected: x.expected })),
    capabilities: { diagnosis: true, learning: true, repairDialogue: true, executableVerification: true },
  };
  return validateDefinition(definition);
}

function studentView(definition) {
  // Construct an allowlist rather than deleting secrets from a richer record.
  validateDefinition(definition);
  if (definition.status !== 'published') throw new Error('Only published cases have a student view');
  const { schemaVersion, caseId, caseVersion, title, scenario, aiClaim, requirements, topicIds, conceptIds,
    starterCode, capabilities } = definition;
  return {
    schemaVersion, caseId, caseVersion, title, scenario, aiClaim,
    requirements: requirements.map(({ requirementId, text }) => ({ requirementId, text })),
    topicIds: topicIds.map((value) => value), conceptIds: conceptIds.map((value) => value), starterCode,
    capabilities: { diagnosis: capabilities.diagnosis, learning: capabilities.learning,
      repairDialogue: capabilities.repairDialogue, executableVerification: capabilities.executableVerification },
  };
}

function evaluationView(legacy, definition) {
  if (legacy.caseId !== definition.caseId) throw new Error('Evaluation case mismatch');
  return structuredClone({ caseId: definition.caseId, caseVersion: definition.caseVersion,
    referenceCode: legacy.referenceCode, implementationNote: legacy.implementationNote,
    issues: legacy.issues, tests: legacy.tests });
}

module.exports = { CASE_VERSION, REQUIREMENT_IDS, REQUIREMENT_FINGERPRINTS, digest,
  validateDefinitionShape, validateDefinition, legacyToDefinition, studentView, evaluationView };
