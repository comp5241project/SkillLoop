const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('./data.js');
const model = require('./diagnosis-model.js');
const service = require('./server/questions.cjs');

function rawSet(caseId) {
  const caseData = data.findCase(caseId);
  return {
    caseId,
    questions: caseData.knowledgePoints.map((conceptId, index) => ({
      conceptId,
      prompt: 'Fresh case-specific check ' + (index + 1) + ' for ' + conceptId + '.',
      strength: 'A strong answer ties the choice to the reported symptoms.',
      gap: 'Trace the relevant rule and name one testable next step.',
      options: [
        {
          quality: 'best',
          label: 'Best option ' + (index + 1) + ': inspect the concrete rule in the case.',
          feedback: 'You connected the decision to the evidence in the case.',
        },
        {
          quality: 'partial',
          label: 'Partial option ' + (index + 1) + ': notice the issue but wait for more detail.',
          feedback: 'You noticed a gap but did not make the next decision testable.',
        },
        {
          quality: 'off',
          label: 'Off-target option ' + (index + 1) + ': change an unrelated style detail.',
          feedback: 'You changed presentation instead of checking the reported behaviour.',
        },
      ],
    })),
  };
}

test('question generation validates the case before calling AI', () => {
  const input = service.readRequest({ action: 'questions', caseId: 'shopping-cart' });
  assert.equal(input.caseId, 'shopping-cart');
  assert.equal(input.caseData.id, 'shopping-cart');
  assert.throws(
    () => service.readRequest({ action: 'questions', caseId: 'not-a-case' }),
    /Unknown caseId/
  );
  assert.throws(
    () => service.readRequest({ action: 'diagnose', caseId: 'shopping-cart' }),
    /Unknown learning-path action/
  );
});

test('the generation prompt asks for a fresh, case-specific set with safe text', () => {
  const prepared = service.prepare({ action: 'questions', caseId: 'note-saving' });
  assert.match(prepared.system, /not an examiner/);
  assert.match(prepared.prompt, /fresh set/);
  assert.match(prepared.prompt, /variationToken/);
  assert.match(prepared.prompt, /note-saving/);
  assert.match(prepared.prompt, /Do not include numeric scores/);
  assert.equal(prepared.maxOutputTokens, 8000);
  assert.equal(prepared.temperature, 1.15);
  assert.deepEqual(
    prepared.schema.properties.questions.items.properties.conceptId.enum,
    data.findCase('note-saving').knowledgePoints
  );
  assert.equal(service.prepare({ action: 'questions', caseId: 'note-saving' }).validate(rawSet('note-saving')), true);
});

test('normalization turns qualities into scores, hides quality in IDs and validates the set', () => {
  const caseData = data.findCase('shopping-cart');
  const raw = rawSet('shopping-cart');
  raw.questions.reverse();

  assert.deepEqual(service.validateRaw(raw, caseData), { ok: true });
  const questions = service.normalize(raw, caseData);
  assert.equal(questions.length, 4);
  assert.deepEqual(
    questions.map((question) => question.conceptId),
    caseData.knowledgePoints
  );
  assert.deepEqual(model.validateQuestions(questions, caseData), { ok: true });

  for (const question of questions) {
    assert.match(question.id, /^shopping-cart-[a-z-]+-ai-[a-f0-9]{8}$/);
    assert.deepEqual(
      question.options.map((option) => option.score).sort(),
      [0, 1, 2]
    );
    assert.deepEqual(
      question.options.map((option) => option.id),
      ['choice-1', 'choice-2', 'choice-3']
    );
    assert.equal(
      question.options.some((option) => /best|partial|off/i.test(option.id)),
      false
    );
  }
});

test('malformed model output is rejected before it reaches the browser', () => {
  const caseData = data.findCase('quiz-platform-permissions');
  const duplicateQuality = rawSet('quiz-platform-permissions');
  duplicateQuality.questions[0].options[2].quality = 'best';
  assert.equal(service.validateRaw(duplicateQuality, caseData).ok, false);

  const duplicateConcept = rawSet('quiz-platform-permissions');
  duplicateConcept.questions[1].conceptId = duplicateConcept.questions[0].conceptId;
  assert.equal(service.validateRaw(duplicateConcept, caseData).ok, false);

  const unknownConcept = rawSet('quiz-platform-permissions');
  unknownConcept.questions[0].conceptId = 'foundations';
  assert.equal(service.validateRaw(unknownConcept, caseData).ok, false);

  const longLabel = rawSet('quiz-platform-permissions');
  longLabel.questions[0].options[0].label = 'x'.repeat(model.MAX_OPTION + 1);
  assert.equal(service.validateRaw(longLabel, caseData).ok, false);

  const wrongCase = rawSet('quiz-platform-permissions');
  wrongCase.caseId = 'shopping-cart';
  assert.equal(service.validateRaw(wrongCase, caseData).ok, false);
  assert.throws(() => service.normalize(wrongCase, caseData), /caseId/);
});
