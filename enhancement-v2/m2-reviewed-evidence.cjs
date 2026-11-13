/** Reviewed synthetic experiment records. This is not learner authentication. */
const { createHash } = require('node:crypto');

// Hashes cover the case/version, provenance marker and complete Module 1 record,
// including the learner profile, answers, evidence and result. Fixture labels are
// deliberately excluded: they are display labels, not an authority boundary.
const REVIEWS = Object.freeze({
  '903b0f63183cb97318e73185134b14be744369b78177300d4dd7e1a86c867ec3':
    Object.freeze({ reviewId: 'cart-empty-1', learnerId: 'synthetic-a', attemptId: 'a-diagnosis-1', requirementId: 'empty-cart' }),
  '5cd13dc1b6858c88375f18d756627a244b988a08f22fdf8923f9ce9c0747323e':
    Object.freeze({ reviewId: 'cart-discount-1', learnerId: 'synthetic-b', attemptId: 'b-diagnosis-1', requirementId: 'discount' }),
  '676065bcd0750f6171a1dcfda85c497e7410679cb7e9eb9b537b59b6443df9fb':
    Object.freeze({ reviewId: 'cart-empty-2', learnerId: 'synthetic-c', attemptId: 'c-diagnosis-1', requirementId: 'empty-cart' }),
});

const OBSERVATIONS = Object.freeze({
  'cart-edge-trace-1': Object.freeze({ observationId: 'cart-edge-trace-1', reviewId: 'cart-discount-1',
    learnerId: 'synthetic-b', attemptId: 'b-diagnosis-1', caseId: 'cart-checkout', caseVersion: 1,
    conceptId: 'edge-cases', activityId: 'reviewed-trace-1', outcome: 'partial',
    observed: 'The learner stated the empty-cart result but omitted a boundary check.' }),
});

function reviewedDiagnosis(fixture) {
  if (fixture?.provenance !== 'synthetic-authored-diagnosis') return null;
  const digest = createHash('sha256').update(JSON.stringify({ caseId: fixture.caseId,
    caseVersion: fixture.caseVersion, provenance: fixture.provenance, record: fixture.record })).digest('hex');
  const review = REVIEWS[digest];
  return review ? { ...review } : null;
}

function reviewedObservation({ observationId, attemptId, activityId, review, caseId, caseVersion, conceptId }) {
  const item = typeof observationId === 'string' ? OBSERVATIONS[observationId] : null;
  if (!item || !review || item.reviewId !== review.reviewId || item.learnerId !== review.learnerId ||
      item.attemptId !== review.attemptId || attemptId !== item.attemptId || activityId !== item.activityId ||
      item.caseId !== caseId || item.caseVersion !== caseVersion || item.conceptId !== conceptId)
    return { state: 'untrusted' };
  return { state: 'validated', observationId: item.observationId, activityId: item.activityId,
    outcome: item.outcome, observed: item.observed };
}

module.exports = { reviewedDiagnosis, reviewedObservation };
