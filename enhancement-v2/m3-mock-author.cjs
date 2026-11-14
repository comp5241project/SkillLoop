/** Deterministic teaching templates for M3-02 tests and internal review; never a real AI provider. */
const { isDeepStrictEqual } = require('node:util');
const controlledAuthors = new WeakSet();

const TEMPLATES = Object.freeze({
  'beginner:empty-cart': Object.freeze({
    label: 'Empty-cart trace',
    objective: 'Trace an empty cart and explain why average price must be numeric zero.',
    explanation: 'For an empty cart, both the total and item count are zero. The starter code divides total by count, so the learner should notice the zero denominator. The published requirement says the empty-cart total and average are numeric 0; a guard must handle that case before division.',
    excerpt: 'return total / count;',
    codePrompt: 'Trace averagePrice([]): identify total, count and the division result before adding an empty-cart guard.',
    exercisePrompt: 'What should averagePrice([]) return, and where should the empty-cart check happen?',
    hints: ['Use the published empty-cart requirement.', 'Inspect count before the return statement.'],
    answer: ['Return numeric 0.', 'Check the empty cart or zero count before dividing.'],
  }),
  'intermediate:discount': Object.freeze({
    label: 'Discount boundary review',
    objective: 'Design a discount validator that accepts both endpoints and rejects out-of-range values.',
    explanation: 'The published discount requirement defines an inclusive range from 0 through 100. The starter code applies the percentage in its arithmetic without validating that range. A boundary review should distinguish valid endpoints 0 and 100 from values just outside them, such as -1 and 101; it should reject invalid input rather than silently clamp it.',
    excerpt: 'return total * (1 - discountPercent / 100);',
    codePrompt: 'Trace the multiplier at -1, 0, 100 and 101, then identify where validation belongs before this return.',
    exercisePrompt: 'Specify the accept/reject outcomes for -1, 0, 100 and 101, and describe a validation condition.',
    hints: ['Both published endpoints are inclusive.', 'Check a value immediately outside each endpoint.'],
    answer: ['Reject -1 and 101.', 'Accept 0 and 100.', 'Validate the inclusive 0–100 range before applying the discount.'],
  }),
});

function createMockTeacherAuthor() {
  const author = Object.freeze({
    source: 'deterministic-mock',
    async generate(request) {
      const { validateCaseRef, validateBrief } = require('./m3-teacher-draft.cjs');
      if (!request || typeof request !== 'object' || Array.isArray(request) ||
          Reflect.ownKeys(request).length !== 3 ||
          !['brief', 'caseRef', 'publicCase'].every((name) => Object.hasOwn(request, name)))
        throw new Error('Invalid Mock authoring request');
      const canonical = validateCaseRef(request.caseRef);
      if (!isDeepStrictEqual(request.publicCase, canonical))
        throw new Error('Mock author received modified public case facts');
      validateBrief(request.brief, canonical);
      if (request.brief.objectives.length !== 1 || request.brief.objectives[0].requirementIds.length !== 1)
        throw new Error('M3-02 Mock supports one selected objective and requirement');
      const briefObjective = request.brief.objectives[0];
      const requirementId = briefObjective.requirementIds[0];
      const template = TEMPLATES[`${request.brief.learnerLevel}:${requirementId}`];
      if (!template) throw new Error('No reviewed Mock template for this learner level and requirementId');
      if (!canonical.starterCode.includes(template.excerpt))
        throw new Error('Mock code excerpt differs from canonical starter code');
      return {
        title: `${request.brief.topic.slice(0, 90)}: ${template.label}`.slice(0, 120),
        objectives: [{ objectiveId: briefObjective.objectiveId, text: template.objective,
          requirementIds: [requirementId] }],
        explanation: template.explanation,
        codeExample: { kind: 'trace', excerpt: template.excerpt, prompt: template.codePrompt },
        exercises: [{ exerciseId: `ex-${requirementId}-trace`, kind: 'short-answer',
          prompt: template.exercisePrompt, requirementIds: [requirementId],
          publicHints: [...template.hints], teacherAnswerGuidance: [...template.answer] }],
      };
    },
  });
  controlledAuthors.add(author);
  return author;
}

function isControlledMockTeacherAuthor(provider) {
  return controlledAuthors.has(provider);
}

module.exports = { createMockTeacherAuthor, isControlledMockTeacherAuthor };
