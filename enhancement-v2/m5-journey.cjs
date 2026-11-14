const diagnosisModel = require('../learning-path/diagnosis-model.js');
const { validateFactualClaims } = require('./m2-factual-gate.cjs');
const { validateModelProposal, MODEL_OUTPUT_PROTOCOL_VERSION } = require('./m2-model-proposal.cjs');
const runner = require('../correction-lab/break-runner.js');
const dialogueModel = require('../interview/dialogue-model.js');
const { journeyCase, approvedRunner } = require('./m5-case-library.cjs');

class JourneyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit && !value.includes('\x00');
const stages = ['diagnosis', 'learning', 'repair', 'verification'];

function context(publication) {
  const { caseId, caseVersion, conceptId } = publication.lesson.caseRef;
  const item = journeyCase(caseId, caseVersion, conceptId);
  if (!item) throw new JourneyError(409, 'This case version is unavailable for the learning journey.');
  return item;
}

function questions(item) {
  return item.diagnosis.questions.map(({ id, prompt, options }) => ({
    id, prompt, options: options.map(({ id: optionId, label }) => ({ id: optionId, label })),
  }));
}

function diagnose(item, input) {
  if (!object(input?.answers) || Object.keys(input.answers).length !== item.diagnosis.questions.length)
    throw new JourneyError(422, 'Answer every diagnosis check.');
  const responses = item.diagnosis.questions.map((question) => {
    const answer = input.answers[question.id];
    if (!question.options.some(({ id }) => id === answer?.optionId) || !text(answer.explanation, 400))
      throw new JourneyError(422, 'Choose a valid answer for every diagnosis check.');
    return { questionId: question.id, optionId: answer.optionId, explanation: answer.explanation.trim() };
  });
  const result = diagnosisModel.buildLocalDiagnosis(item.diagnosis, responses);
  const ranked = item.teaching.targets.map((target) => {
    const question = item.diagnosis.questions.find(({ id }) => id === target.questionId);
    const response = responses.find(({ questionId }) => questionId === question.id);
    const option = question.options.find(({ id }) => id === response.optionId);
    return { target, response, option, question };
  }).sort((a, b) => a.option.score - b.option.score);
  const { target, response, option, question } = ranked[0];
  return { responses, summary: result.overall.summary, target: target.requirementId, issueId: target.issueId,
    evidence: { question: question.prompt, answer: option.label, explanation: response.explanation,
      practiceRecommended: option.score < 2 } };
}

