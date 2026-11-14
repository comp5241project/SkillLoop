/** M3-02 isolated course-material drafts. No account, database, API or publication authority. */
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { convertEvaluationCatalog } = require('./legacy-adapter.cjs');
const { isControlledMockTeacherAuthor } = require('./m3-mock-author.cjs');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_VERSION = 'm3-mock-v1';
const issuedMockProposals = new WeakMap();
const adoptedMockDrafts = new Map();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECTIVE_ID = /^obj-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXERCISE_ID = /^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fail = (reason) => { throw new Error(reason); };
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
  Reflect.ownKeys(value).length === names.length && names.every((name) => {
    const field = Object.getOwnPropertyDescriptor(value, name);
    return field?.enumerable === true && Object.hasOwn(field, 'value');
  });
const denseArray = (value) => Array.isArray(value) &&
  Reflect.ownKeys(value).length === value.length + 1 &&
  Array.from({ length: value.length }, (_, index) => {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    return field?.enumerable === true && Object.hasOwn(field, 'value');
  }).every(Boolean);
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min &&
  value.length <= max;
const unique = (values) => new Set(values).size === values.length;

function stableSerialize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  fail('Non-JSON value in public facts');
}

function publicCaseFor({ caseId, caseVersion, conceptId }) {
  const registered = require('./m5-case-library.cjs').journeyCase(caseId, caseVersion, conceptId);
  if (!registered?.publicCase.capabilities.learning) fail('Unsupported case, version or concept for authoring');
  return registered.publicCase;
}

