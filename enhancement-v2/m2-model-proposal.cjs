/** Model-authored fields only. TeachingDraft v1 remains a separate application contract. */
const MODEL_OUTPUT_PROTOCOL_VERSION = 2;
const PROMPT_VERSION = 'm2-real-v2';
const text = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...names].sort().join('|');
const list = (value, max) => Array.isArray(value) && value.length > 0 &&
  value.every((item) => text(item, max));

const MODEL_OUTPUT_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['protocolVersion', 'publicContent', 'internalProposal'],
  properties: {
    protocolVersion: { const: MODEL_OUTPUT_PROTOCOL_VERSION },
    publicContent: { type: 'object', additionalProperties: false,
      required: ['objective', 'explanation', 'codeTracePrompt', 'exercise'],
      properties: {
        objective: { type: 'string', maxLength: 240 },
        explanation: { type: 'string', maxLength: 1200 },
        codeTracePrompt: { type: 'string', maxLength: 300 },
        exercise: { type: 'object', additionalProperties: false,
          required: ['prompt', 'publicHints'],
          properties: { prompt: { type: 'string', maxLength: 400 },
            publicHints: { type: 'array', maxItems: 3,
              items: { type: 'string', maxLength: 180 } } } },
      } },
    internalProposal: { type: 'object', additionalProperties: false,
      required: ['targetGap', 'expectedElements', 'observableCriteria', 'followUpPolicy'],
      properties: {
        targetGap: { type: 'string', maxLength: 200 },
        expectedElements: { type: 'array',
          items: { type: 'string', maxLength: 240 } },
        observableCriteria: { type: 'array',
          items: { type: 'string', maxLength: 240 } },
        followUpPolicy: { type: 'object', additionalProperties: false,
          required: ['correct', 'partial', 'incorrect'],
          properties: { correct: { type: 'string', maxLength: 240 },
            partial: { type: 'string', maxLength: 240 },
            incorrect: { type: 'string', maxLength: 240 } } },
      } },
  },
});

function validateModelProposal(proposal) {
  if (!keys(proposal, ['protocolVersion', 'publicContent', 'internalProposal']) ||
      proposal.protocolVersion !== MODEL_OUTPUT_PROTOCOL_VERSION)
    throw new Error('Invalid model proposal protocol');
  const content = proposal.publicContent;
  if (!keys(content, ['objective', 'explanation', 'codeTracePrompt', 'exercise']) ||
      !text(content.objective, 240) || !text(content.explanation, 1200) ||
      !text(content.codeTracePrompt, 300) ||
      !keys(content.exercise, ['prompt', 'publicHints']) ||
      !text(content.exercise.prompt, 400) || !Array.isArray(content.exercise.publicHints) ||
      content.exercise.publicHints.length > 3 ||
      !content.exercise.publicHints.every((hint) => text(hint, 180)))
    throw new Error('Invalid model-authored public content');
  const assessment = proposal.internalProposal;
  if (!keys(assessment, ['targetGap', 'expectedElements', 'observableCriteria', 'followUpPolicy']) ||
      !text(assessment.targetGap, 200) || !list(assessment.expectedElements, 240) ||
      !list(assessment.observableCriteria, 240) ||
      !keys(assessment.followUpPolicy, ['correct', 'partial', 'incorrect']) ||
      !Object.values(assessment.followUpPolicy).every((value) => text(value, 240)))
    throw new Error('Invalid model-authored assessment proposal');
  return proposal;
}

module.exports = { MODEL_OUTPUT_PROTOCOL_VERSION, PROMPT_VERSION,
  MODEL_OUTPUT_SCHEMA, validateModelProposal };
