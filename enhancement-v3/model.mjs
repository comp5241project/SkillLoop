import { createHash } from 'node:crypto';
import { CourseError } from '../enhancement-v2/m4-courses.mjs';
import library from '../enhancement-v2/m5-case-library.cjs';

export const fail = (status, message, code) => { throw new CourseError(status, message, undefined, code); };
const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const list = (value, min, max) => Array.isArray(value) && value.length >= min && value.length <= max;
const distinct = array => new Set(array).size === array.length;
export const clean = (value, min, max) => typeof value === 'string' && !/[\x00-\x08\x0e-\x1f\uFFFD]/u.test(value) &&
  value.trim().length >= min && value.length <= max;
const compact = value => value.replace(/\s+/gu, ' ').trim();
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const PROMPT_VERSION = 'v3-1';
export const levels = ['beginner', 'intermediate', 'advanced'];

export function contentFor(value, source) {
  const valid = shape(value, ['title', 'summary', 'level', 'objectives', 'notes', 'questions']) &&
    clean(value.title, 5, 120) && clean(value.summary, 30, 700) && levels.includes(value.level) &&
    list(value.objectives, 2, 5) && value.objectives.every(text => clean(text, 8, 240)) &&
    distinct(value.objectives.map(compact)) && list(value.notes, 1, 8) &&
    list(value.questions, 0, 8) && value.questions.every(text => clean(text, 8, 300));
  if (!valid) fail(422, 'Enter a title, summary, two to five distinct objectives, and at least one cited note.');
  const fragments = new Map(source.fragments.map(fragment => [fragment.id, fragment]));
  const notes = value.notes.map(note => {
    if (!shape(note, ['id', 'heading', 'text', 'citations']) || !/^note-[a-z0-9-]{1,60}$/.test(note.id) ||
        !clean(note.heading, 3, 120) || !clean(note.text, 15, 900) || !list(note.citations, 1, 3) ||
        !note.citations.every(c => shape(c, ['fragmentId', 'quote']) && clean(c.quote, 12, 300) &&
          fragments.has(c.fragmentId) && compact(fragments.get(c.fragmentId).text).includes(compact(c.quote)))) {
      fail(422, 'Every note needs an exact source quote from the selected extract.');
    }
    return { id: note.id, heading: note.heading.trim(), text: note.text.trim(),
      citations: note.citations.map(({ fragmentId, quote }) => ({ fragmentId, quote: compact(quote) })) };
  });
  if (!distinct(notes.map(note => note.id))) fail(422, 'Every note needs a distinct ID.');
  return { title: value.title.trim(), summary: value.summary.trim(), level: value.level,
    objectives: value.objectives.map(text => text.trim()), notes, questions: value.questions.map(text => text.trim()) };
}

export function caseIndex(provider = library) {
  return provider.supportedCourses().flatMap(({ caseId, caseVersion, conceptId, title }) => {
    const item = provider.journeyCase(caseId, caseVersion, conceptId);
    if (!item || !['diagnosis', 'learning', 'repairDialogue', 'executableVerification'].every(key => item.definition.capabilities[key] === true) ||
        !item.diagnosis?.questions?.length || !item.teaching?.targets?.length || !provider.approvedRunner(item.definition)) return [];
    const requirements = item.teaching.targets.map(({ requirementId, questionId }) => {
      const requirement = item.publicCase.requirements.find(r => r.requirementId === requirementId);
      const question = item.diagnosis.questions.find(q => q.id === questionId);
      return requirement && question ? { requirementId, text: requirement.text, diagnosticPrompt: question.prompt } : null;
    });
    return requirements.every(Boolean) ? [{ caseId, caseVersion, conceptId, title, requirements }] : [];
  });
}
const sameCase = (a, b) => ['caseId', 'caseVersion', 'conceptId'].every(key => a?.[key] === b?.[key]);

export function matchesFor(value, content, index = caseIndex()) {
  if (!shape(value, ['matches']) || !list(value.matches, 0, 3)) fail(422, 'Case recommendations have an invalid format.');
  const matches = value.matches.map(choice => {
    const item = index.find(candidate => sameCase(candidate, choice));
    if (!item || !shape(choice, ['caseId', 'caseVersion', 'conceptId', 'reason', 'mapping', 'concerns']) ||
        !clean(choice.reason, 12, 500) || !list(choice.concerns, 0, 5) ||
        !choice.concerns.every(text => clean(text, 5, 300)) || !list(choice.mapping, 1, 10))
      fail(422, 'The case recommendation did not use an eligible registered case.');
    const mapping = choice.mapping.map(link => {
      if (!shape(link, ['objectiveIndex', 'requirementId', 'noteIds', 'reason']) ||
          !Number.isInteger(link.objectiveIndex) || link.objectiveIndex < 0 || link.objectiveIndex >= content.objectives.length ||
          !item.requirements.some(r => r.requirementId === link.requirementId) ||
          !list(link.noteIds, 1, 3) || !distinct(link.noteIds) ||
          !link.noteIds.every(id => content.notes.some(note => note.id === id)) || !clean(link.reason, 10, 300))
        fail(422, 'Case coverage must refer to real requirements, objectives and cited notes.');
      return { objectiveIndex: link.objectiveIndex, requirementId: link.requirementId, noteIds: link.noteIds, reason: link.reason.trim() };
    });
    if (!distinct(mapping.map(link => [link.objectiveIndex, link.requirementId].join(':'))))
      fail(422, 'Case coverage contains duplicate links.');
    return { caseId: item.caseId, caseVersion: item.caseVersion, conceptId: item.conceptId, reason: choice.reason.trim(),
      mapping, concerns: choice.concerns.map(text => text.trim()) };
  });
  if (!distinct(matches.map(choice => choice.caseId))) fail(422, 'Case recommendations contain duplicate cases.');
  return matches;
}

