/* Vanilla browser editor for the loopback-only M3-03 prototype. User text uses textContent/value. */
const $ = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
let caseFacts;
let acceptedDraft = null;
let shownProposal = null;
let dirty = false;

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
  $('#editing-state').textContent = acceptedDraft
    ? 'Unsaved form changes. The accepted draft remains in local process memory.'
    : 'Unsaved form changes. No accepted local draft yet.';
  invalidatePreview();
}
function invalidatePreview() {
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
  $('#editing-state').textContent = acceptedDraft
    ? `Local process-memory draft · ${acceptedDraft.origin} · draft-only. Form matches this snapshot.`
    : 'No accepted draft. Form changes are unsaved and disappear on refresh.';
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
  if (!response.ok) throw { message: payload.error, fields: payload.fields || {} };
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
    section(host, `Exercise · ${exercise.exerciseId}`, exercise.prompt);
    section(host, 'Public hints', exercise.publicHints.join('\n'));
    section(host, 'Teacher-only answer guidance', exercise.teacherAnswerGuidance.join('\n'));
  }
  section(host, 'Acceptance changes', replacementSummary(proposal));
}
function renderPreview(preview) {
  const host = $('#preview-content'); host.replaceChildren();
  section(host, 'Title', preview.title);
  for (const objective of preview.objectives) section(host, 'Learning objective', objective.text);
  section(host, 'Explanation', preview.explanation);
  section(host, 'Code reading', `${preview.codeExample.excerpt}\n${preview.codeExample.prompt}`, 'pre');
  for (const exercise of preview.exercises) {
    section(host, 'Exercise', exercise.prompt);
    section(host, 'Public hints', exercise.publicHints.join('\n'));
  }
  $('#preview-panel').hidden = false;
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
    const result = await request('/api/manual', collectForm());
    acceptedDraft = result.draft; renderForm(acceptedDraft); renderProposal(null);
    $('#message').textContent = 'Manual draft kept in process memory. Restarting the server loses it.';
  }));
  $('#generate').addEventListener('click', () => run(async () => {
    const result = await request('/api/proposal', { brief: collectForm().brief });
    renderProposal(result.proposal); $('#message').textContent = 'Mock Proposal ready for explicit review.';
  }));
  $('#preview-button').addEventListener('click', () => run(async () => {
    const form = collectForm();
    invalidatePreview();
    const result = await request('/api/preview', form);
    if (JSON.stringify(collectForm()) === JSON.stringify(form)) renderPreview(result.preview);
  }));
  $('#reject').addEventListener('click', () => run(async () => {
    await request('/api/reject', { proposalId: shownProposal.proposalId });
    renderProposal(null); $('#message').textContent = 'Proposal rejected. Your form edits and accepted draft remain unchanged.';
  }));
  $('#accept').addEventListener('click', () => run(async () => {
    if (!shownProposal) return;
    if ((dirty || acceptedDraft) && !window.confirm(`${replacementSummary(shownProposal)}\nReplace the current form and local draft?`)) return;
    const result = await request('/api/accept', { proposalId: shownProposal.proposalId,
      confirmReplace: true });
    acceptedDraft = result.draft; renderForm(acceptedDraft); renderProposal(null);
    $('#message').textContent = 'Mock Proposal accepted as a draft-only local snapshot.';
  }));
}
init().catch(showError);
