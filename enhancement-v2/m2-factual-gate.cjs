/** Narrow, sound checks over public claims. Everything else requires semantic review. */
const { convertStudentCatalog } = require('./legacy-adapter.cjs');
const path = require('node:path');

function validateFactualClaims(draft, factPack, canonicalCase) {
  const card = draft.publicCard;
  if (card.caseId !== factPack.caseId || card.caseVersion !== factPack.caseVersion ||
      card.conceptId !== factPack.conceptId) throw new Error('Case identity differs from Fact Pack');
  const facts = new Map(factPack.requirements.map(({ requirementId, text }) => [requirementId, text]));
  if (card.requirementRefs.some((id) => !facts.has(id))) throw new Error('Unknown requirement reference');
  const publicSource = canonicalCase ?? convertStudentCatalog(path.resolve(__dirname, '..'))[factPack.caseId];
  if (!publicSource || publicSource.starterCode !== factPack.starterCode ||
      !factPack.starterCode.includes(card.codeExample.excerpt)) throw new Error('Unproven public code excerpt');
  const prose = [card.objective, card.explanation, card.codeExample.prompt,
    card.exercise.prompt, ...card.exercise.publicHints];
  for (const value of prose) {
    if (/\b(?:internalAssessment|referenceCode|hiddenAssertions|teacherDraft|evaluationTrace|reviewRegistry)\b|\b(?:hidden tests|private tests|internal rubric)\b/i.test(value))
      throw new Error('Internal material marker in public prose');
    // This workflow never runs a test. Explicit execution claims are false here.
    if (/\b(?:I|we|the runner)\s+(?:ran|executed)\s+(?:the\s+)?tests?\b|\b(?:tests?|test suite)\s+(?:have\s+)?passed\b/i.test(value))
      throw new Error('Unexecuted test claim');
    // Only a declared verbatim quote is mechanically comparable. Paraphrases remain for review.
    for (const match of value.matchAll(/Requirement\s+([a-z][a-z0-9-]*):\s*["“]([^"”]+)["”]/gi)) {
      if (!facts.has(match[1]) || match[2] !== facts.get(match[1]))
        throw new Error('Incorrect verbatim requirement quotation');
    }
    if (facts.has('empty-cart')) {
      const claim = value.match(/\b(?:the\s+)?empty-cart requirement is to return\s+(-?\d+(?:\.\d+)?)\b/i) ||
        value.match(/\baveragePrice\(\[\]\)\s+must return\s+(-?\d+(?:\.\d+)?)\b/i);
      if (claim && Number(claim[1]) !== 0) throw new Error('Explicit empty-cart result contradicts requirement');
    }
  }
  return { state: 'deterministic-checks-passed-semantic-review-required' };
}

module.exports = { validateFactualClaims };
