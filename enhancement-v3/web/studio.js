import { actions, button, field, link, list, locationLabel, node, notesPanel, pageURL, panel, paragraph,
  request, requireAccount, session, setIntro, status, tag, task, workspace } from './app.js';

let draft, preview;
let drafts = [], releases = [], step = 0;
const flow = node('div', null, { class: 'flow' });
const side = node('aside');
const steps = ['Import source', 'Review knowledge', 'Match a case', 'Preview & publish'];
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
  form.append(control);
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
  if (draft) return [sourcePreview(), actions(button('Review knowledge', () => position(1), true),
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
  const forms = node('div', null, { class: 'grid' });
  forms.append(panel('Import a web page', paragraph('Choose a public page without a login.'),
    submit(web, 'Extract web text', () => imported('v3-import-url', { data: { url: url.value } }))),
  panel('Upload a document', paragraph('Up to 3 MB and 16,000 characters of text. Scanned PDFs require a text edition.'),
    submit(upload, 'Extract document text', () => {
      if (file.files[0].size > 3_000_000) throw new Error('Files may be at most 3 MB.');
      return imported('v3-import-file', { file: file.files[0] });
    })));
  return [forms];
}
async function generate() {
  adopt(await write('generate'));
  position(1);
  status('AI notes saved. Check every claim against its source.');
}
function edit() {
  const item = structuredClone(draft.content);
  const form = node('form');
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
  const goals = node('fieldset');
  const body = node('div');
  const drawGoals = () => {
    body.replaceChildren();
    item.objectives.forEach((value, i) => {
      input(body, 'Objective ' + (i + 1), value, v => { item.objectives[i] = v; }, 8, 240);
      if (item.objectives.length > 2) body.append(button('Remove objective ' + (i + 1), () => {
        item.objectives.splice(i, 1); drawGoals();
      }));
    });
    if (item.objectives.length < 5) body.append(button('Add objective', () => { item.objectives.push(''); drawGoals(); }));
  };
  goals.append(node('legend', 'Learning objectives'), body);
  drawGoals();
  form.append(goals);
  const notes = node('div');
  const fragments = draft.source.fragments;
  const blankCitation = () => ({ fragmentId: fragments[0].id, quote: '' });
  function drawNotes() {
    notes.replaceChildren();
    item.notes.forEach((note, i) => {
      const group = node('fieldset');
      group.append(node('legend', 'Knowledge note ' + (i + 1)));
      input(group, 'Heading', note.heading, v => { note.heading = v; }, 3, 120);
      input(group, 'Note text', note.text, v => { note.text = v; }, 15, 900, true);
      note.citations.forEach((citation, ci) => {
        const select = field(group, 'Source excerpt ' + (ci + 1), node('select', null, { required: '' }));
        for (const f of fragments) select.append(node('option', f.id + ' · ' + locationLabel(f.location), { value: f.id }));
        select.value = citation.fragmentId;
        select.onchange = () => { citation.fragmentId = select.value; };
        input(group, 'Exact supporting quote', citation.quote, v => { citation.quote = v; }, 12, 300, true);
        if (note.citations.length > 1) group.append(button('Remove citation ' + (ci + 1), () => {
          note.citations.splice(ci, 1); drawNotes();
        }));
      });
      if (note.citations.length < 3) group.append(button('Add citation', () => { note.citations.push(blankCitation()); drawNotes(); }));
      if (item.notes.length > 1) group.append(button('Remove note ' + (i + 1), () => { item.notes.splice(i, 1); drawNotes(); }));
      notes.append(group);
    });
    if (item.notes.length < 8) notes.append(button('Add note', () => {
      item.notes.push({ id: 'note-' + crypto.randomUUID(), heading: '', text: '', citations: [blankCitation()] });
      drawNotes();
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
      drawSide();
      if (!find) { status('Draft saved.'); return; }
      try { adopt(await write('match')); }
      catch (error) { error.message = 'Draft saved. ' + error.message + ' Select Save and find cases to retry.'; throw error; }
      position(2);
      status(draft.choices.length ? 'Case matches ready to review.' : 'No suitable case. Revise the notes or objectives.');
    } finally { pending = false; }
  }
  form.append(button('Save draft', () => save(false)));
  return submit(form, 'Save and find cases', () => save(true));
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
  return [content, sourcePreview(), actions(button('Back to source', () => position(0)),
    ...(draft.choices ? [button('Open saved matches', () => position(2))] : []))];
}
function cases() {
  const choices = draft.choices ?? [];
  const result = [panel(choices.length ? 'Match a trusted case' : 'No suitable case',
    paragraph(choices.length ? 'Confirm coverage only when the notes support both diagnosis targets.' :
      'No registered case matched these goals. Revise the material or objectives before trying again.'),
    button('Back to knowledge notes', () => position(1)))];
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
  return [panel('Student preview', tag(version ? 'Published' : draft.approved ? 'Approved' : 'Needs review'), tag(preview.caseTitle),
    node('h3', preview.title), paragraph(preview.summary), list(preview.objectives, true),
    paragraph('Students diagnose their knowledge, get extra coaching, and complete the official practice, repair and verification.')),
  notesPanel(preview.notes), panel('Approve & publish', ...controls,
    actions(button('Back to case', () => position(2)), button('Edit knowledge notes', () => position(1))),
    ...(releases.length ? [node('h3', 'Published versions'), actions(...releases.map(r => link('Version ' + r.version, published(r))))] : []))];
}
function drawSide() {
  const items = node('ul', null, { class: 'draft-list' });
  for (const item of drafts) {
    const entry = node('li');
    entry.append(item.id === draft?.id ? tag(item.title + ' · Current') : link(item.title, studio(item.id)));
    items.append(entry);
  }
  side.replaceChildren(panel('Saved drafts', link('New source', studio()), drafts.length ? items :
    paragraph('Sources you extract will appear here.')));
}
function render() {
  const progress = node('ol', null, { class: 'steps', 'aria-label': 'Authoring steps' });
  steps.forEach((text, index) => progress.append(node('li', (index + 1) + ' · ' + text, { 'aria-current': step === index ? 'step' : null })));
  flow.replaceChildren(progress, ...[imports, knowledge, cases, release][step]());
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
  layout.append(flow, side);
  workspace.replaceChildren(layout);
  render();
  if (document.getElementById('status').dataset.error !== 'true') status();
})().catch(error => status(error.message, true));
