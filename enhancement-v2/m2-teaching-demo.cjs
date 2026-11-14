/** Isolated evaluator demonstration. Never imported by production routes. */
const path = require('node:path');
const { createHash } = require('node:crypto');
const authoredContent = structuredClone(require('../knowledge-map/learning-content.js'));
const { convertStudentCatalog, convertLegacyCatalog } = require('./legacy-adapter.cjs');
const { validatePreflight } = require('./m2-preflight/validate.cjs');
const { reviewedDiagnosis } = require('./m2-reviewed-evidence.cjs');
const { generateTeachingCard, studentTeachingResponse } = require('./m2-teaching-generator.cjs');
const { createMockTeachingProvider } = require('./m2-demo-mock.cjs');

const ROOT = path.resolve(__dirname, '..');
const CASE_ID = 'cart-checkout';
const CASE_VERSION = 1;
const CONCEPT_ID = 'edge-cases';
const source = convertStudentCatalog(ROOT)[CASE_ID];
if (!source || source.caseVersion !== CASE_VERSION || !source.conceptIds.includes(CONCEPT_ID))
  throw new Error('Demonstration case version or concept differs from canonical Student View');
const publicFactsDigest = createHash('sha256').update(JSON.stringify({ caseId: source.caseId,
  caseVersion: source.caseVersion, title: source.title, scenario: source.scenario,
  aiClaim: source.aiClaim, requirements: source.requirements, starterCode: source.starterCode })).digest('hex');

function authoredCard(conceptId) {
  const card = authoredContent[CASE_ID]?.[conceptId];
  if (!card || card.exercise?.kind !== 'choice') throw new Error('Authored card unavailable');
  return { caseId: CASE_ID, caseVersion: CASE_VERSION, conceptId,
    explanation: card.explanation, example: card.example,
    exercise: { kind: card.exercise.kind, prompt: card.exercise.prompt,
      options: [...card.exercise.options] } };
}

function selectAuthoredFallback() {
  return { state: 'authored-fallback-selected', origin: 'authored', card: authoredCard(CONCEPT_ID) };
}

function authoredComparators() {
  return { edgeCases: { origin: 'authored', card: authoredCard(CONCEPT_ID) },
    codeReading: { origin: 'authored', card: authoredCard('code-reading') } };
}

async function createTeachingDemonstration(fixture, provider = createMockTeachingProvider()) {
  const definition = convertLegacyCatalog(ROOT)[CASE_ID];
  const check = validatePreflight(fixture, definition,
    definition.requirements.map(({ requirementId }) => requirementId));
  const review = check.ok ? reviewedDiagnosis(fixture) : null;
  const result = !check.ok ? { status: 'invalid-input' } : !review ? { status: 'review-required' } :
    await generateTeachingCard({ fixture, caseId: CASE_ID, caseVersion: CASE_VERSION,
      conceptId: CONCEPT_ID, requirementIds: [review.requirementId] }, provider);
  const evidence = review && fixture.record.result.dimensions.find((item) => item.conceptId === CONCEPT_ID)?.evidence;
  return Object.freeze({
    internalPreview() {
      return { visibility: 'internal-evaluation', origin: 'mock-ai-proposal',
        caseId: CASE_ID, caseVersion: CASE_VERSION, conceptId: CONCEPT_ID, publicFactsDigest,
        generationStatus: result.status, reviewState: studentTeachingResponse(result).state,
        target: result.status === 'success' ? { requirementId: result.evaluationTrace.requirementId,
          diagnosisEvidence: evidence } : null,
        card: result.status === 'success' ? structuredClone(result.publicCard) : null,
        authoredFallbackAvailable: true };
    },
    studentDelivery() { return studentTeachingResponse(result); },
    selectAuthoredFallback,
  });
}

module.exports = { createTeachingDemonstration, selectAuthoredFallback, authoredComparators };