function makeCaseRef(identity = { caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases' }) {
  if (!exact(identity, ['caseId', 'caseVersion', 'conceptId'])) fail('Invalid case identity');
  const view = publicCaseFor(identity);
  return { kind: 'case-bound', caseId: identity.caseId, caseVersion: identity.caseVersion,
    conceptId: identity.conceptId,
    publicFactsDigest: createHash('sha256').update(stableSerialize(view), 'utf8').digest('hex') };
}

function validateCaseRef(ref) {
  if (!exact(ref, ['kind', 'caseId', 'caseVersion', 'conceptId', 'publicFactsDigest']) ||
      ref.kind !== 'case-bound' || !/^[0-9a-f]{64}$/.test(ref.publicFactsDigest)) fail('Invalid case reference');
  const canonical = makeCaseRef({ caseId: ref.caseId, caseVersion: ref.caseVersion, conceptId: ref.conceptId });
  if (!isDeepStrictEqual(ref, canonical)) fail('Public facts digest differs from canonical Student View');
  return publicCaseFor(ref);
}

function references(values, allowed, name, min = 1, max = 3) {
  if (!denseArray(values) || values.length < min || values.length > max || !unique(values) ||
      !values.every((value) => typeof value === 'string' && allowed.has(value)))
    fail(`Invalid ${name} requirementId references`);
}

function validateBrief(brief, publicCase) {
  if (!exact(brief, ['topic', 'learnerLevel', 'objectives', 'constraints']) ||
      !text(brief.topic, 5, 160) || !['beginner', 'intermediate', 'advanced'].includes(brief.learnerLevel) ||
      typeof brief.constraints !== 'string' || brief.constraints.length > 500 ||
      !denseArray(brief.objectives) || brief.objectives.length < 1 || brief.objectives.length > 3)
    fail('Invalid teacher brief');
  const allowed = new Set(publicCase.requirements.map(({ requirementId }) => requirementId));
  const objectiveIds = [];
  for (const objective of brief.objectives) {
    if (!exact(objective, ['objectiveId', 'text', 'requirementIds']) ||
        !OBJECTIVE_ID.test(objective.objectiveId) || !text(objective.text, 8, 240))
      fail('Invalid teacher objective');
    references(objective.requirementIds, allowed, 'brief');
    objectiveIds.push(objective.objectiveId);
  }
  if (!unique(objectiveIds)) fail('Duplicate objectiveId');
  return brief;
}

function validateContent(content, brief, publicCase) {
  if (!exact(content, ['title', 'objectives', 'explanation', 'codeExample', 'exercises']) ||
      !text(content.title, 5, 120) || !text(content.explanation, 30, 2000) ||
      !denseArray(content.objectives) || content.objectives.length !== brief.objectives.length ||
      !denseArray(content.exercises) || content.exercises.length < 1 || content.exercises.length > 3)
    fail('Missing or oversized teaching content');
  const allowed = new Set(publicCase.requirements.map(({ requirementId }) => requirementId));
  const briefById = new Map(brief.objectives.map((objective) => [objective.objectiveId, objective]));
  const ids = [];
  for (const objective of content.objectives) {
    if (!exact(objective, ['objectiveId', 'text', 'requirementIds']) ||
        !OBJECTIVE_ID.test(objective.objectiveId) || !briefById.has(objective.objectiveId) ||
        !text(objective.text, 8, 240)) fail('Invalid proposed objective');
    references(objective.requirementIds, allowed, 'objective');
    if (!isDeepStrictEqual(objective.requirementIds, briefById.get(objective.objectiveId).requirementIds))
      fail('Proposed objective changed source requirement references');
    ids.push(objective.objectiveId);
  }
  if (!unique(ids)) fail('Duplicate objectiveId');
  const example = content.codeExample;
  if (!exact(example, ['kind', 'excerpt', 'prompt']) || example.kind !== 'trace' ||
      !text(example.excerpt, 8, 600) || !publicCase.starterCode.includes(example.excerpt) ||
      !text(example.prompt, 12, 400)) fail('Code excerpt is not from canonical public starter code');
  const exerciseIds = [];
  const selectedRefs = new Set(brief.objectives.flatMap((objective) => objective.requirementIds));
  for (const exercise of content.exercises) {
    if (!exact(exercise, ['exerciseId', 'kind', 'prompt', 'requirementIds', 'publicHints', 'teacherAnswerGuidance']) ||
        !EXERCISE_ID.test(exercise.exerciseId) || exercise.kind !== 'short-answer' ||
        !text(exercise.prompt, 12, 500) || !denseArray(exercise.publicHints) ||
        exercise.publicHints.length > 3 || !exercise.publicHints.every((hint) => text(hint, 3, 180)) ||
        !denseArray(exercise.teacherAnswerGuidance) ||
        exercise.teacherAnswerGuidance.length < 1 || exercise.teacherAnswerGuidance.length > 4 ||
        !exercise.teacherAnswerGuidance.every((answer) => text(answer, 3, 240)))
      fail('Invalid exercise or missing teacher answer guidance');
    references(exercise.requirementIds, selectedRefs, 'exercise');
    exerciseIds.push(exercise.exerciseId);
  }
  if (!unique(exerciseIds)) fail('Duplicate exerciseId');
  // This narrow check prevents copying the exact reviewed repair into public prose.
  // The private value never enters the Mock provider request or preview object.
  const referenceCode = convertEvaluationCatalog(ROOT)[publicCase.caseId]?.referenceCode;
  const publicText = [content.title, content.explanation, content.codeExample.prompt,
    ...content.objectives.map((objective) => objective.text),
    ...content.exercises.flatMap((exercise) => [exercise.prompt, ...exercise.publicHints])];
  if (referenceCode && publicText.some((value) => value.includes(referenceCode)))
    fail('Reference repair cannot appear in public teaching text');
  return content;
}

function validateDraftAndGetPublicCase(draft) {
  if (!exact(draft, ['schemaVersion', 'draftId', 'status', 'revision', 'caseRef', 'brief', 'content', 'provenance']) ||
      draft.schemaVersion !== 1 || !UUID.test(draft.draftId) || draft.status !== 'draft-only' ||
      !Number.isSafeInteger(draft.revision) || draft.revision < 1)
    fail('Invalid TeacherDraft identity or draft-only status');
  const publicCase = validateCaseRef(draft.caseRef);
  validateBrief(draft.brief, publicCase);
  validateContent(draft.content, draft.brief, publicCase);
  const p = draft.provenance;
  if (!exact(p, ['origin', 'proposalId', 'templateVersion']) ||
      !((p.origin === 'manual' && p.proposalId === null && p.templateVersion === null) ||
        (p.origin === 'mock-proposal' && UUID.test(p.proposalId) && p.templateVersion === TEMPLATE_VERSION &&
          adoptedMockDrafts.get(draft.draftId) === p.proposalId) ||
        (p.origin === 'unverified-provider' && UUID.test(p.proposalId) && p.templateVersion === null) ||
        (p.origin === 'imported' && p.proposalId === null && p.templateVersion === null)))
    fail('Invalid draft provenance');
  return publicCase;
}

function validateTeacherDraft(draft) {
  validateDraftAndGetPublicCase(draft);
  return draft;
}

function validateTeacherProposal(proposal) {
  if (!exact(proposal, ['schemaVersion', 'proposalId', 'status', 'caseRef', 'brief', 'content', 'baseDraft', 'provenance']) ||
      proposal.schemaVersion !== 1 || !UUID.test(proposal.proposalId) || proposal.status !== 'proposed')
    fail('Invalid TeacherProposal identity or status');
  const publicCase = validateCaseRef(proposal.caseRef);
  validateBrief(proposal.brief, publicCase);
  validateContent(proposal.content, proposal.brief, publicCase);
  if (proposal.baseDraft !== null && (!exact(proposal.baseDraft, ['draftId', 'revision']) ||
      !UUID.test(proposal.baseDraft.draftId) || !Number.isSafeInteger(proposal.baseDraft.revision) ||
      proposal.baseDraft.revision < 1)) fail('Invalid proposal base revision');
  const p = proposal.provenance;
  if (!exact(p, ['origin', 'templateVersion']) ||
      !((p.origin === 'mock-proposal' && p.templateVersion === TEMPLATE_VERSION &&
          issuedMockProposals.get(proposal) === stableSerialize(proposal)) ||
        (p.origin === 'unverified-provider' && p.templateVersion === null)))
    fail('Invalid proposal provenance');
  return proposal;
}

function createManualDraft(input) {
  if (!exact(input, ['caseRef', 'brief', 'content']) &&
      !exact(input, ['caseRef', 'brief', 'content', 'draftId'])) fail('Invalid manual draft input');
  const { caseRef, brief, content, draftId = randomUUID() } = input;
  const publicCase = validateCaseRef(caseRef);
  validateBrief(brief, publicCase);
  validateContent(content, brief, publicCase);
  const draft = { schemaVersion: 1, draftId, status: 'draft-only', revision: 1,
    caseRef: structuredClone(caseRef), brief: structuredClone(brief), content: structuredClone(content),
    provenance: { origin: 'manual', proposalId: null, templateVersion: null } };
  validateTeacherDraft(draft);
  return draft;
}

async function generateTeacherProposal(input, provider) {
  if (!exact(input, ['caseRef', 'brief']) && !exact(input, ['caseRef', 'brief', 'draft']))
    fail('Invalid Mock authoring input');
  const { caseRef, brief, draft = null } = input;
  if (!provider || typeof provider.generate !== 'function') fail('Authoring provider required');
  const publicCase = validateCaseRef(caseRef);
  validateBrief(brief, publicCase);
  if (draft !== null) {
    validateTeacherDraft(draft);
    if (!isDeepStrictEqual(draft.caseRef, caseRef) || !isDeepStrictEqual(draft.brief, brief))
      fail('Proposal brief or case differs from base draft');
  }
  const request = { caseRef: structuredClone(caseRef), brief: structuredClone(brief),
    publicCase: structuredClone(publicCase) };
  const content = await provider.generate(request);
  validateContent(content, brief, publicCase);
  const controlledMock = isControlledMockTeacherAuthor(provider);
  const proposal = { schemaVersion: 1, proposalId: randomUUID(), status: 'proposed',
    caseRef: structuredClone(caseRef), brief: structuredClone(brief), content: structuredClone(content),
    baseDraft: draft === null ? null : { draftId: draft.draftId, revision: draft.revision },
    provenance: controlledMock
      ? { origin: 'mock-proposal', templateVersion: TEMPLATE_VERSION }
      : { origin: 'unverified-provider', templateVersion: null } };
  if (controlledMock) issuedMockProposals.set(proposal, stableSerialize(proposal));
  return validateTeacherProposal(proposal);
}

function checkDecisionBase(proposal, draft) {
  validateTeacherProposal(proposal);
  if (proposal.baseDraft === null && draft !== null) fail('New proposal cannot replace a draft');
  if (proposal.baseDraft !== null) {
    validateTeacherDraft(draft);
    if (draft.draftId !== proposal.baseDraft.draftId || draft.revision !== proposal.baseDraft.revision ||
        !isDeepStrictEqual(draft.caseRef, proposal.caseRef) || !isDeepStrictEqual(draft.brief, proposal.brief))
      fail('Proposal is stale or belongs to another draft');
  }
}

function adoptTeacherProposal(proposal, draft = null, draftId = randomUUID()) {
  checkDecisionBase(proposal, draft);
  const next = { schemaVersion: 1, draftId: draft ? draft.draftId : draftId, status: 'draft-only',
    revision: draft ? draft.revision + 1 : 1, caseRef: structuredClone(proposal.caseRef),
    brief: structuredClone(proposal.brief), content: structuredClone(proposal.content),
    provenance: { origin: proposal.provenance.origin, proposalId: proposal.proposalId,
      templateVersion: proposal.provenance.templateVersion } };
  if (proposal.provenance.origin !== 'mock-proposal') return validateTeacherDraft(next);
  const previous = adoptedMockDrafts.get(next.draftId);
  adoptedMockDrafts.set(next.draftId, proposal.proposalId);
  try { return validateTeacherDraft(next); }
  catch (error) {
    if (previous === undefined) adoptedMockDrafts.delete(next.draftId);
    else adoptedMockDrafts.set(next.draftId, previous);
    throw error;
  }
}

function rejectTeacherProposal(proposal, draft = null) {
  checkDecisionBase(proposal, draft);
  return { decision: 'rejected', proposalId: proposal.proposalId,
    draft: draft === null ? null : structuredClone(draft) };
}

function draftPreview(draft) {
  const publicCase = validateDraftAndGetPublicCase(draft);
  const { caseRef, content } = draft;
  const referenced = new Set([...content.objectives, ...content.exercises]
    .flatMap(({ requirementIds }) => requirementIds));
  return { status: 'draft-preview-only', caseRef: { kind: caseRef.kind, caseId: caseRef.caseId,
    caseVersion: caseRef.caseVersion, conceptId: caseRef.conceptId },
  title: content.title,
  requirements: publicCase.requirements.filter(({ requirementId }) => referenced.has(requirementId))
    .map(({ requirementId, text }) => ({ requirementId, text })),
  objectives: content.objectives.map(({ objectiveId, text: objectiveText, requirementIds }) =>
    ({ objectiveId, text: objectiveText, requirementIds: [...requirementIds] })),
  explanation: content.explanation,
  codeExample: { kind: content.codeExample.kind, excerpt: content.codeExample.excerpt,
    prompt: content.codeExample.prompt },
  exercises: content.exercises.map(({ exerciseId, kind, prompt, requirementIds, publicHints }) =>
    ({ exerciseId, kind, prompt, requirementIds: [...requirementIds], publicHints: [...publicHints] })) };
}

module.exports = { makeCaseRef, validateCaseRef, validateBrief, validateContent, validateTeacherDraft,
  validateTeacherProposal, createManualDraft, generateTeacherProposal, adoptTeacherProposal,
  rejectTeacherProposal, draftPreview, stableSerialize, TEMPLATE_VERSION };
