import { actions, button, field, link, list, locationLabel, node, notesPanel, pageURL, panel, paragraph,
  request, requireAccount, session, setIntro, status, tag, task, workspace } from './app.js';

let draft, preview;
let drafts = [], releases = [], step = 0;
let legacyExports;
let isDirty = () => false;
const flow = node('div', null, { class: 'flow' });
const side = node('aside', null, { class: 'wizard-rail' });
const steps = [
  ['Import materials', 'Upload a file or link a source', 'Import'],
  ['Review knowledge', 'Edit notes and check source evidence', 'Review'],
  ['Match a case', 'Review coverage and confirm a case', 'Match'],
  ['Publish course', 'Review the student experience', 'Publish'],
];
const dock = (...controls) => {
  const bar = actions(...controls);
  bar.classList.add('wizard-actions');
  return bar;
};
const maxStep = () => draft?.selection != null ? 3 : draft?.choices ? 2 : draft ? 1 : 0;
function allowLeave() {
  if (!isDirty()) return true;
  status('Save your changes to the notes before leaving this step.', true);
  return false;
}
window.addEventListener('beforeunload', event => {
  if (isDirty()) event.preventDefault();
});

async function navigate(index) {
  if (index === step || index > maxStep() || !allowLeave()) return;
  if (index === 3) preview = await write('preview');
  position(index);
}
const write = (op, fields = {}) => request('v3-' + op, { data: { id: draft.id, revision: draft.revision, ...fields } });
const studio = id => pageURL('studio', id ? { draft: id } : {});
const published = release => pageURL('course', { course: release.courseId, version: release.version });

function adopt(value) {
  draft = value;
  const title = draft.content?.title ?? draft.source.title;
  const current = drafts.find(item => item.id === draft.id);
  if (current) current.title = title;
  else drafts.unshift({ id: draft.id, title });
  history.replaceState(null, '', studio(draft.id));
}
function position(value) {
  step = value;
  render();
  const heading = flow.querySelector('h2');
  if (heading) { heading.tabIndex = -1; heading.focus(); }
}
function submit(form, label, run) {
  const control = node('button', label, { type: 'submit', class: 'primary' });
  form.append(dock(control));
  form.addEventListener('submit', event => { event.preventDefault(); task(control, run); });
  return form;
}
function sourcePreview() {
  const { source } = draft;
  const details = node('details');
  details.append(node('summary', 'Inspect extracted text'));
  for (const part of source.fragments) details.append(node('h3', part.id + ' · ' + locationLabel(part.location)),
    node('p', part.text, { class: 'source-text' }));
  return panel(source.title, tag(source.type.toUpperCase()), tag('Text extracted'),
    paragraph(source.characterCount + ' characters · ' + source.fragments.length + ' excerpts'), details);
}
function imports() {
  if (draft) return [sourcePreview(), dock(button('Review knowledge', () => navigate(1), true),
    link('Import a different source', studio()))];
  const web = node('form');
  const url = field(web, 'Public HTTPS link', node('input', null, { type: 'url', required: '', maxlength: '1800',
    placeholder: 'https://example.org/material' }));
  const upload = node('form');
  const file = field(upload, 'PDF, DOCX or UTF-8 TXT', node('input', null, { type: 'file', accept: '.pdf,.docx,.txt', required: '' }));
  async function imported(op, options) {
    adopt(await request(op, options));
    position(0);
    status('Text extracted and saved as a private draft.');
  }
  const webPanel = panel('Import a web page', paragraph('Choose a public page without a login.'),
    submit(web, 'Extract web text', () => imported('v3-import-url', { data: { url: url.value } })));
  const uploadPanel = panel('Upload a document', paragraph('Up to 3 MB and 16,000 characters of text. PDFs need a text layer.'),
    submit(upload, 'Extract document text', () => {
      if (!file.files.length) throw new Error('Choose a file first.');
      if (file.files[0].size > 3_000_000) throw new Error('Files may be at most 3 MB.');
      return imported('v3-import-file', { file: file.files[0] });
    }));
  for (const formPanel of [uploadPanel, webPanel]) formPanel.classList.replace('panel', 'source-form');
  const drop = file.closest('label');
  drop.classList.add('source-drop');
  drop.prepend(node('span', 'Choose a document or drop it here', { class: 'source-drop-title' }));
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('is-dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
  drop.addEventListener('drop', event => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    if (event.dataTransfer.files.length === 1) file.files = event.dataTransfer.files;
  });
  const modes = node('div', null, { class: 'source-modes', role: 'group', 'aria-label': 'Material source' });
  const fileTab = node('button', 'Upload file', { type: 'button' });
  const webTab = node('button', 'Web link', { type: 'button' });
  function choose(mode) {
    uploadPanel.hidden = mode !== 'file';
    webPanel.hidden = mode !== 'web';
    fileTab.setAttribute('aria-pressed', String(mode === 'file'));
    webTab.setAttribute('aria-pressed', String(mode === 'web'));
  }
  fileTab.onclick = () => choose('file');
  webTab.onclick = () => choose('web');
  modes.append(fileTab, webTab);
  choose('file');
  return [panel('Import materials', modes, uploadPanel, webPanel)];
}
async function generate() {
  if (!allowLeave()) return;
  adopt(await write('generate'));
  position(1);
  status('AI notes saved. Check every claim against its source.');
}
function editorDisclosure(label, open) {
  const section = node('details', null, { class: 'editor-disclosure' });
  section.open = open;
  const title = node('span', label);
  const count = node('span', null, { class: 'editor-disclosure-count' });
  const summary = node('summary');
  summary.append(title, count);
  section.append(summary);
  summary.addEventListener('click', event => {
    event.preventDefault();
    const top = summary.getBoundingClientRect().top;
    section.open = !section.open;
    summary.focus({ preventScroll: true });
    const shift = summary.getBoundingClientRect().top - top;
    if (Math.abs(shift) > 1) window.scrollBy(0, shift);
  });
  return { section, title, count };
}

