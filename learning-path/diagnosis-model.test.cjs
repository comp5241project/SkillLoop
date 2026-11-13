const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('./data.js');
const model = require('./diagnosis-model.js');

function answersFor(caseData, pick) {
  return caseData.questions.map((question) => {
    const option = pick === 'weak'
      ? question.options.find((item) => item.score === 0)
      : question.options.find((item) => item.score === 2);
    return { questionId: question.id, optionId: option.id, explanation: '' };
  });
}

test('every case keeps the shared IDs and one best option per check', () => {
  assert.equal(data.cases.length, 3);
  const knownConcepts = new Set(data.knowledgePoints.map((item) => item.id));
  const questionIds = new Set();

  for (const caseData of data.cases) {
    assert.match(caseData.id, /^[a-z][a-z0-9-]+$/);
    assert.equal(caseData.questions.length, 4);
    assert.equal(new Set(caseData.knowledgePoints).size, 4);
    for (const conceptId of caseData.knowledgePoints) {
      assert.equal(knownConcepts.has(conceptId), true, 'unknown concept ' + conceptId);
    }
    assert.deepEqual(
      caseData.questions.map((question) => question.conceptId),
      caseData.knowledgePoints
    );

    for (const question of caseData.questions) {
      assert.equal(questionIds.has(question.id), false, 'duplicate question ' + question.id);
      questionIds.add(question.id);
      assert.equal(question.options.length, 3);
      assert.equal(question.options.filter((option) => option.score === 2).length, 1);
      assert.equal(new Set(question.options.map((option) => option.id)).size, 3);
    }
  }
});

test('the shared question validator accepts every authored set and rejects broken sets', () => {
  for (const caseData of data.cases) {
    assert.deepEqual(model.validateQuestions(caseData.questions, caseData), { ok: true });
  }
  const caseData = data.findCase('cart-checkout');
  const duplicateScore = structuredClone(caseData.questions);
  duplicateScore[0].options[1].score = 2;
  assert.equal(model.validateQuestions(duplicateScore, caseData).ok, false);

  const duplicateConcept = structuredClone(caseData.questions);
  duplicateConcept[1].conceptId = duplicateConcept[0].conceptId;
  assert.equal(model.validateQuestions(duplicateConcept, caseData).ok, false);

  const longPrompt = structuredClone(caseData.questions);
  longPrompt[0].prompt = 'x'.repeat(model.MAX_PROMPT + 1);
  assert.equal(model.validateQuestions(longPrompt, caseData).ok, false);
});

test('the local sample diagnosis is complete, validated and clearly labelled by the caller', () => {
  const caseData = data.findCase('cart-checkout');
  const responses = answersFor(caseData, 'best');
  const result = model.buildLocalDiagnosis(caseData, responses);

  assert.equal(result.caseId, 'cart-checkout');
  assert.equal(result.overall.level, 'ready');
  assert.equal(result.dimensions.length, 4);
  assert.deepEqual(
    result.dimensions.map((item) => item.conceptId),
    caseData.knowledgePoints
  );
  assert.equal(result.priorities.length, 2);
  assert.equal(result.nextSteps.length, 3);
  assert.deepEqual(model.validateResult(result, caseData, responses), { ok: true });
});

test('weak answers produce a foundation diagnosis and prioritise the gaps', () => {
  const caseData = data.findCase('notes-save');
  const responses = answersFor(caseData, 'weak');
  const result = model.buildLocalDiagnosis(caseData, responses);

  assert.equal(result.overall.level, 'foundation');
  assert.deepEqual(result.priorities, caseData.knowledgePoints.slice(0, 2));
  assert.equal(result.dimensions.every((item) => item.level === 'foundation'), true);
  assert.equal(model.validateResult(result, caseData, responses).ok, true);
});

test('evidence must quote the selected option or the learner explanation', () => {
  const caseData = data.findCase('quiz-permissions');
  const responses = answersFor(caseData, 'best');
  const result = model.buildLocalDiagnosis(caseData, responses);

  const fabricated = structuredClone(result);
  fabricated.dimensions[0].evidence = 'The learner said permissions are optional.';
  const fabricatedCheck = model.validateResult(fabricated, caseData, responses);
  assert.equal(fabricatedCheck.ok, false);
  assert.match(fabricatedCheck.error, /evidence/i);

  const explained = structuredClone(responses);
  explained[0].explanation = 'I would write the assignment rule first.';
  const explainedResult = model.buildLocalDiagnosis(caseData, explained);
  assert.equal(explainedResult.dimensions[0].evidence, 'I would write the assignment rule first.');
  assert.equal(model.validateResult(explainedResult, caseData, explained).ok, true);
});

test('the output contract rejects wrong cases, missing dimensions and invented priorities', () => {
  const caseData = data.findCase('cart-checkout');
  const responses = answersFor(caseData, 'best');
  const result = model.buildLocalDiagnosis(caseData, responses);

  const wrongCase = structuredClone(result);
  wrongCase.caseId = 'notes-save';
  assert.equal(model.validateResult(wrongCase, caseData, responses).ok, false);

  const missing = structuredClone(result);
  missing.dimensions.pop();
  assert.equal(model.validateResult(missing, caseData, responses).ok, false);

  const inventedPriority = structuredClone(result);
  inventedPriority.priorities = ['foundations'];
  assert.equal(model.validateResult(inventedPriority, caseData, responses).ok, false);

  const tooFewSteps = structuredClone(result);
  tooFewSteps.nextSteps = ['Only one step.'];
  assert.equal(model.validateResult(tooFewSteps, caseData, responses).ok, false);
});
