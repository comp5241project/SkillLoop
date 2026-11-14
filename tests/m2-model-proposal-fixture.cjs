/** Test-only adapter from a known-valid Mock TeachingDraft to model proposal protocol v2. */
function proposalFromMockDraft(draft) {
  return { protocolVersion: 2,
    publicContent: { objective: draft.publicCard.objective,
      explanation: draft.publicCard.explanation,
      codeTracePrompt: draft.publicCard.codeExample.prompt,
      exercise: { prompt: draft.publicCard.exercise.prompt,
        publicHints: [...draft.publicCard.exercise.publicHints] } },
    internalProposal: { targetGap: draft.internalAssessment.targetGap,
      expectedElements: [...draft.internalAssessment.expectedElements],
      observableCriteria: [...draft.internalAssessment.observableCriteria],
      followUpPolicy: { ...draft.internalAssessment.followUpPolicy } } };
}

module.exports = { proposalFromMockDraft };
