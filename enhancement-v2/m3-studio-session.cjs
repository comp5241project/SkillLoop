/** Process-local M3-03 studio state. This is not an account or persistence boundary. */
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { convertStudentCatalog } = require('./legacy-adapter.cjs');
const { createMockTeacherAuthor } = require('./m3-mock-author.cjs');
const { makeCaseRef, createManualDraft, generateTeacherProposal, adoptTeacherProposal,
  rejectTeacherProposal, draftPreview, validateTeacherDraft, validateCaseRef,
  validateBrief, validateContent, TEMPLATE_VERSION } = require('./m3-teacher-draft.cjs');

const root = path.resolve(__dirname, '..');
const publicCase = () => convertStudentCatalog(root)['cart-checkout'];
const ref = () => makeCaseRef({ caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases' });
const clone = (value) => structuredClone(value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Reflect.ownKeys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));

class StudioError extends Error {
  constructor(message, status = 422, fields = {}, code = 'validation-error') {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

function fieldErrors(form, briefOnly = false, source = publicCase()) {
  const fields = {};
  const set = (key, message) => { if (!fields[key]) fields[key] = message; };
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    set('form', 'Enter a teaching brief and material.'); return fields;
  }
  const expected = briefOnly ? ['brief'] : ['brief', 'content'];
  if (Reflect.ownKeys(form).length !== expected.length ||
      !expected.every((key) => Object.hasOwn(form, key)))
    set('form', 'Only the teaching brief and material are accepted.');
  const { brief, content } = form;
  if (!brief || typeof brief !== 'object') {
    set('brief', 'Enter the teaching brief.'); return fields;
  }
  if (typeof brief.topic !== 'string' || brief.topic.trim().length < 5 || brief.topic.length > 160)
    set('brief.topic', 'Topic must be 5–160 characters.');
  if (!['beginner', 'intermediate', 'advanced'].includes(brief.learnerLevel))
    set('brief.learnerLevel', 'Choose a learner level.');
  if (typeof brief.constraints !== 'string' || brief.constraints.length > 500)
    set('brief.constraints', 'Constraints must be at most 500 characters.');
  const allowed = new Set(source.requirements.map((item) => item.requirementId));
  if (!Array.isArray(brief.objectives) || brief.objectives.length < 1 || brief.objectives.length > 3)
    set('brief.objectives', 'Add 1–3 learning objectives.');
  else brief.objectives.forEach((objective, index) => {
    if (typeof objective?.objectiveId !== 'string' || !/^obj-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(objective.objectiveId))
      set(`brief.objectives[${index}].objectiveId`, 'Use an ID such as obj-empty-cart.');
    if (typeof objective?.text !== 'string' || objective.text.trim().length < 8 || objective.text.length > 240)
      set(`brief.objectives[${index}].text`, 'Objective must be 8–240 characters.');
    if (!Array.isArray(objective?.requirementIds) || objective.requirementIds.length < 1 ||
        objective.requirementIds.length > 3 || new Set(objective.requirementIds).size !== objective.requirementIds.length ||
        !objective.requirementIds.every((id) => allowed.has(id)))
      set(`brief.objectives[${index}].requirementIds`, 'Choose 1–3 distinct published requirements.');
  });
  if (briefOnly) return fields;
  if (!content || typeof content !== 'object') {
    set('content', 'Enter teaching material.'); return fields;
  }
  if (typeof content.title !== 'string' || content.title.trim().length < 5 || content.title.length > 120)
    set('content.title', 'Title must be 5–120 characters.');
  if (typeof content.explanation !== 'string' || content.explanation.trim().length < 30 || content.explanation.length > 2000)
    set('content.explanation', 'Explanation must be 30–2000 characters.');
  if (!Array.isArray(content.objectives) || content.objectives.length !== brief.objectives?.length)
    set('content.objectives', 'Provide one teaching objective for each brief objective.');
  else content.objectives.forEach((objective, index) => {
    if (typeof objective?.text !== 'string' || objective.text.trim().length < 8 || objective.text.length > 240)
      set(`content.objectives[${index}].text`, 'Teaching objective must be 8–240 characters.');
  });
  if (typeof content.codeExample?.excerpt !== 'string' || content.codeExample.excerpt.trim().length < 8 ||
      !source.starterCode.includes(content.codeExample.excerpt))
    set('content.codeExample.excerpt', 'Copy an exact excerpt from the public starter code.');
  if (typeof content.codeExample?.prompt !== 'string' || content.codeExample.prompt.trim().length < 12 ||
      content.codeExample.prompt.length > 400)
    set('content.codeExample.prompt', 'Code-reading prompt must be 12–400 characters.');
  if (!Array.isArray(content.exercises) || content.exercises.length < 1 || content.exercises.length > 3)
    set('content.exercises', 'Add 1–3 exercises.');
  else content.exercises.forEach((exercise, index) => {
    if (typeof exercise?.exerciseId !== 'string' || !/^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exercise.exerciseId))
      set(`content.exercises[${index}].exerciseId`, 'Use an ID such as ex-empty-cart-trace.');
    if (typeof exercise?.prompt !== 'string' || exercise.prompt.trim().length < 12 || exercise.prompt.length > 500)
      set(`content.exercises[${index}].prompt`, 'Exercise prompt must be 12–500 characters.');
    if (!Array.isArray(exercise?.requirementIds) || exercise.requirementIds.length < 1 ||
        exercise.requirementIds.length > 3 || new Set(exercise.requirementIds).size !== exercise.requirementIds.length ||
        !exercise.requirementIds.every((id) => allowed.has(id)))
      set(`content.exercises[${index}].requirementIds`, 'Choose 1–3 distinct published requirements.');
    if (!Array.isArray(exercise?.teacherAnswerGuidance) ||
        !exercise.teacherAnswerGuidance.some((answer) => typeof answer === 'string' && answer.trim().length >= 3))
      set(`content.exercises[${index}].teacherAnswerGuidance`, 'Add teacher-only answer guidance.');
    if (!Array.isArray(exercise?.publicHints) || exercise.publicHints.length > 3 ||
        exercise.publicHints.some((hint) => typeof hint !== 'string' || hint.trim().length < 3 || hint.length > 180))
      set(`content.exercises[${index}].publicHints`, 'Use up to three public hints of 3–180 characters.');
  });
  return fields;
}

function checked(form, briefOnly = false) {
  const fields = fieldErrors(form, briefOnly);
  if (Object.keys(fields).length) throw new StudioError('Correct the highlighted fields.', 422, fields);
  try {
    if (briefOnly) {
      const { validateBrief } = require('./m3-teacher-draft.cjs');
      validateBrief(form.brief, publicCase());
      return null;
    }
    return createManualDraft({ caseRef: ref(), brief: form.brief, content: form.content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid teaching material';
    const field = /requirementId|objective/i.test(message) ? 'brief.objectives' :
      /exercise|answer guidance/i.test(message) ? 'content.exercises' :
      /code excerpt/i.test(message) ? 'content.codeExample.excerpt' : 'form';
    throw new StudioError(message, 422, { [field]: message });
  }
}

function displayProposal(proposal) {
  if (!proposal) return null;
  const { content } = proposal;
  return { proposalId: proposal.proposalId, source: 'deterministic-mock',
    brief: { topic: proposal.brief.topic, learnerLevel: proposal.brief.learnerLevel,
      objectives: proposal.brief.objectives.map(({ objectiveId, text, requirementIds }) =>
        ({ objectiveId, text, requirementIds: [...requirementIds] })),
      constraints: proposal.brief.constraints },
    title: content.title,
    objectives: content.objectives.map(({ objectiveId, text, requirementIds }) =>
      ({ objectiveId, text, requirementIds: [...requirementIds] })),
    explanation: content.explanation,
    codeExample: { kind: content.codeExample.kind, excerpt: content.codeExample.excerpt,
      prompt: content.codeExample.prompt },
    exercises: content.exercises.map(({ exerciseId, kind, prompt, requirementIds, publicHints,
      teacherAnswerGuidance }) => ({ exerciseId, kind, prompt, requirementIds: [...requirementIds],
      publicHints: [...publicHints], teacherAnswerGuidance: [...teacherAnswerGuidance] })) };
}

function importedDraft(jsonText) {
  if (typeof jsonText !== 'string' || jsonText.length > 100000)
    throw new StudioError('Choose a JSON draft file below 100 KB.');
  let document;
  try { document = JSON.parse(jsonText); }
  catch { throw new StudioError('The selected file is not valid JSON.'); }
  if (!exact(document, ['format', 'draft']) || document.format !== 'skillloop-teacher-draft-v1')
    throw new StudioError('Unsupported teacher draft export format.');
  const source = document.draft;
  if (!exact(source, ['schemaVersion', 'draftId', 'status', 'revision', 'caseRef',
    'brief', 'content', 'provenance']) || source.schemaVersion !== 1 ||
    !UUID.test(source.draftId) || source.status !== 'draft-only' ||
    !Number.isSafeInteger(source.revision) || source.revision < 1 ||
    !exact(source.provenance, ['origin', 'proposalId', 'templateVersion']) ||
    !((['manual', 'imported'].includes(source.provenance.origin) &&
      source.provenance.proposalId === null && source.provenance.templateVersion === null) ||
      (source.provenance.origin === 'mock-proposal' && UUID.test(source.provenance.proposalId) &&
        source.provenance.templateVersion === TEMPLATE_VERSION) ||
      (source.provenance.origin === 'unverified-provider' && UUID.test(source.provenance.proposalId) &&
        source.provenance.templateVersion === null)))
    throw new StudioError('Invalid TeacherDraft identity, revision or draft-only status.');
  try {
    const publicCase = validateCaseRef(source.caseRef);
    validateBrief(source.brief, publicCase);
    validateContent(source.content, source.brief, publicCase);
  } catch (error) {
    throw new StudioError(`Imported draft failed canonical validation: ${error.message}`);
  }
  const restored = createManualDraft({ caseRef: source.caseRef, brief: source.brief,
    content: source.content });
  restored.provenance = { origin: 'imported', proposalId: null, templateVersion: null };
  validateTeacherDraft(restored);
  return { draft: restored, declaredOrigin: source.provenance.origin,
    sourceRevision: source.revision };
}

function createStudioSession() {
  let draft = null;
  let proposal = null;
  let checkpoint = null;
  let importSource = null;
  const author = createMockTeacherAuthor();
  const revision = () => draft?.revision ?? null;
  const checkExpected = (input, names) => {
    if (!exact(input, names) || !Object.hasOwn(input, 'expectedRevision') ||
        !Object.hasOwn(input, 'expectedDraftId') ||
        input.expectedRevision !== revision() || input.expectedDraftId !== (draft?.draftId ?? null))
      throw new StudioError('Draft revision changed. Your edits are intact; reload latest only if you choose to replace them.',
        409, { revision: 'Another tab has a newer draft identity or revision.' }, 'revision-conflict');
    if (draft) validateTeacherDraft(draft);
  };
  const nextManual = (form) => {
    const next = checked(form);
    if (draft) {
      next.draftId = draft.draftId;
      next.revision = draft.revision + 1;
      validateTeacherDraft(next);
    }
    return next;
  };
  const checkpointView = () => checkpoint ? { draftId: checkpoint.draftId,
    revision: checkpoint.revision, origin: checkpoint.provenance.origin } : null;
  const state = () => ({ case: { caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases',
    requirements: clone(publicCase().requirements), starterCode: publicCase().starterCode },
    draft: draft ? { draftId: draft.draftId, status: draft.status, revision: draft.revision,
      origin: draft.provenance.origin, brief: clone(draft.brief), content: clone(draft.content) } : null,
    checkpoint: checkpointView(), importSource: importSource ? clone(importSource) : null,
    proposal: displayProposal(proposal), storage: 'process-memory-only' });
  return {
    state,
    validate(form) { checked(form); return { valid: true }; },
    preview(form) { return { preview: draftPreview(checked(form)) }; },
    saveManual(input) {
      checkExpected(input, ['expectedDraftId', 'expectedRevision', 'form']);
      draft = nextManual(input.form); proposal = null; importSource = null;
      return { draft: state().draft };
    },
    saveCheckpoint(input) {
      checkExpected(input, ['expectedDraftId', 'expectedRevision', 'form']);
      const valid = checked(input.form);
      if (!draft || !isDeepStrictEqual(valid.brief, draft.brief) ||
          !isDeepStrictEqual(valid.content, draft.content)) {
        draft = nextManual(input.form);
        importSource = null;
      }
      checkpoint = clone(draft);
      proposal = null;
      return { draft: state().draft, checkpoint: checkpointView() };
    },
    reopenCheckpoint(input) {
      checkExpected(input, ['expectedDraftId', 'expectedRevision', 'confirmReplace']);
      if (!checkpoint) throw new StudioError('No saved checkpoint in this server process.', 404);
      if (input.confirmReplace !== true)
        throw new StudioError('Confirm replacement of current local edits.', 409);
      validateTeacherDraft(checkpoint);
      if (!isDeepStrictEqual(draft.brief, checkpoint.brief) ||
          !isDeepStrictEqual(draft.content, checkpoint.content)) {
        const next = createManualDraft({ caseRef: checkpoint.caseRef, brief: checkpoint.brief,
          content: checkpoint.content, draftId: draft.draftId });
        next.revision = draft.revision + 1;
        validateTeacherDraft(next);
        draft = next;
        importSource = null;
      }
      proposal = null;
      return { draft: state().draft, checkpoint: checkpointView() };
    },
    exportDraft(input) {
      checkExpected(input, ['expectedDraftId', 'expectedRevision']);
      if (!draft) throw new StudioError('No valid local draft to export.', 404);
      validateTeacherDraft(draft);
      return { filename: `skillloop-cart-checkout-edge-cases-draft-${draft.draftId}.json`,
        document: { format: 'skillloop-teacher-draft-v1', draft: clone(draft) } };
    },
    importDraft(input) {
      checkExpected(input, ['expectedDraftId', 'expectedRevision', 'confirmReplace', 'jsonText']);
      if (draft && input.confirmReplace !== true)
        throw new StudioError('Confirm replacement of the current local draft.', 409);
      const restored = importedDraft(input.jsonText);
      draft = restored.draft;
      importSource = { declaredOrigin: restored.declaredOrigin,
        sourceRevision: restored.sourceRevision, verified: false };
      checkpoint = null;
      proposal = null;
      return { draft: state().draft, importSource: state().importSource };
    },
    async generate(form) {
      checked(form, true);
      proposal = await generateTeacherProposal({ caseRef: ref(), brief: form.brief }, author);
      return { proposal: displayProposal(proposal) };
    },
    accept(input) {
      checkExpected(input, ['expectedDraftId', 'expectedRevision', 'proposalId', 'confirmReplace']);
      if (!proposal || input?.proposalId !== proposal.proposalId)
        throw new StudioError('Proposal is unavailable or changed.', 409);
      if (draft && input.confirmReplace !== true)
        throw new StudioError('Confirm replacement of the current local draft.', 409);
      // The original server-held object is required by the M3-02R2 WeakMap.
      draft = adoptTeacherProposal(proposal);
      proposal = null;
      checkpoint = null;
      importSource = null;
      return { draft: state().draft };
    },
    reject(input) {
      if (!proposal || input?.proposalId !== proposal.proposalId)
        throw new StudioError('Proposal is unavailable or changed.', 409);
      rejectTeacherProposal(proposal);
      proposal = null;
      return { rejected: true, draft: state().draft };
    },
    previewAccepted() {
      if (!draft) throw new StudioError('No accepted local draft.', 404);
      validateTeacherDraft(draft);
      return { preview: draftPreview(draft) };
    },
  };
}

module.exports = { createStudioSession, StudioError, fieldErrors };
