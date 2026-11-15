export function fixtureContent({ case: source, brief }) {
  const isRetry = source.caseId === 'retry-queue';
  const [objective] = brief.objectives;
  return {
    title: isRetry ? 'Trace the retry backoff cap' : 'Trace the empty cart',
    objectives: brief.objectives.map((item) => ({ ...item, text: item.text + ' Use a concrete trace.' })),
    explanation: isRetry
      ? 'At attempt four the starter computes 1600 ms. The requirement caps the delay at 1000 ms.'
      : 'The starter divides the total by the number of items. For an empty cart both are zero.',
    codeExample: {
      kind: 'trace',
      excerpt: isRetry ? 'return 100 * 2 ** attempt;' : 'return total / count;',
      prompt: 'Trace the computed value, then compare it with the case requirement.',
    },
    exercises: [{
      exerciseId: 'ex-trace', kind: 'short-answer', requirementIds: objective.requirementIds,
      prompt: 'What does the starter calculate, and how should it behave according to the requirement?',
      publicHints: ['Compare the arithmetic with the published requirement.'],
      teacherAnswerGuidance: [isRetry ? 'Private rubric: require the capped result.' : 'Private rubric: require numeric zero.'],
    }],
  };
}

export function completion(content) {
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });
}