export function publicationFor(row) {
  if (!row.content || !Array.isArray(row.choices) || !row.choices[row.selection])
    fail(409, 'Review the notes and confirm a case before approving.');
  const content = contentFor(row.content, row.source);
  const selected = matchesFor({ matches: [row.choices[row.selection]] }, content)[0];
  const item = caseIndex().find(candidate => sameCase(candidate, selected));
  const covered = new Set(selected.mapping.map(link => link.requirementId));
  if (!item.requirements.every(requirement => covered.has(requirement.requirementId)))
    fail(422, 'Choose material and objectives covering both diagnosis targets for this case.');
  const fragments = new Map(row.source.fragments.map(fragment => [fragment.id, fragment.location]));
  return {
    schemaVersion: 1, title: content.title, summary: content.summary, level: content.level,
    objectives: content.objectives,
    notes: content.notes.map(note => ({ id: note.id, heading: note.heading, text: note.text,
      citations: note.citations.map(({ fragmentId }) => ({ fragmentId, location: fragments.get(fragmentId) })) })),
    caseRef: { caseId: selected.caseId, caseVersion: selected.caseVersion, conceptId: selected.conceptId },
    caseTitle: item.title, mapping: selected.mapping.map(({ objectiveIndex, requirementId, noteIds }) =>
      ({ objectiveIndex, requirementId, noteIds })),
  };
}

export function journeyForm(publication) {
  const { caseId, caseVersion, conceptId } = publication.caseRef;
  const item = library.journeyCase(caseId, caseVersion, conceptId);
  const targets = item.teaching.targets.filter(target => publication.mapping.some(link => link.requirementId === target.requirementId));
  const objectives = targets.map((target, index) => ({
    objectiveId: 'obj-' + (index + 1),
    text: publication.objectives[publication.mapping.find(link => link.requirementId === target.requirementId).objectiveIndex],
    requirementIds: [target.requirementId],
  }));
  return { brief: { topic: publication.title, learnerLevel: publication.level, objectives, constraints: '' },
    content: { title: publication.title, explanation: publication.summary, objectives,
      codeExample: { kind: 'trace', excerpt: targets[0].excerpt, prompt: 'Trace the delivered code with a boundary input.' },
      exercises: targets.map((target, index) => ({
        exerciseId: 'ex-' + (index + 1), kind: 'short-answer', prompt: target.practice.prompt,
        requirementIds: [target.requirementId], publicHints: ['Compare your reasoning with the public case requirement.'],
        teacherAnswerGuidance: ['Check the answer against the canonical case requirement.'],
      })) } };
}

export function lessonContext(publication, diagnosis) {
  if (!diagnosis || !clean(diagnosis.evidence?.question, 5, 800) || !clean(diagnosis.evidence?.answer, 1, 800))
    fail(409, 'Complete the official Part 1 diagnosis before opening personalized teaching.');
  const item = library.journeyCase(publication.caseRef.caseId, publication.caseRef.caseVersion, publication.caseRef.conceptId);
  const target = item?.teaching.targets.find(candidate => candidate.requirementId === diagnosis.target);
  const requirement = item?.publicCase.requirements.find(r => r.requirementId === diagnosis.target);
  const links = publication.mapping.filter(link => link.requirementId === diagnosis.target);
  if (!target || !requirement || !links.length || !library.approvedRunner(item.definition))
    fail(409, 'The diagnosed target is no longer available for this publication.');
  const ids = new Set(links.flatMap(link => link.noteIds));
  return { requirement: { id: requirement.requirementId, text: requirement.text },
    trace: target.excerpt, caseTitle: publication.caseTitle,
    objectives: [...new Set(links.map(link => publication.objectives[link.objectiveIndex]))],
    notes: publication.notes.filter(note => ids.has(note.id)),
    evidence: { question: diagnosis.evidence.question, answer: diagnosis.evidence.answer,
      practiceRecommended: diagnosis.evidence.practiceRecommended === true } };
}

export function lessonFor(value, context, evidenceRef) {
  if (!shape(value, ['objectiveIndex', 'explanation', 'caseApplication', 'practicePrompt', 'noteIds']) ||
      !Number.isInteger(value.objectiveIndex) || !context.objectives[value.objectiveIndex] ||
      !clean(value.explanation, 30, 1400) || !clean(value.caseApplication, 25, 1000) ||
      !clean(value.practicePrompt, 15, 700) || !list(value.noteIds, 1, 5) || !distinct(value.noteIds) ||
      !value.noteIds.every(id => context.notes.some(note => note.id === id)))
    fail(422, 'Personalized teaching did not cite approved notes for the diagnosed requirement.');
  return { objective: context.objectives[value.objectiveIndex], targetedRequirementRefs: [context.requirement.id],
    diagnosticEvidenceRef: evidenceRef, explanation: value.explanation.trim(), caseApplication: value.caseApplication.trim(),
    practicePrompt: value.practicePrompt.trim(), sourceReferences: context.notes.filter(note => value.noteIds.includes(note.id))
      .map(({ id, citations }) => ({ noteId: id, citations })) };
}

export function feedbackFor(value) {
  if (!shape(value, ['feedback', 'nextStep']) || !clean(value.feedback, 15, 900) || !clean(value.nextStep, 10, 300))
    fail(422, 'The coaching feedback did not match the expected format.');
  return { feedback: value.feedback.trim(), nextStep: value.nextStep.trim() };
}