function edit() {
  const item = structuredClone(draft.content);
  let lastSaved = JSON.stringify(item);
  isDirty = () => JSON.stringify(item) !== lastSaved;
  const form = node('form', null, { id: 'knowledge-editor' });
  form.addEventListener('invalid', event => {
    for (let group = event.target.closest('details'); group; group = group.parentElement.closest('details'))
      group.open = true;
  }, true);
  const input = (parent, title, value, change, min, max, multiline = false) => {
    const control = field(parent, title, node(multiline ? 'textarea' : 'input', multiline ? value : null,
      { value: multiline ? null : value, required: '', minlength: min, maxlength: max }));
    control.addEventListener('input', () => change(control.value));
  };
  input(form, 'Course title', item.title, v => { item.title = v; }, 5, 120);
  input(form, 'Summary', item.summary, v => { item.summary = v; }, 30, 700, true);
  const levels = field(form, 'Audience level', node('select'));
  for (const value of ['beginner', 'intermediate', 'advanced']) levels.append(node('option', value, { value }));
  levels.value = item.level;
  levels.onchange = () => { item.level = levels.value; };
  const goals = editorDisclosure('Learning objectives', false);
  const body = node('div');
  const drawGoals = () => {
    goals.count.textContent = item.objectives.length + ' objectives';
    body.replaceChildren();
    item.objectives.forEach((value, i) => {
      input(body, 'Objective ' + (i + 1), value, v => { item.objectives[i] = v; }, 8, 240);
      if (item.objectives.length > 2) body.append(button('Remove objective ' + (i + 1), () => {
        item.objectives.splice(i, 1); drawGoals();
      }));
    });
    if (item.objectives.length < 5) body.append(button('Add objective', () => { item.objectives.push(''); drawGoals(); }));
  };
  goals.section.append(body);
  drawGoals();
  form.append(goals.section, node('h3', 'Knowledge notes'));
  const notes = node('div', null, { class: 'editor-notes' });
  const openNotes = new Set(item.notes.slice(0, 1).map(note => note.id));
  const fragments = draft.source.fragments;
  const blankCitation = () => ({ fragmentId: fragments[0].id, quote: '' });
  function drawNotes() {
    for (const group of notes.querySelectorAll('.editor-disclosure')) {
      if (group.open) openNotes.add(group.dataset.noteId);
      else openNotes.delete(group.dataset.noteId);
    }
    notes.replaceChildren();
    item.notes.forEach((note, i) => {
      const disclosure = editorDisclosure(note.heading || 'Knowledge note ' + (i + 1), openNotes.has(note.id));
      disclosure.section.dataset.noteId = note.id;
      disclosure.count.textContent = note.citations.length + (note.citations.length === 1 ? ' citation' : ' citations');
      const group = node('div', null, { class: 'knowledge-note' });
      input(group, 'Heading', note.heading, v => {
        note.heading = v;
        disclosure.title.textContent = v || 'Knowledge note ' + (i + 1);
      }, 3, 120);
      input(group, 'Note text', note.text, v => { note.text = v; }, 15, 900, true);
      note.citations.forEach((citation, ci) => {
        const select = field(group, 'Source excerpt ' + (ci + 1), node('select', null, { required: '' }));
        for (const f of fragments) select.append(node('option', f.id + ' · ' + locationLabel(f.location), { value: f.id }));
        select.value = citation.fragmentId;
        const original = node('details', null, { class: 'citation-evidence' });
        const showExcerpt = () => {
          const fragment = fragments.find(f => f.id === citation.fragmentId);
          original.replaceChildren(node('summary', 'Read source excerpt'),
            node('p', fragment?.text ?? 'Excerpt unavailable', { class: 'source-text' }));
        };
        select.onchange = () => { citation.fragmentId = select.value; showExcerpt(); };
        showExcerpt();
        group.append(original);
        input(group, 'Exact supporting quote', citation.quote, v => { citation.quote = v; }, 12, 300, true);
        if (note.citations.length > 1) group.append(button('Remove citation ' + (ci + 1), () => {
          note.citations.splice(ci, 1); drawNotes();
        }));
      });
      if (note.citations.length < 3) group.append(button('Add citation', () => { note.citations.push(blankCitation()); drawNotes(); }));
      if (item.notes.length > 1) group.append(button('Remove note ' + (i + 1), () => { item.notes.splice(i, 1); drawNotes(); }));
      disclosure.section.append(group);
      notes.append(disclosure.section);
    });
    if (item.notes.length < 8) notes.append(button('Add note', () => {
      const id = 'note-' + crypto.randomUUID();
      item.notes.push({ id, heading: '', text: '', citations: [blankCitation()] });
      openNotes.add(id);
      drawNotes();
      notes.querySelector('[data-note-id="' + id + '"] input').focus();
    }));
  }
  drawNotes();
  form.append(notes);
  if (item.questions.length) form.append(node('h3', 'Questions to check against the source'), list(item.questions));
  let pending = false;
  async function save(find) {
    if (pending || !form.reportValidity()) return;
    pending = true;
    try {
      adopt(await write('save', { content: item }));
      lastSaved = JSON.stringify(item);
      drawSide();
      if (!find) { status('Draft saved.'); return; }
      try { adopt(await write('match')); }
      catch (error) { error.message = 'Draft saved. ' + error.message + ' Select Save and find cases to retry.'; throw error; }
      position(2);
      status(draft.choices.length ? 'Case matches ready to review.' : 'No suitable case. Revise the notes or objectives.');
    } finally { pending = false; }
  }
  const checked = submit(form, 'Save and find cases', () => save(true));
  checked.lastElementChild.prepend(button('Save draft', () => save(false)));
  return checked;
}