async function teaching(item, publication, diagnosis) {
  const target = item.teaching.targets.find(({ requirementId }) => requirementId === diagnosis.target);
  const { caseId, caseVersion, starterCode, requirements } = item.publicCase;
  const { conceptId } = item.teaching;
  const lesson = publication.lesson;
  const matching = lesson.objectives.some(({ requirementIds }) => requirementIds.includes(target.requirementId));
  const requirement = requirements.find(({ requirementId }) => requirementId === target.requirementId);
  const fallback = {
    caseId, caseVersion, conceptId, requirementRefs: [target.requirementId],
    objective: 'Apply the requirement to the delivered code.', explanation: target.explanation,
    codeExample: { kind: 'trace', excerpt: target.excerpt, prompt: 'Trace this expression with a boundary input.' },
    exercise: { kind: 'short-answer', prompt: target.practice.prompt, publicHints: ['Compare your reasoning with the case requirement.'] },
  };
  const pack = { caseId, caseVersion, conceptId, requirements: [requirement], starterCode };
  const check = (card) => validateFactualClaims({ publicCard: card }, pack, item.publicCase);
  check(fallback);
  let card = fallback;
  let aiState = 'not-enabled';
  // The repository-owned deterministic provider publishes only fixed templates for these targets.
  // Neither a live provider nor the synthetic M2 review registry can approve student delivery.
  if (item.teaching.templateProvider) {
    try {
      const draft = await item.teaching.templateProvider.generate({
        case: pack, target: { requirementId: target.requirementId, evidence: { quote: diagnosis.evidence.answer } },
      });
      const proposal = validateModelProposal({
        protocolVersion: MODEL_OUTPUT_PROTOCOL_VERSION,
        publicContent: { objective: draft.publicCard.objective, explanation: draft.publicCard.explanation,
          codeTracePrompt: draft.publicCard.codeExample.prompt,
          exercise: { prompt: draft.publicCard.exercise.prompt, publicHints: draft.publicCard.exercise.publicHints } },
        internalProposal: Object.fromEntries(['targetGap', 'expectedElements', 'observableCriteria', 'followUpPolicy']
          .map((key) => [key, draft.internalAssessment[key]])),
      });
      const { objective, explanation, codeTracePrompt, exercise } = proposal.publicContent;
      const candidate = { ...fallback, objective, explanation, codeExample: { ...fallback.codeExample, prompt: codeTracePrompt },
        exercise: { kind: 'short-answer', ...exercise } };
      check(candidate);
      card = candidate;
      aiState = 'deterministic-validated';
    } catch {
      aiState = 'validation-fallback';
    }
  }
  return { source: matching ? 'teacher-published' : aiState === 'deterministic-validated'
    ? 'deterministic-m2' : 'authored-fallback', aiState,
    requirement, card, practice: { prompt: target.practice.prompt, options: target.practice.options },
    published: { title: lesson.title, explanation: lesson.explanation, matching,
      objectives: lesson.objectives.filter(({ requirementIds }) => requirementIds.includes(target.requirementId)),
      codeExample: matching ? lesson.codeExample : null,
      exercises: lesson.exercises.filter(({ requirementIds }) => requirementIds.includes(target.requirementId)) } };
}

function learn(item, current, input) {
  const target = item.teaching.targets.find(({ requirementId }) => requirementId === current.diagnosis.target);
  const { option, explanation } = input ?? {};
  if (!Number.isSafeInteger(option) || option < 0 || option >= target.practice.options.length ||
      !text(explanation, 1200) || !explanation.trim())
    throw new JourneyError(422, 'Choose an answer and explain your reasoning.');
  return { answer: target.practice.options[option], explanation: explanation.trim(),
    observation: option === target.practice.correct ? 'correct-choice' : 'needs-practice',
    feedback: target.practice.followUp[option] };
}

function repairChoices(item, diagnosis) {
  const level = approvedRunner(item.definition);
  if (!level) return null;
  return [...item.definition.publicIssues].sort((a, b) =>
    Number(b.issueId === diagnosis.issueId) - Number(a.issueId === diagnosis.issueId))
    .map(({ issueId, title, observed, suggestedChecks }) => ({ issueId, title, observed,
      checks: item.definition.publicTests.filter(({ testId }) => suggestedChecks.includes(testId)),
      choices: level.repair.fixes[issueId].map(({ label }) => label),
    }));
}

function repair(item, input, previous) {
  const level = approvedRunner(item.definition);
  if (!level) throw new JourneyError(409, 'Verification is unavailable for this case version.');
  const { choices, requests } = input ?? {};
  const ids = item.definition.publicIssues.map(({ issueId }) => issueId);
  if (!object(choices) || !object(requests) || Object.keys(choices).length !== ids.length ||
      Object.keys(requests).length !== ids.length || !ids.every((id) => Number.isSafeInteger(choices[id]) &&
        choices[id] >= 0 && choices[id] < level.repair.fixes[id].length && text(requests[id], 1000) && requests[id].trim()))
    throw new JourneyError(422, 'Write a repair request and select an implementation change for each issue.');
  const reviewCase = { caseId: item.definition.caseId, issues: item.definition.publicIssues,
    tests: item.definition.publicTests };
  const plan = dialogueModel.confirmedRepairPlan(reviewCase,
    Object.fromEntries(ids.map(id => [id, { request: requests[id].trim() }])),
    'Review each learner-selected change by running the case tests.', 'sample');
  const { problems } = runner.checkDialogue(plan, reviewCase);
  if (problems.length) throw new JourneyError(422, problems[0]);
  return { choices, requests, plan, dialogue: previous?.dialogue ?? [] };
}

