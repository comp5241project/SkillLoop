/** Deterministic M2-05 demonstration proposals, not real model output. */
function createMockTeachingProvider() {
  return { async generate(request) {
    const empty = request.target.requirementId === 'empty-cart';
    if (!empty && request.target.requirementId !== 'discount') throw new Error('Unsupported mock target');
    return { publicCard: { caseId: request.case.caseId, caseVersion: request.case.caseVersion,
      conceptId: request.case.conceptId,
      objective: empty ? 'Trace empty-cart behavior.' : 'Check inclusive discount boundaries.',
      requirementRefs: [request.target.requirementId],
      explanation: empty ? 'For an empty cart, total and count are zero; 0/0 yields NaN, but the requirement says numeric 0.'
        : 'Discounts 0 and 100 are valid endpoints; -1 and 101 must be rejected.',
      codeExample: { kind: 'trace', excerpt: empty ? 'return total / count;' : 'return total * (1 - discountPercent / 100);',
        prompt: empty ? 'Trace both zero values.' : 'Trace the unchecked discount.' },
      exercise: { kind: 'short-answer', prompt: empty ? 'What must averagePrice([]) return?'
        : 'Which of -1, 0, 100 and 101 are accepted?', publicHints: ['Use the published requirement.'] } },
      internalAssessment: { targetGap: empty ? 'Empty-cart result' : 'Discount boundary',
        diagnosisEvidence: request.target.evidence.quote,
        expectedElements: empty ? ['numeric 0', 'NaN from 0/0'] : ['accept 0 and 100', 'reject -1 and 101'],
        observableCriteria: ['Names the requirement and expected behavior'],
        followUpPolicy: { correct: 'Try a related input.', partial: 'Trace the boundary.', incorrect: 'Read the requirement.' },
        status: 'untrusted-proposal' },
      metadata: { schemaVersion: 1, promptVersion: 'mock-m2-05', origin: 'ai-proposal',
        validationStatus: 'structurally-validated-needs-review' } };
  } };
}

module.exports = { createMockTeachingProvider };
