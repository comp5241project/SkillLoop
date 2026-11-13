import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const part1 = require('../learning-path/data.js');
const diagnosis = require('../learning-path/diagnosis-model.js');
const learning = require('../knowledge-map/learning-contract.js');
const shared = require('../shared/cases.json');
const { convertLegacyCatalog, convertStudentCatalog, convertEvaluationCatalog } = require('../enhancement-v2/legacy-adapter.cjs');
const { fixtures } = require('../enhancement-v2/m2-preflight/diagnosis-fixtures.json');
const { validatePreflight } = require('../enhancement-v2/m2-preflight/validate.cjs');
const root = process.cwd();

test('both M2 fixtures are complete valid Module 1 diagnoses for the same case version', () => {
  const caseData = part1.findCase('cart-checkout');
  const definitions = convertLegacyCatalog(root);
  assert.equal(fixtures.length, 2);
  assert.deepEqual(fixtures.map((f) => f.fixtureId), ['empty-cart-gap', 'discount-boundary-gap']);
  for (const fixture of fixtures) {
    const { record } = fixture;
    assert.equal(fixture.provenance, 'synthetic-authored-diagnosis');
    assert.equal(fixture.caseId, 'cart-checkout');
    assert.equal(fixture.caseVersion, definitions[fixture.caseId].caseVersion);
    assert.equal(record.caseId, fixture.caseId);
    assert.equal(record.responses.length, caseData.questions.length);
    assert.deepEqual(record.responses.map((r) => r.questionId), caseData.questions.map((q) => q.id));
    assert.deepEqual(diagnosis.validateResult(record.result, caseData, record.responses), { ok: true });
    // Current Module 2 expects three shared topics; Module 1 diagnoses four.
    // Record this integration gap rather than claiming the fixture is Module 2-ready.
    assert.equal(learning.validRecord(record, shared), false);
    assert.equal(record.result.priorities.includes('edge-cases'), true);
    const edge = record.result.dimensions.find((d) => d.conceptId === 'edge-cases');
    const response = record.responses.find((r) => r.questionId === 'cart-checkout-edge-cases');
    assert.equal(response.explanation.includes(edge.evidence), true);
  }
});

test('fixtures distinguish evidenced gaps without changing case facts', () => {
  const [a, b] = fixtures;
  const definition = convertLegacyCatalog(root)['cart-checkout'];
  assert.deepEqual(validatePreflight(a, definition, ['empty-cart']), { ok: true });
  assert.deepEqual(validatePreflight(b, definition, ['discount']), { ok: true });
  assert.equal(a.record.responses.find((r) => r.questionId === 'cart-checkout-code-reading').optionId, 'partial');
  assert.equal(b.record.responses.find((r) => r.questionId === 'cart-checkout-software-testing').optionId, 'partial');
  assert.match(a.record.result.dimensions.find((d) => d.conceptId === 'edge-cases').evidence, /do not know what averagePrice/);
  assert.match(b.record.result.dimensions.find((d) => d.conceptId === 'edge-cases').evidence, /empty cart should return numeric 0/);
  assert.match(b.record.result.dimensions.find((d) => d.conceptId === 'edge-cases').evidence, /test discount 0 and 100 only/);
  const publicCase = convertStudentCatalog(root)['cart-checkout'];
  const privateCase = convertEvaluationCatalog(root)['cart-checkout'];
  assert.deepEqual(publicCase.requirements.map((r) => r.requirementId),
    ['quantity', 'ui-zero', 'discount', 'empty-cart', 'valid-totals']);
  assert.equal(JSON.stringify(publicCase).includes(privateCase.referenceCode), false);
  assert.equal('issues' in publicCase, false);
  assert.equal('tests' in publicCase, false);
});

test('preflight rejects wrong version and cross-namespace requirement references', () => {
  const definition = convertLegacyCatalog(root)['cart-checkout'];
  for (const fixture of fixtures) {
    const wrongVersion = structuredClone(fixture); wrongVersion.caseVersion = 2;
    assert.match(validatePreflight(wrongVersion, definition, ['discount']).error, /version/);
    for (const wrongId of ['discount-range', 'empty-average', 'full-discount', 'missing-requirement'])
      assert.match(validatePreflight(fixture, definition, [wrongId]).error, /requirementId/);
  }
});

test('preflight rejects inconsistent diagnosis answers and evidence', () => {
  const definition = convertLegacyCatalog(root)['cart-checkout'];
  const missing = structuredClone(fixtures[0]); missing.record.responses.pop();
  assert.equal(validatePreflight(missing, definition, ['empty-cart']).ok, false);
  const wrongOption = structuredClone(fixtures[0]); wrongOption.record.responses[0].optionId = 'invented';
  assert.equal(validatePreflight(wrongOption, definition, ['empty-cart']).ok, false);
  const evidence = structuredClone(fixtures[0]);
  evidence.record.result.dimensions.find((d) => d.conceptId === 'edge-cases').evidence = 'I ran every hidden test.';
  assert.equal(validatePreflight(evidence, definition, ['empty-cart']).ok, false);
});

test('fabricated evidence and mismatched case identity are rejected', () => {
  const caseData = part1.findCase('cart-checkout');
  const altered = structuredClone(fixtures[0].record);
  altered.result.dimensions.find((d) => d.conceptId === 'edge-cases').evidence = 'The learner said all tests passed.';
  assert.equal(diagnosis.validateResult(altered.result, caseData, altered.responses).ok, false);
  const wrongCase = structuredClone(fixtures[0].record);
  wrongCase.result.caseId = 'notes-save';
  assert.equal(diagnosis.validateResult(wrongCase.result, caseData, wrongCase.responses).ok, false);
});