function knowledge() {
  const content = panel('Review knowledge', paragraph('Compare the notes and their exact quotes with the extracted material.'),
    draft.content ? edit() : button('Generate knowledge notes', generate, true));
  if (draft.content) {
    const details = node('details');
    details.append(node('summary', 'Regenerate notes from source'),
      paragraph('Valid new notes replace the saved draft and require a fresh review.'),
      button('Replace with fresh AI notes', generate));
    content.append(details);
  }
  const columns = node('div', null, { class: 'wizard-columns' });
  const source = sourcePreview();
  source.classList.add('wizard-reference');
  columns.append(content, source);
  return [columns];
}
function cases() {
  const choices = draft.choices ?? [];
  const result = [panel(choices.length ? 'Match a trusted case' : 'No suitable case',
    paragraph(choices.length ? 'Confirm coverage only when the notes support both diagnosis targets.' :
      'No registered case matched these goals. Revise the material or objectives before trying again.'))];
  choices.forEach((choice, index) => {
    const current = draft.cases.find(item => item.caseId === choice.caseId && item.caseVersion === choice.caseVersion &&
      item.conceptId === choice.conceptId);
    if (!current) return;
    const missing = current.requirements.filter(item => !choice.mapping.some(m => m.requirementId === item.requirementId));
    const uncovered = draft.content.objectives.filter((_, i) => !choice.mapping.some(m => m.objectiveIndex === i));
    const coverage = choice.mapping.map(m => draft.content.objectives[m.objectiveIndex] + ' → ' +
      (current.requirements.find(r => r.requirementId === m.requirementId)?.text ?? 'Unavailable requirement') + ' ' +
      m.reason + ' Notes: ' + m.noteIds.map(id => draft.content.notes.find(n => n.id === id)?.heading).join(', '));
    result.push(panel(current.title, tag('Trusted four-stage case'), paragraph(choice.reason), list(coverage),
      ...(choice.concerns.length ? [node('h3', 'Check these concerns'), list(choice.concerns)] : []),
      ...(missing.length || uncovered.length ? [node('h3', 'Coverage gaps'), list([...missing.map(r => r.text), ...uncovered])] : []),
      missing.length ? paragraph('This candidate cannot be published with the current coverage.') :
        button('Confirm this case and coverage', async () => {
          adopt(await write('select', { selection: index, confirm: true }));
          preview = await write('preview');
          position(3);
        }, true)));
  });
  return result;
}
function release() {
  const version = releases.find(r => r.draftRevision === draft.revision);
  const controls = [];
  if (version) controls.push(link('View published course', published(version), true));
  else if (draft.approved) controls.push(button('Publish approved version', async () => {
    const value = await write('publish', { confirm: true });
    releases.unshift(value);
    draft.courseId = value.courseId;
    render();
    status('Published version ' + value.version + '. Students can start from the course library.');
  }, true));
  else {
    const box = node('input', null, { type: 'checkbox' });
    const label = node('label', null, { class: 'check' });
    label.append(box, document.createTextNode('I checked the notes, source evidence, and case coverage.'));
    const approve = button('Approve this version', async () => {
      await write('review', { confirm: true });
      draft.approved = true;
      render();
      status('Saved revision approved.');
    }, true);
    approve.disabled = true;
    box.onchange = () => { approve.disabled = !box.checked; };
    controls.push(label, approve);
  }
  const content = node('div', null, { class: 'flow' });
  const stages = node('ol', null, { class: 'student-stages', 'aria-label': 'Student journey' });
  stages.append(...['Diagnosis', 'Case Learning', 'Repair', 'Verification'].map(label => node('li', label)));
  content.append(panel('Student preview', tag(version ? 'Published' : draft.approved ? 'Approved' : 'Needs review'), tag(preview.caseTitle),
    node('h3', preview.title), paragraph(preview.summary), list(preview.objectives, true), stages), notesPanel(preview.notes));
  const checklist = panel('Release checklist',
    list(['Course details and learning objectives', 'Teacher-reviewed notes with source evidence', 'Confirmed case and coverage']),
    dock(...controls),
    ...(releases.length ? [node('h3', 'Published versions'), actions(...releases.map(r => link('Version ' + r.version, published(r))))] : []));
  const columns = node('div', null, { class: 'wizard-columns' });
  columns.append(content, checklist);
  return [columns];
}
function drawSide() {
  const items = node('ul', null, { class: 'draft-list' });
  for (const item of drafts) {
    const entry = node('li');
    entry.append(item.id === draft?.id ? tag(item.title + ' · Current') : link(item.title, studio(item.id)));
    items.append(entry);
  }
  const nav = node('nav', null, { 'aria-label': 'Authoring steps' });
  const progress = node('ol', null, { class: 'steps' });
  steps.forEach(([title, description, short], index) => {
    const control = node('button', null, { type: 'button', 'aria-label': 'Step ' + (index + 1) + ': ' + title,
      'aria-current': step === index ? 'step' : null });
    control.disabled = index > maxStep();
    const copy = node('span', null, { class: 'wizard-step-copy' });
    copy.append(node('strong', title, { class: 'wizard-step-title' }), node('small', description),
      node('strong', short, { class: 'wizard-step-short' }));
    control.append(node('span', String(index + 1), { class: 'wizard-step-number', 'aria-hidden': 'true' }), copy);
    control.addEventListener('click', async () => {
      try { await navigate(index); } catch (error) { status(error.message, true); }
    });
    const entry = node('li');
    entry.append(control);
    progress.append(entry);
  });
  nav.append(progress);
  const saved = node('details', null, { class: 'wizard-saved' });
  saved.open = side.querySelector('details')?.open ?? false;
  saved.append(node('summary', 'Saved drafts'), link('New source', studio()),
    drafts.length ? items : paragraph('Extract a source to create a draft.'));
  saved.addEventListener('click', event => {
    if (event.target.closest('a') && !allowLeave()) event.preventDefault();
  });
  side.replaceChildren(nav, saved, ...(legacyExports ? [legacyExports] : []));
}

