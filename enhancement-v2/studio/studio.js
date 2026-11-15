/* Vanilla browser editor for the loopback-only M3-03 prototype. User text uses textContent/value. */
const $ = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
let caseFacts;
let acceptedDraft = null;
let shownProposal = null;
let dirty = false;
let checkpointInfo = null;
let importSource = null;
let previewGeneration = 0;
const courseMode = Boolean($('#course-studio'));
const expectedRevision = () => acceptedDraft?.revision ?? null;
const expectedDraftId = () => acceptedDraft?.draftId ?? null;
function updateLocalStatus() {
  $('#revision-state').textContent = acceptedDraft
    ? `Current local draft revision ${acceptedDraft.revision} · ${acceptedDraft.origin}${importSource ?
      ` · imported from declared ${importSource.declaredOrigin} (unverified)` : ''}.`
    : 'No current local draft revision.';
  $('#checkpoint-state').textContent = checkpointInfo
    ? `Saved checkpoint: revision ${checkpointInfo.revision} · ${checkpointInfo.origin}. Server restart removes it.`
    : 'No saved checkpoint in this server process.';
}
function clearConflict() {
  $('#conflict-warning').hidden = true;
  $('#conflict-warning').textContent = '';
  $('#reload-latest').hidden = true;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function field(parent, caption, name, value = '', kind = 'input', errorKey) {
  const label = element('label', caption);
  const control = document.createElement(kind);
  control.dataset.field = name;
  if (kind === 'select') {
    control.multiple = true;
    control.size = 5;
    for (const requirement of caseFacts.requirements) {
      const option = element('option', `${requirement.requirementId} — ${requirement.text}`);
      option.value = requirement.requirementId;
      option.selected = Array.isArray(value) && value.includes(requirement.requirementId);
      control.append(option);
    }
  }
  if (kind !== 'select') control.value = value;
  label.append(control);
  if (errorKey) { const small = element('small'); small.dataset.errorFor = errorKey; label.append(small); }
  parent.append(label);
  return control;
}
function markDirty() {
  dirty = true;
  if (courseMode) { updateCourseStatus(); invalidatePreview(); return; }
  $('#editing-state').textContent = acceptedDraft
    ? 'Unsaved form changes. The accepted draft remains in local process memory.'
    : 'Unsaved form changes. No accepted local draft yet.';
  invalidatePreview();
}
function invalidatePreview() {
  previewGeneration++;
  $('#preview-panel').hidden = true;
  $('#preview-content').replaceChildren();
}
function addObjective(objective = {}, material = {}) {
  const host = $('#objectives');
  if (host.children.length >= 3) return;
  const index = host.children.length;
  const row = element('div', undefined, 'row'); row.dataset.objectiveRow = '1';
  field(row, 'Objective ID', 'objectiveId', objective.objectiveId || `obj-topic-${index + 1}`, 'input',
    `brief.objectives[${index}].objectiveId`);
  field(row, 'Learning objective', 'objectiveText', objective.text || '', 'textarea',
    `brief.objectives[${index}].text`);
  field(row, 'Published requirements (Ctrl/Cmd to select up to three)', 'requirementId',
    objective.requirementIds || ['empty-cart'], 'select',
    `brief.objectives[${index}].requirementIds`);
  field(row, 'Teaching objective text', 'materialObjectiveText', material.text || '', 'textarea',
    `content.objectives[${index}].text`);
  const remove = element('button', 'Remove objective', 'secondary'); remove.type = 'button';
  remove.addEventListener('click', () => { if (host.children.length > 1) { row.remove(); refreshRowErrors(); markDirty(); } });
  row.append(remove); host.append(row); refreshRowErrors();
}
function addExercise(exercise = {}) {
  const host = $('#exercises');
  if (host.children.length >= 3) return;
  const index = host.children.length;
  const row = element('div', undefined, 'row'); row.dataset.exerciseRow = '1';
  field(row, 'Exercise ID', 'exerciseId', exercise.exerciseId || `ex-topic-${index + 1}`, 'input',
    `content.exercises[${index}].exerciseId`);
  field(row, 'Exercise prompt', 'exercisePrompt', exercise.prompt || '', 'textarea',
    `content.exercises[${index}].prompt`);
  field(row, 'Published requirements (Ctrl/Cmd to select up to three)', 'exerciseRequirementId',
    exercise.requirementIds || ['empty-cart'], 'select',
    `content.exercises[${index}].requirementIds`);
  field(row, 'Public hints · one per line', 'publicHints', (exercise.publicHints || []).join('\n'), 'textarea',
    `content.exercises[${index}].publicHints`);
  field(row, 'Teacher-only answer guidance · one per line', 'teacherAnswerGuidance',
    (exercise.teacherAnswerGuidance || []).join('\n'), 'textarea',
    `content.exercises[${index}].teacherAnswerGuidance`);
  const remove = element('button', 'Remove exercise', 'secondary'); remove.type = 'button';
  remove.addEventListener('click', () => { if (host.children.length > 1) { row.remove(); refreshRowErrors(); markDirty(); } });
  row.append(remove); host.append(row); refreshRowErrors();
}
function refreshRowErrors() {
  all('[data-objective-row]').forEach((row, index) => all('[data-error-for]', row).forEach((node) => {
    node.dataset.errorFor = node.dataset.errorFor.replace(/\[\d+\]/, `[${index}]`);
  }));
  all('[data-exercise-row]').forEach((row, index) => all('[data-error-for]', row).forEach((node) => {
    node.dataset.errorFor = node.dataset.errorFor.replace(/\[\d+\]/, `[${index}]`);
  }));
}
function renderForm(draft) {
  invalidatePreview();
  clearConflict();
  const brief = draft?.brief || {}, content = draft?.content || {};
  $('#topic').value = brief.topic || '';
  $('#learner-level').value = brief.learnerLevel || 'beginner';
  $('#constraints').value = brief.constraints || '';
  $('#title').value = content.title || '';
  $('#explanation').value = content.explanation || '';
  $('#code-excerpt').value = content.codeExample?.excerpt || '';
  $('#code-prompt').value = content.codeExample?.prompt || '';
  $('#objectives').replaceChildren();
  (brief.objectives?.length ? brief.objectives : [{}]).forEach((objective, index) =>
    addObjective(objective, content.objectives?.[index]));
  $('#exercises').replaceChildren();
  (content.exercises?.length ? content.exercises : [{}]).forEach(addExercise);
  dirty = false;
  if (courseMode) updateCourseStatus();
  else {
    $('#editing-state').textContent = acceptedDraft
      ? `Local process-memory draft · ${acceptedDraft.origin} · draft-only. Form matches this snapshot.`
      : 'No accepted draft. Form changes are unsaved and disappear on refresh.';
    updateLocalStatus();
  }
  clearErrors();
}
const value = (row, name) => $(`[data-field="${name}"]`, row).value;
const selected = (row, name) => [...$(`[data-field="${name}"]`, row).selectedOptions].map((option) => option.value);
const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);
function collectForm() {
  const objectives = all('[data-objective-row]').map((row) => ({
    objectiveId: value(row, 'objectiveId'), text: value(row, 'objectiveText'),
    requirementIds: selected(row, 'requirementId'),
  }));
  return { brief: { topic: $('#topic').value, learnerLevel: $('#learner-level').value,
    objectives, constraints: $('#constraints').value },
  content: { title: $('#title').value,
    objectives: all('[data-objective-row]').map((row) => ({ objectiveId: value(row, 'objectiveId'),
      text: value(row, 'materialObjectiveText'), requirementIds: selected(row, 'requirementId') })),
    explanation: $('#explanation').value,
    codeExample: { kind: 'trace', excerpt: $('#code-excerpt').value, prompt: $('#code-prompt').value },
    exercises: all('[data-exercise-row]').map((row) => ({ exerciseId: value(row, 'exerciseId'),
      kind: 'short-answer', prompt: value(row, 'exercisePrompt'),
      requirementIds: selected(row, 'exerciseRequirementId'),
      publicHints: lines(value(row, 'publicHints')),
      teacherAnswerGuidance: lines(value(row, 'teacherAnswerGuidance')) })) } };
}
function clearErrors() {
  all('[data-error-for]').forEach((node) => { node.textContent = ''; });
  $('#message').textContent = '';
}
function showError(error) {
  clearErrors();
  $('#message').textContent = error.message || 'Unable to complete this action.';
  if (error.code === 'revision-conflict') {
    $('#conflict-warning').hidden = false;
    $('#conflict-warning').textContent = 'Revision conflict: another tab saved a newer draft. Your unsaved form is intact.';
    $('#reload-latest').hidden = false;
  }
  for (const [key, message] of Object.entries(error.fields || {})) {
    let target = all('[data-error-for]').find((node) => node.dataset.errorFor === key);
    if (!target && key.startsWith('content.objectives')) target = $('[data-error-for="brief.objectives"]');
    if (target) target.textContent = message;
  }
}
async function request(route, body) {
  const response = await fetch(route, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Studio-Request': '1' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw { message: payload.error, fields: payload.fields || {},
    code: payload.code, status: response.status };
  return payload;
}
function section(host, title, text, tag = 'p') {
  host.append(element('h3', title), element(tag, text));
}
function replacementSummary(proposal) {
  const current = collectForm();
  const desired = { brief: proposal.brief, content: { title: proposal.title,
    objectives: proposal.objectives, explanation: proposal.explanation,
    codeExample: proposal.codeExample, exercises: proposal.exercises } };
  const labels = [
    ['brief.topic', 'topic'], ['brief.learnerLevel', 'learner level'],
    ['brief.objectives', 'learning objectives and requirements'],
    ['brief.constraints', 'constraints'], ['content.title', 'title'],
    ['content.objectives', 'teaching objectives'], ['content.explanation', 'explanation'],
    ['content.codeExample', 'code activity'], ['content.exercises', 'exercises and answer guidance'],
  ];
  const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
  const changed = labels.filter(([path]) => JSON.stringify(at(current, path)) !==
    JSON.stringify(at(desired, path))).map(([, label]) => label);
  return changed.length ? `Will replace: ${changed.join(', ')}.` :
    courseMode ? 'The proposed fields currently match the form.' :
      'The proposed fields currently match the form; accepting still replaces the local draft snapshot.';
}
function renderProposal(proposal) {
  shownProposal = proposal;
  $('#proposal-panel').hidden = !proposal;
  const host = $('#proposal-content'); host.replaceChildren();
  if (!proposal) return;
  section(host, 'Source', proposal.source);
  section(host, 'Title', proposal.title);
  for (const objective of proposal.objectives)
    section(host, `Objective · ${objective.objectiveId}`, `${objective.text} [${objective.requirementIds.join(', ')}]`);
  section(host, 'Explanation', proposal.explanation);
  section(host, 'Code observation', `${proposal.codeExample.excerpt}\n${proposal.codeExample.prompt}`, 'pre');
  for (const exercise of proposal.exercises) {
    section(host, `Exercise · ${exercise.exerciseId}`, courseMode
      ? `${exercise.prompt} [${exercise.requirementIds.join(', ')}]` : exercise.prompt);
    section(host, 'Public hints', exercise.publicHints.join('\n'));
    section(host, 'Teacher-only answer guidance', exercise.teacherAnswerGuidance.join('\n'));
  }
  section(host, 'Acceptance changes', replacementSummary(proposal));
}
function renderPreview(preview) {
  const host = $('#preview-content'); host.replaceChildren();
  const list = (items) => {
    const node = element('ul');
    node.append(...items.map((text) => element('li', text)));
    return node;
  };
  host.append(element('h3', preview.title, 'lesson-title'),
    element('h4', 'Learning objectives'), list(preview.objectives.map(({ text }) => text)),
    element('h4', 'Case requirements'), list(preview.requirements.map(({ text }) => text)));
  const code = element('pre');
  code.append(element('code', preview.codeExample.excerpt));
  host.append(element('h4', 'Explanation'), element('p', preview.explanation),
    element('h4', 'Read the code'), code, element('p', preview.codeExample.prompt),
    element('h4', 'Practice'));
  const exercises = element('ol');
  for (const { prompt, publicHints } of preview.exercises) {
    const exercise = element('li');
    exercise.append(element('p', prompt));
    if (publicHints.length) {
      const hints = element('details');
      hints.append(element('summary', 'Hints'), list(publicHints));
      exercise.append(hints);
    }
    exercises.append(exercise);
  }
  host.append(exercises);
  $('#preview-panel').hidden = false;
  $('#preview-title').focus();
}
function run(task) { clearErrors(); Promise.resolve().then(task).catch(showError); }
function loadExample(kind) {
  const beginner = kind === 'beginner';
  $('#topic').value = beginner ? 'Empty cart and numeric averages' : 'Discount boundary validation';
  $('#learner-level').value = kind;
  $('#constraints').value = beginner ? 'Use a simple trace.' : 'Check both endpoints and nearby invalid values.';
  $('#objectives').replaceChildren();
  addObjective({ objectiveId: beginner ? 'obj-empty-cart' : 'obj-discount',
    text: beginner ? 'Explain the empty-cart average result.' : 'Check both inclusive discount endpoints.',
    requirementIds: [beginner ? 'empty-cart' : 'discount'] });
  markDirty();
}
async function init() {
  const response = await fetch('/api/state');
  if (!response.ok) throw Error('Unable to load public case facts.');
  const state = await response.json();
  caseFacts = state.case; acceptedDraft = state.draft;
  checkpointInfo = state.checkpoint; importSource = state.importSource;
  $('#requirements').replaceChildren(...caseFacts.requirements.map((item) =>
    element('li', `${item.requirementId}: ${item.text}`)));
  $('#starter-code').textContent = caseFacts.starterCode;
  renderForm(acceptedDraft);
  renderProposal(state.proposal);
  $('#editor').addEventListener('input', markDirty);
  $('#editor').addEventListener('change', markDirty);
  $('#add-objective').addEventListener('click', () => { addObjective(); markDirty(); });
  $('#add-exercise').addEventListener('click', () => { addExercise(); markDirty(); });
  $('#example-beginner').addEventListener('click', () => loadExample('beginner'));
  $('#example-intermediate').addEventListener('click', () => loadExample('intermediate'));
  $('#validate').addEventListener('click', () => run(async () => {
    await request('/api/validate', collectForm()); $('#message').textContent = 'Current form is valid; it is still unsaved.';
  }));
  $('#manual').addEventListener('click', () => run(async () => {
    const result = await request('/api/manual', { expectedDraftId: expectedDraftId(),
      expectedRevision: expectedRevision(), form: collectForm() });
    acceptedDraft = result.draft; importSource = null;
    renderForm(acceptedDraft); renderProposal(null);
    $('#message').textContent = 'Manual draft kept in process memory. Restarting the server loses it.';
  }));
  $('#checkpoint').addEventListener('click', () => run(async () => {
    const result = await request('/api/checkpoint', { expectedDraftId: expectedDraftId(),
      expectedRevision: expectedRevision(), form: collectForm() });
    acceptedDraft = result.draft; checkpointInfo = result.checkpoint;
    if (acceptedDraft.origin !== 'imported') importSource = null;
    renderForm(acceptedDraft); renderProposal(null);
    $('#message').textContent = `Checkpoint saved at revision ${checkpointInfo.revision} in this server process.`;
  }));
  $('#generate').addEventListener('click', () => run(async () => {
    const result = await request('/api/proposal', { brief: collectForm().brief });
    renderProposal(result.proposal); $('#message').textContent = 'Mock Proposal ready for explicit review.';
  }));
  $('#preview-button').addEventListener('click', () => run(async () => {
    const form = collectForm();
    invalidatePreview();
    const generation = previewGeneration;
    const isCurrent = () => generation === previewGeneration &&
      JSON.stringify(collectForm()) === JSON.stringify(form);
    try {
      const result = await request('/api/preview', form);
      if (isCurrent()) renderPreview(result.preview);
    } catch (error) {
      if (isCurrent()) throw error;
    }
  }));
  $('#reject').addEventListener('click', () => run(async () => {
    await request('/api/reject', { proposalId: shownProposal.proposalId });
    renderProposal(null); $('#message').textContent = 'Proposal rejected. Your form edits and accepted draft remain unchanged.';
  }));
  $('#accept').addEventListener('click', () => run(async () => {
    if (!shownProposal) return;
    if ((dirty || acceptedDraft) && !window.confirm(`${replacementSummary(shownProposal)}\nReplace the current form and local draft?`)) return;
    const result = await request('/api/accept', { proposalId: shownProposal.proposalId,
      confirmReplace: true, expectedDraftId: expectedDraftId(), expectedRevision: expectedRevision() });
    acceptedDraft = result.draft; checkpointInfo = null; importSource = null;
    renderForm(acceptedDraft); renderProposal(null);
    $('#message').textContent = 'Mock Proposal accepted as a draft-only local snapshot.';
  }));
  $('#reopen-checkpoint').addEventListener('click', () => run(async () => {
    if (!window.confirm('Reopen the saved checkpoint? This replaces the current form; unsaved edits will be lost.')) return;
    const result = await request('/api/reopen-checkpoint', { expectedRevision: expectedRevision(),
      expectedDraftId: expectedDraftId(), confirmReplace: true });
    acceptedDraft = result.draft; checkpointInfo = result.checkpoint;
    if (acceptedDraft.origin !== 'imported') importSource = null;
    renderForm(acceptedDraft); renderProposal(null);
    $('#message').textContent = `Checkpoint content restored at revision ${acceptedDraft.revision}.`;
  }));
  $('#export-json').addEventListener('click', () => run(async () => {
    if (dirty) throw { message: 'Save a valid draft or checkpoint before exporting; unsaved edits are not included.' };
    const result = await request('/api/export', { expectedDraftId: expectedDraftId(),
      expectedRevision: expectedRevision() });
    const blob = new Blob([JSON.stringify(result.document, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = result.filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    $('#message').textContent = 'Private teacher JSON exported. Keep answer guidance confidential.';
  }));
  $('#import-json').addEventListener('click', () => run(async () => {
    const file = $('#import-file').files?.[0];
    if (!file) throw { message: 'Choose a TeacherDraft JSON file first.' };
    if (file.size > 100000) throw { message: 'Choose a JSON draft file below 100 KB.' };
    if ((dirty || acceptedDraft) && !window.confirm('Import this private JSON? It replaces the current local draft and unsaved form edits.')) return;
    const result = await request('/api/import', { expectedRevision: expectedRevision(),
      expectedDraftId: expectedDraftId(), confirmReplace: true, jsonText: await file.text() });
    acceptedDraft = result.draft; importSource = result.importSource; checkpointInfo = null;
    renderForm(acceptedDraft); renderProposal(null); $('#import-file').value = '';
    $('#message').textContent = 'Imported content as an unverified draft-only local copy.';
  }));
  $('#reload-latest').addEventListener('click', () => run(async () => {
    if (dirty && !window.confirm('Reload the latest server draft? Your unsaved form edits will be lost.')) return;
    const response = await fetch('/api/state');
    if (!response.ok) throw { message: 'Could not reload the latest local draft.' };
    const state = await response.json();
    acceptedDraft = state.draft; checkpointInfo = state.checkpoint; importSource = state.importSource;
    renderForm(acceptedDraft); renderProposal(state.proposal);
    $('#message').textContent = 'Latest local draft loaded. Previous form edits were replaced.';
  }));
}
if (!courseMode) init().catch(showError);
