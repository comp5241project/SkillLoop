/**
 * Teacher case studio: ask the server for an AI draft, edit it, confirm a review checklist,
 * then publish to this browser or export JSON. The AI key stays on the server.
 */
(function () {
  const app = window.SkillLoop;
  const { check, TOPICS, CONCEPTS, FLUENCY } = window.SkillLoopCaseCheck;
  const $ = (selector) => document.querySelector(selector);
  const CHECKLIST = [
    'Every line marked Wrong is really wrong.',
    'Every line marked Correct is really correct.',
    'The correct options and all explanations are accurate.',
    'The content matches what I taught and invents no facts or sources.',
  ];
  let draft = null;
  let ticked = [];
  let available = false;

  const readStore = () => app.read('correction', {});
  function writeStore(changes) {
    app.write('correction', { ...readStore(), ...changes });
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function status(message, result) {
    const box = $('#tc-status');
    box.hidden = !message;
    box.textContent = message || '';
    box.dataset.result = result || '';
  }

  // Form fields that write straight into the draft object.
  function input(labelText, value, onChange, { multiline, max = 200 } = {}) {
    const wrap = element('div', 'cl-field');
    const field = document.createElement(multiline ? 'textarea' : 'input');
    field.id = `tc-f-${Math.random().toString(36).slice(2, 9)}`;
    field.value = value || '';
    field.maxLength = max;
    if (multiline) field.rows = 3;
    field.addEventListener('input', () => {
      onChange(field.value);
      changed();
    });
    const label = element('label', '', labelText);
    label.htmlFor = field.id;
    wrap.append(label, field);
    return wrap;
  }
  function select(labelText, value, options, onChange) {
    const wrap = element('div', 'cl-field');
    const field = document.createElement('select');
    field.id = `tc-f-${Math.random().toString(36).slice(2, 9)}`;
    options.forEach(([optionValue, text]) => {
      const option = element('option', '', text);
      option.value = optionValue;
      field.append(option);
    });
    field.value = value;
    field.addEventListener('change', () => onChange(field.value));
    const label = element('label', '', labelText);
    label.htmlFor = field.id;
    wrap.append(label, field);
    return wrap;
  }

  function lineRole(index) {
    if (draft.flaws.includes(index)) return 'wrong';
    if (draft.related.includes(index)) return 'related';
    return 'correct';
  }
  function setRole(index, role) {
    draft.flaws = draft.flaws.filter((n) => n !== index);
    draft.related = draft.related.filter((n) => n !== index);
    if (role === 'wrong') draft.flaws.push(index);
    if (role === 'related') draft.related.push(index);
    if (role === 'correct') delete draft.notes[index];
    renderEditor();
    changed();
  }
  // Removing or inserting a line shifts the indexes after it.
  function shiftLines(from, by) {
    const move = (n) => (n >= from ? n + by : n);
    draft.flaws = draft.flaws.filter((n) => n !== from || by > 0).map(move);
    draft.related = draft.related.filter((n) => n !== from || by > 0).map(move);
    const notes = {};
    Object.entries(draft.notes).forEach(([key, note]) => {
      const n = Number(key);
      if (by < 0 && n === from) return;
      notes[move(n)] = note;
    });
    draft.notes = notes;
  }

  function choiceEditor(title, question) {
    const box = element('fieldset', 'cl-edit-group');
    box.append(element('legend', '', title));
    const name = `tc-${Math.random().toString(36).slice(2, 9)}`;
    question.options.forEach((option, index) => {
      const row = element('div', 'cl-edit-option');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.checked = question.answer === index;
      radio.setAttribute('aria-label', `Option ${index + 1} is correct`);
      radio.addEventListener('change', () => {
        question.answer = index;
        changed();
      });
      const fields = element('div', 'cl-edit-option-fields');
      fields.append(
        input(`Option ${index + 1}`, option.text, (v) => (option.text = v)),
        input('Why', option.why, (v) => (option.why = v), { max: 300 })
      );
      row.append(radio, fields);
      box.append(row);
    });
    return box;
  }

  function renderEditor() {
    const editor = $('#tc-editor');
    editor.replaceChildren();
    const about = element('fieldset', 'cl-edit-group');
    about.append(element('legend', '', 'Case details'));
    const grid = element('div', 'cl-form-grid');
    grid.append(
      input('Short name', draft.name, (v) => (draft.name = v), { max: 60 }),
      input('Kind', draft.kind, (v) => (draft.kind = v), { max: 30 }),
      input('Lecture', draft.source, (v) => (draft.source = v), { max: 80 }),
      select('Concept', draft.conceptId, CONCEPTS.map((c) => [c, c]), (v) => {
        draft.conceptId = v;
        changed();
      }),
      select('AI Fluency', draft.fluency || '', [['', 'None'], ...FLUENCY.map((f) => [f, f])], (v) => {
        if (v) draft.fluency = v;
        else delete draft.fluency;
        changed();
      })
    );
    about.append(
      grid,
      input('Title shown to students', draft.title, (v) => (draft.title = v), { max: 120 }),
      input('Question to the AI', draft.question, (v) => (draft.question = v), { multiline: true, max: 400 })
    );

    const answer = element('fieldset', 'cl-edit-group');
    answer.append(element('legend', '', 'AI answer and answer key'));
    answer.append(element('p', 'cl-hint', 'Mark each line. Wrong lines must be found; Related lines may be flagged without penalty.'));
    draft.lines.forEach((line, index) => {
      const row = element('div', 'cl-edit-line');
      row.dataset.role = lineRole(index);
      const text = input(`Line ${index + 1}`, line, (v) => (draft.lines[index] = v), { max: 160 });
      const role = select('Mark', lineRole(index), [
        ['correct', 'Correct'],
        ['wrong', 'Wrong'],
        ['related', 'Related'],
      ], (v) => setRole(index, v));
      const remove = element('button', 'sl-text-button', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove line ${index + 1}`);
      remove.addEventListener('click', () => {
        draft.lines.splice(index, 1);
        shiftLines(index, -1);
        renderEditor();
        changed();
      });
      row.append(text, role, remove);
      if (lineRole(index) !== 'correct') {
        row.append(input('Note shown after checking', draft.notes[index], (v) => (draft.notes[index] = v)));
      }
      answer.append(row);
    });
    const add = element('button', 'sl-btn', 'Add a line');
    add.type = 'button';
    add.addEventListener('click', () => {
      draft.lines.push('');
      renderEditor();
      changed();
    });
    answer.append(add);

    const fix = element('fieldset', 'cl-edit-group');
    fix.append(element('legend', '', 'Reference fix'));
    fix.append(
      input('Prompt to students', draft.fix.prompt, (v) => (draft.fix.prompt = v)),
      input('Reference title', draft.fix.title, (v) => (draft.fix.title = v), { max: 80 }),
      input('Explanation', draft.fix.text, (v) => (draft.fix.text = v), { multiline: true, max: 400 }),
      input('Example', draft.fix.example, (v) => (draft.fix.example = v), { multiline: true, max: 1200 }),
      input('Criteria, one per line', draft.fix.criteria.join('\n'), (v) => {
        draft.fix.criteria = v.split('\n').map((c) => c.trim()).filter(Boolean);
      }, { multiline: true, max: 600 })
    );

    const apply = choiceEditor('Apply question', draft.apply);
    apply.insertBefore(
      input('Question', draft.apply.question, (v) => (draft.apply.question = v)),
      apply.children[1]
    );
    editor.append(about, answer, choiceEditor('Why is it wrong?', draft.cause), fix, apply);
  }

  function renderChecklist() {
    const box = $('#tc-checklist');
    box.replaceChildren();
    CHECKLIST.forEach((item, index) => {
      const label = element('label', 'cl-check');
      const tick = document.createElement('input');
      tick.type = 'checkbox';
      tick.checked = ticked.includes(index);
      tick.addEventListener('change', () => {
        ticked = tick.checked ? [...ticked, index] : ticked.filter((n) => n !== index);
        updatePublish();
      });
      label.append(tick, element('span', '', item));
      box.append(label);
    });
  }

  function updatePublish() {
    const errors = draft ? check(draft) : ['No draft.'];
    $('#tc-publish-btn').disabled = errors.length > 0 || ticked.length < CHECKLIST.length;
    return errors;
  }

  // Any edit invalidates the review: the checklist must be ticked again.
  function changed() {
    ticked = [];
    renderChecklist();
    const errors = updatePublish();
    const box = $('#tc-errors');
    box.replaceChildren();
    box.dataset.result = errors.length ? 'wrong' : 'right';
    if (!errors.length) box.textContent = 'Format check passed. Now confirm your review below.';
    else {
      box.append(element('strong', '', 'Fix these before publishing:'));
      const list = element('ul', 'cl-error-list');
      errors.forEach((error) => list.append(element('li', '', error)));
      box.append(list);
    }
    writeStore({ teacherDraft: draft });
  }

  function showDraft(next, source) {
    draft = next;
    draft.related = Array.isArray(draft.related) ? draft.related : [];
    draft.notes = draft.notes && typeof draft.notes === 'object' ? draft.notes : {};
    $('#tc-review').hidden = false;
    $('#tc-publish').hidden = false;
    $('#tc-origin').textContent =
      source === 'demo'
        ? 'Sample draft (Sample — API not connected yet). Connect the API to draft from your notes.'
        : 'Drafted by AI. Check every line: AI can be wrong about its own mistakes too.';
    renderEditor();
    changed();
    app.icons();
  }

  function renderPublished() {
    const list = $('#tc-published');
    list.replaceChildren();
    const authored = Array.isArray(readStore().authored) ? readStore().authored : [];
    if (!authored.length) {
      list.append(element('p', 'cl-note', 'Nothing published yet.'));
      return;
    }
    authored.forEach((item) => {
      const row = element('div', 'sl-row cl-published-row');
      const link = element('a', '', item.title);
      link.href = `./?case=${encodeURIComponent(item.id)}`;
      const remove = element('button', 'sl-text-button', 'Unpublish');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        writeStore({ authored: authored.filter((other) => other.id !== item.id) });
        renderPublished();
      });
      row.append(link, remove);
      list.append(row);
    });
  }

  $('#tc-topic').append(
    ...TOPICS.map((topic) => {
      const option = element('option', '', topic);
      option.value = topic;
      return option;
    })
  );

  $('#tc-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const notes = $('#tc-notes');
    if (notes.value.trim().length < 20) {
      notes.setCustomValidity('Add at least a short paragraph of lecture notes.');
      notes.reportValidity();
      return;
    }
    notes.setCustomValidity('');
    const button = $('#tc-draft');
    button.disabled = true;
    status(available ? 'Drafting… free models can take up to a minute.' : 'Loading the sample draft…');
    try {
      const response = await fetch('/api/correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'draft',
          teacherCode: $('#tc-code').value,
          request: {
            topic: $('#tc-topic').value,
            audience: $('#tc-audience').value,
            format: $('#tc-format').value,
            focus: $('#tc-focus').value,
            notes: notes.value,
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The draft failed. Try again.');
      status('');
      showDraft(body.result, body.source);
      $('#tc-step2').focus();
    } catch (error) {
      status(
        error instanceof TypeError
          ? 'The case server is not running. Use the local dev server or the Vercel deployment.'
          : error.message,
        'wrong'
      );
    } finally {
      button.disabled = false;
    }
  });
  $('#tc-notes').addEventListener('input', () => $('#tc-notes').setCustomValidity(''));

  $('#tc-publish-btn').addEventListener('click', () => {
    if (updatePublish().length || ticked.length < CHECKLIST.length) return;
    const authored = (Array.isArray(readStore().authored) ? readStore().authored : []).filter(
      (item) => item.id !== draft.id
    );
    const published = { ...draft, origin: 'teacher-reviewed' };
    writeStore({ authored: [...authored, published].slice(-20), teacherDraft: null });
    renderPublished();
    const box = $('#tc-errors');
    box.dataset.result = 'right';
    box.textContent = 'Published in this browser. Open it from the list below.';
  });
  $('#tc-export').addEventListener('click', () => {
    if (!draft) return;
    const file = new Blob([JSON.stringify({ ...draft, origin: 'teacher-reviewed' }, null, 2)], {
      type: 'application/json',
    });
    const link = element('a');
    link.href = URL.createObjectURL(file);
    link.download = `${draft.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  fetch('/api/correction')
    .then((response) => (response.ok ? response.json() : { available: false }))
    .catch(() => ({ available: false, offline: true }))
    .then((info) => {
      available = info.available === true;
      $('#tc-mode').textContent = available
        ? 'AI connected'
        : info.offline
          ? 'Case server not running'
          : 'Demo mode: sample draft';
      $('#tc-code-row').hidden = !available;
      $('#tc-draft').firstChild.textContent = available ? 'Draft with AI' : 'Load a sample draft';
    });

  const saved = readStore().teacherDraft;
  if (saved && typeof saved === 'object' && Array.isArray(saved.lines)) showDraft(saved, saved.origin);
  renderPublished();
  app.icons();
})();