function showLegacyDrafts(items) {
  if (!items.length) return;
  legacyExports = node('details', null, { class: 'wizard-saved' });
  const entries = node('ul', null, { class: 'draft-list' });
  for (const item of items) {
    const entry = node('li');
    const download = button('Export JSON', async () => {
      const archive = await request('v3-legacy-draft-export', { query: { course: item.id } });
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2) + '\n'], { type: 'application/json' }));
      node('a', null, { href: url, download: 'skillloop-draft-' + archive.courseId + '.json' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('Private draft exported.');
    });
    download.setAttribute('aria-label', 'Export JSON for ' + item.title);
    entry.append(paragraph(item.title), download);
    entries.append(entry);
  }
  legacyExports.append(node('summary', 'Legacy draft exports'), entries);
  side.append(legacyExports);
}
function render() {
  isDirty = () => false;
  flow.replaceChildren(...[imports, knowledge, cases, release][step]());
  drawSide();
}

(async () => {
  setIntro('Extract a source, review AI notes, match a trusted case, and publish when you are ready.', 'AI Course Builder');
  const state = await session();
  if (!state.role) return requireAccount(result => location.assign(result.role === 'teacher' ?
    studio(new URLSearchParams(location.search).get('draft')) : pageURL('learning')));
  if (state.role !== 'teacher') {
    workspace.replaceChildren(panel('Teacher account required', paragraph('Use a teacher account to import and publish material.'),
      link('Open My Learning', pageURL('learning'), true)));
    return;
  }
  status('Loading drafts…');
  ({ drafts } = await request('v3-list'));
  const id = new URLSearchParams(location.search).get('draft');
  if (id) {
    draft = await request('v3-open', { query: { draft: id } });
    releases = draft.releases;
    step = draft.selection !== null ? 3 : draft.choices ? 2 : draft.content ? 1 : 0;
    if (step === 3) {
      try { preview = await write('preview'); }
      catch (error) { step = 2; status(error.message, true); }
    }
  }
  const layout = node('div', null, { class: 'studio-layout' });
  layout.append(side, flow);
  workspace.replaceChildren(layout);
  render();
  if (document.getElementById('status').dataset.error !== 'true') status();
  try {
    const { drafts: items } = await request('v3-legacy-drafts');
    showLegacyDrafts(items);
  } catch {
    status('Legacy draft exports could not load. Reload the Studio to try again.', true);
  }
})().catch(error => status(error.message, true));
