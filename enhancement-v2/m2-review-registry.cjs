/** Pinned synthetic acceptance decision. No production reviewer or authentication. */
const DECISIONS = Object.freeze({
  'synthetic-a-acceptance-approval': Object.freeze({
    caseId: 'cart-checkout', caseVersion: 1,
    fingerprint: '069a0012452e77033d8f369ff7c5b88ad2dac3edb9a29e0ce6bce473ba7d59d1', decision: 'approved',
    provenance: 'synthetic-acceptance-fixture',
  }),
  'synthetic-b-acceptance-rejection': Object.freeze({
    caseId: 'cart-checkout', caseVersion: 1,
    fingerprint: '971cd6de8090b8e0679acc4ed820d9ab69e9a04e4b46ddc29d231406e9c8249f',
    decision: 'rejected', provenance: 'synthetic-acceptance-fixture',
  }),
});

function trustedDecision(reviewId, fingerprint, caseId, caseVersion) {
  const entry = DECISIONS[reviewId];
  return entry && entry.fingerprint === fingerprint && entry.caseId === caseId &&
    entry.caseVersion === caseVersion ? { decision: entry.decision, provenance: entry.provenance } : null;
}

module.exports = { trustedDecision };