function respondToRepair(item, diagnosis, previous, input) {
  if (!text(input.message, 1000) || !input.message.trim())
    throw new JourneyError(422, 'Write a repair request or a question first.');
  const history = previous?.dialogue ?? [];
  const focus = item.definition.publicIssues.find(({ issueId }) => issueId === diagnosis.issueId);
  const feedback = history.length === 0 ? focus.observed + ' What observable result should the change produce?'
    : history.length === 1 ? 'What boundary or invalid input would distinguish your repair from the original delivery?'
    : 'Before you save the plan, compare each request with the checks below. The runner will verify the selected changes.';
  return { dialogue: [...history.slice(-9), { message: input.message.trim(), feedback }] };
}

async function verify(item, plan) {
  const level = approvedRunner(item.definition);
  if (!level) throw new JourneyError(409, 'Verification is unavailable for this case version.');
  if (runner.checkDialogue(plan.plan, { caseId: item.definition.caseId,
    issues: item.definition.publicIssues, tests: item.definition.publicTests }).problems.length)
    throw new JourneyError(409, 'Confirm a valid repair plan for this case before verification.');
  // Execute only code assembled from vetted fixture choices, never client-supplied source or tests.
  const tests = await runner.runTests(runner.assemble(level, plan.choices), level.fns, level.checks);
  return { outcome: runner.outcome(tests), tests, ranAt: new Date().toISOString() };
}

async function advance(item, current, action, input) {
  const history = current.verificationHistory ? { verificationHistory: current.verificationHistory } : {};
  switch (action) {
    case 'diagnosis': return { ...history, diagnosis: diagnose(item, input) };
    case 'learning':
      if (current.diagnosis) return { ...history, diagnosis: current.diagnosis, learning: learn(item, current, input) };
      break;
    case 'repair':
      if (current.learning) return { ...history, diagnosis: current.diagnosis, learning: current.learning,
        repair: input?.message !== undefined ? respondToRepair(item, current.diagnosis, current.repair, input)
          : repair(item, input, current.repair) };
      break;
    case 'verification':
      if (current.repair?.choices) {
        const verification = await verify(item, current.repair);
        return { ...current, verification, verificationHistory: {
          count: (current.verificationHistory?.count || 0) + 1, lastRun: verification,
        } };
      }
      break;
  }
  throw new JourneyError(409, 'Complete the previous stage before continuing.');
}

async function journeyView(publication, item, attempt, stage) {
  const state = attempt.journey;
  const response = { courseId: publication.courseId, version: publication.version,
    caseRef: publication.lesson.caseRef, case: item.publicCase, courseTitle: publication.lesson.title,
    attemptId: attempt.attempt_id, revision: state.revision || 0,
    completed: stages.filter((name) => name === 'repair' ? state.repair?.choices : state[name]) };
  if (stage === 'diagnosis') return { ...response, questions: questions(item), result: state.diagnosis?.evidence ?? null,
    answers: state.diagnosis?.responses ?? [] };
  if (stage === 'learning' && state.diagnosis)
    return { ...response, diagnosis: state.diagnosis.evidence, teaching: await teaching(item, publication, state.diagnosis),
      result: state.learning ?? null };
  if (stage === 'repair' && state.learning)
    return { ...response, focus: state.diagnosis.issueId, feedback: state.learning.feedback,
      issues: repairChoices(item, state.diagnosis), result: state.repair ?? null };
  if (stage === 'verification' && state.repair?.choices)
    return { ...response, result: state.verification ?? null };
  throw new JourneyError(409, 'Complete the previous stage before continuing.');
}

module.exports = { JourneyError, stages, context, advance, journeyView };
