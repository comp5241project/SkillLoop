const data = require('../../learning-path/data.js');
const model = require('../../learning-path/diagnosis-model.js');

/** Isolated fixture boundary; not a Module 2 or production API contract. */
function validatePreflight(fixture, definition, requirementRefs) {
  if (!fixture || !definition || fixture.caseId !== definition.caseId ||
      fixture.caseVersion !== definition.caseVersion || fixture.record?.caseId !== fixture.caseId)
    return { ok: false, error: 'Case identity or version mismatch' };
  const caseData = data.findCase(fixture.caseId);
  const record = fixture.record;
  if (!caseData || record.schemaVersion !== 2 || record.questionSource !== 'authored' ||
      !['local', 'ai'].includes(record.source) || !record.learner ||
      !['beginner', 'student', 'graduate'].includes(record.learner.background) ||
      !['internship', 'build'].includes(record.learner.goal) ||
      !Array.isArray(record.responses) || record.responses.length !== caseData.questions.length ||
      new Set(record.responses.map((r) => r.questionId)).size !== caseData.questions.length ||
      !record.responses.every((r) => caseData.questions.some((q) =>
        q.id === r.questionId && q.options.some((o) => o.id === r.optionId) &&
        (r.explanation === undefined || typeof r.explanation === 'string' && r.explanation.length <= 400))))
    return { ok: false, error: 'Incomplete or inconsistent diagnosis record' };
  const result = model.validateResult(record.result, caseData, record.responses);
  if (!result.ok) return result;
  const allowed = new Set(definition.requirements.map((r) => r.requirementId));
  if (!Array.isArray(requirementRefs) || !requirementRefs.length ||
      new Set(requirementRefs).size !== requirementRefs.length ||
      !requirementRefs.every((id) => allowed.has(id)))
    return { ok: false, error: 'Unknown requirementId' };
  return { ok: true };
}

module.exports = { validatePreflight };
