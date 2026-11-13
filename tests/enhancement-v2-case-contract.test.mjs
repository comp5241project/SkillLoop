import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = require('../docs/team-samples/samples.json');
const diagnosis = require('../learning-path/data.js');
const learning = require('../knowledge-map/learning-part1-cases.js');
const { convertLegacyCatalog, convertEvaluationCatalog, loadRunnerInventory } = require('../enhancement-v2/legacy-adapter.cjs');
const { legacyToDefinition, validateDefinition, studentView } = require('../enhancement-v2/case-contract.cjs');
const clone = (x) => structuredClone(x);
const definitions = convertLegacyCatalog(root);

test('the three current sources agree on canonical case IDs', () => {
  const ids = ['cart-checkout', 'quiz-permissions', 'notes-save'];
  assert.deepEqual(Object.keys(source.cases), ids);
  assert.deepEqual(Object.keys(require('../shared/cases.json').cases), ids);
  assert.deepEqual(diagnosis.cases.map((c) => c.id), ids);
  assert.deepEqual(Object.keys(learning), ids);
});

test('legacy conversion preserves all public facts and stable issue/test IDs', () => {
  for (const [id, old] of Object.entries(source.cases)) {
    const result = definitions[id];
    assert.deepEqual(result.requirements.map((x) => x.text), old.requirements);
    assert.equal(result.starterCode, old.starterCode);
    assert.equal(result.aiClaim, old.aiClaim);
    assert.deepEqual(result.topicIds, old.topicIds);
    assert.deepEqual(result.conceptIds, old.topicIds);
    assert.deepEqual(result.publicIssues, old.issues);
    assert.deepEqual(result.publicTests, old.tests);
    assert.deepEqual(result.publicIssues.map((x) => x.issueId), old.issues.map((x) => x.issueId));
    assert.deepEqual(result.publicTests.map((x) => x.testId), old.tests.map((x) => x.testId));
    assert.equal(result.capabilities.executableVerification, true);
  }
});

test('stable requirement mapping rejects changed or reordered source wording', () => {
  const old = clone(source.cases['cart-checkout']);
  old.requirements[0] += ' Changed';
  assert.throws(() => legacyToDefinition(old), /requirements changed/);
  const swapped = clone(source.cases['cart-checkout']);
  [swapped.requirements[0], swapped.requirements[1]] = [swapped.requirements[1], swapped.requirements[0]];
  assert.throws(() => legacyToDefinition(swapped), /requirements changed/);
});

test('duplicate IDs, dangling references and version errors are rejected', () => {
  const base = definitions['cart-checkout'];
  const duplicate = clone(base); duplicate.publicTests[1].testId = duplicate.publicTests[0].testId;
  assert.throws(() => validateDefinition(duplicate), /Invalid issue\/test/);
  const dangling = clone(base); dangling.publicIssues[0].suggestedChecks.push('missing-test');
  assert.throws(() => validateDefinition(dangling), /Invalid issue\/test/);
  const badVersion = clone(base); badVersion.caseVersion = 0;
  assert.throws(() => validateDefinition(badVersion), /Invalid case identity/);
  const wrongVersion = clone(base); wrongVersion.caseVersion = 2;
  assert.throws(() => validateDefinition(wrongVersion), /requires a reviewed matching runner/);
  const fakeFixture = { caseId: base.caseId, caseVersion: 2, reviewed: true, runner: true,
    testIds: base.publicTests.map((x) => x.testId) };
  assert.throws(() => validateDefinition(wrongVersion, fakeFixture), /requires a reviewed matching runner/);
  const wrongTests = clone(base);
  [wrongTests.publicTests[0], wrongTests.publicTests[1]] = [wrongTests.publicTests[1], wrongTests.publicTests[0]];
  assert.throws(() => validateDefinition(wrongTests), /requires a reviewed matching runner/);
});

test('student projection cannot expose reference code, drafts or hidden evaluation', () => {
  const input = clone(definitions['notes-save']);
  input.referenceCode = source.cases['notes-save'].referenceCode;
  input.teacherDraft = { secret: 'draft' };
  input.hiddenAssertions = ['private'];
  input.evaluation = { referenceCode: 'private' };
  const output = studentView(input);
  assert.equal(JSON.stringify(output).includes(input.referenceCode), false);
  for (const key of ['referenceCode', 'teacherDraft', 'hiddenAssertions', 'evaluation']) assert.equal(key in output, false);
  assert.equal('publicIssues' in output, false);
  assert.equal('publicTests' in output, false);
  output.requirements[0].text = 'Changed only in projection';
  output.topicIds[0] = 'changed-only-in-projection';
  output.capabilities.learning = false;
  assert.notEqual(input.requirements[0].text, output.requirements[0].text);
  assert.notEqual(input.topicIds[0], output.topicIds[0]);
  assert.equal(input.capabilities.learning, true);
  input.status = 'draft';
  assert.throws(() => studentView(input), /published/);
});

test('student projection rejects unknown nested secrets and malformed inputs', () => {
  const base = definitions['cart-checkout'];
  const secret = clone(base); secret.requirements[0].teacherSecret = 'LEAK';
  assert.throws(() => studentView(secret), /Invalid or duplicate requirement/);
  const nested = clone(base); nested.topicIds[0] = { id: 'requirements', private: { answer: 'LEAK' } };
  assert.throws(() => studentView(nested), /Invalid topic/);
  const extraCapability = clone(base); extraCapability.capabilities.private = { answer: 'LEAK' };
  assert.throws(() => studentView(extraCapability), /Invalid capabilities/);
  assert.throws(() => studentView(null), /Invalid case identity/);
  assert.throws(() => studentView({ status: 'published' }), /Invalid case identity/);
});

test('all three ordinary student views preserve approved facts without private fields', () => {
  for (const [id, old] of Object.entries(source.cases)) {
    const view = studentView(definitions[id]);
    assert.deepEqual(view.requirements.map((r) => r.text), old.requirements);
    assert.equal(view.scenario, old.scenario);
    assert.equal(view.starterCode, old.starterCode);
    assert.equal(view.aiClaim, old.aiClaim);
    assert.deepEqual(view.topicIds, old.topicIds);
    assert.deepEqual(view.conceptIds, old.topicIds);
    assert.equal(JSON.stringify(view).includes(old.referenceCode), false);
  }
});

test('private evaluation preserves reference repair and complete legacy evaluation', () => {
  const evaluation = convertEvaluationCatalog(root);
  for (const [id, old] of Object.entries(source.cases)) {
    assert.equal(evaluation[id].referenceCode, old.referenceCode);
    assert.equal(evaluation[id].implementationNote, old.implementationNote);
    assert.deepEqual(evaluation[id].issues, old.issues);
    assert.deepEqual(evaluation[id].tests, old.tests);
  }
});

test('fixture inventory has exact public test IDs for all three cases', () => {
  const levels = loadRunnerInventory(root);
  for (const [id, old] of Object.entries(source.cases))
    assert.deepEqual(Array.from(levels[id].checks, (x) => x.testId), old.tests.map((x) => x.testId));
});
