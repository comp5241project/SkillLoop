/**
 * Module 4: authored AI-answer correction cases. Line spotting and multiple-choice answers are
 * checked against the authored key; the learner's written fix is compared with a reference and
 * self-checked, never auto-scored.
 */
(function () {
  const app = window.SkillLoop;
  const $ = (selector) => document.querySelector(selector);
  const text = (value) => (typeof value === 'string' ? value.slice(0, 5000) : '');
  const indexes = (value, max) =>
    Array.isArray(value)
      ? [...new Set(value.filter((n) => Number.isInteger(n) && n >= 0 && n < max))]
      : [];
  const saved = app.read('correction', {});
  // Cases a teacher reviewed and published in this browser (teacher.html); invalid ones are skipped.
  const builtIn = window.SkillLoopCases;
  const authored = (Array.isArray(saved.authored) ? saved.authored : []).filter(
    (item) =>
      !window.SkillLoopCaseCheck.check(item).length &&
      !builtIn.some((other) => other.id === item.id)
  );
  const cases = [...builtIn, ...authored];
  const stored = saved.cases && typeof saved.cases === 'object' ? saved.cases : {};

  const blank = () => ({
    draft: '',
    revealed: false,
    nextSeen: false,
    checks: [],
    flagged: [],
    spotChecked: false,
    causeTries: [],
    applyTries: [],
  });
  const progress = {};
  cases.forEach((item) => {
    const entry = stored[item.id] && typeof stored[item.id] === 'object' ? stored[item.id] : {};
    progress[item.id] = {
      draft: text(entry.draft),
      revealed: entry.revealed === true,
      nextSeen: entry.nextSeen === true,
      checks: indexes(entry.checks, item.fix.criteria.length),
      flagged: indexes(entry.flagged, item.lines.length),
      spotChecked: entry.spotChecked === true,
      causeTries: indexes(entry.causeTries, item.cause.options.length),
      applyTries: indexes(entry.applyTries, item.apply.options.length),
    };
  });

  const find = (id) => cases.findIndex((item) => item.id === id);
  const requested = new URLSearchParams(location.search).get('case');
  let current = Math.max(0, find(requested) >= 0 ? find(requested) : find(saved.caseId));
  const input = $('#sl-correction');
  input.maxLength = 5000;

  const item = () => cases[current];
  const state = () => progress[item().id];
  function save() {
    const entry = state();
    // Top-level fields mirror the open case so the original contract still reads correctly.
    app.write('correction', {
      ...app.read('correction', {}),
      draft: entry.draft,
      revealed: entry.revealed,
      nextSeen: entry.nextSeen,
      caseId: item().id,
      cases: progress,
    });
  }

  const solved = (tries, answer) => tries.includes(answer);
  const spotPerfect = (data, entry) =>
    data.flaws.every((n) => entry.flagged.includes(n)) &&
    entry.flagged.every((n) => data.flaws.includes(n) || data.related.includes(n));
  function stars(data) {
    const entry = progress[data.id];
    return (
      Number(entry.spotChecked && spotPerfect(data, entry)) +
      Number(entry.causeTries[0] === data.cause.answer) +
      Number(entry.applyTries[0] === data.apply.answer)
    );
  }
  function status(data) {
    const entry = progress[data.id];
    if (solved(entry.applyTries, data.apply.answer)) return 'Complete';
    if (entry.spotChecked || entry.flagged.length || entry.draft.trim()) return 'In progress';
    return 'New';
  }
  const starText = (count) => '★'.repeat(count) + '☆'.repeat(3 - count);

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function renderList() {
    const list = $('#sl-case-list');
    list.replaceChildren();
    const groups = {};
    cases.forEach((data, index) => {
      if (!groups[data.topic]) {
        groups[data.topic] = element('div', 'cl-cases');
        groups[data.topic].setAttribute('role', 'group');
        groups[data.topic].setAttribute('aria-label', data.topic);
        list.append(element('h2', 'cl-topic', data.topic), groups[data.topic]);
      }
      const button = element('button', 'sl-btn cl-case');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === current));
      const meta = element('span', 'cl-case-meta');
      const count = stars(data);
      meta.append(
        element('span', 'cl-stars', starText(count)),
        element('span', '', status(data))
      );
      meta.firstChild.setAttribute('aria-label', `${count} of 3 stars`);
      button.append(element('span', 'cl-case-name', data.name), meta);
      button.addEventListener('click', () => {
        open(index);
        $('#sl-case-title').scrollIntoView({ block: 'start' });
      });
      groups[data.topic].append(button);
    });
    const complete = cases.filter((data) => status(data) === 'Complete').length;
    const total = cases.reduce((sum, data) => sum + stars(data), 0);
    $('#sl-progress').textContent = `${complete} of ${cases.length} cases complete`;
    $('#sl-stars').textContent = `★ ${total} / ${cases.length * 3}`;
  }

  function renderLines() {
    const data = item();
    const entry = state();
    const box = $('#sl-lines');
    box.replaceChildren();
    box.classList.toggle('cl-code', data.format === 'code');
    data.lines.forEach((line, index) => {
      if (!line.trim()) {
        box.append(element('div', 'cl-line-blank'));
        return;
      }
      const flagged = entry.flagged.includes(index);
      const row = element(entry.spotChecked ? 'div' : 'button', 'cl-line');
      row.append(element('span', 'cl-num', String(index + 1)), element('span', 'cl-text', line));
      if (!entry.spotChecked) {
        row.type = 'button';
        row.setAttribute('aria-pressed', String(flagged));
        row.addEventListener('click', () => {
          entry.flagged = flagged
            ? entry.flagged.filter((n) => n !== index)
            : [...entry.flagged, index];
          $('#sl-spot-result').hidden = true;
          save();
          renderLines();
          renderList();
          box.querySelectorAll('.cl-line')[lineButton(index)].focus();
        });
      } else {
        const flaw = data.flaws.includes(index);
        const related = data.related.includes(index);
        let tag = '';
        if (flaw && flagged) [row.dataset.result, tag] = ['hit', 'Problem found'];
        else if (flaw) [row.dataset.result, tag] = ['miss', 'Missed'];
        else if (flagged && related) [row.dataset.result, tag] = ['related', 'Related'];
        else if (flagged) [row.dataset.result, tag] = ['wrong', 'This line is fine'];
        if (tag) row.append(element('span', 'cl-tag', tag));
        if (data.notes[index] && (flaw || flagged)) {
          row.append(element('span', 'cl-line-note', data.notes[index]));
        }
      }
      box.append(row);
    });
  }
  // Position of a line among the rendered (non-blank) rows, for restoring focus.
  function lineButton(index) {
    return item()
      .lines.slice(0, index)
      .filter((line) => line.trim()).length;
  }

  function renderChoice(question, tries, container, result, onPick) {
    container.replaceChildren();
    const done = solved(tries, question.answer);
    question.options.forEach((option, index) => {
      const button = element('button', 'cl-option', option.text);
      button.type = 'button';
      if (tries.includes(index)) {
        button.dataset.result = index === question.answer ? 'right' : 'wrong';
      }
      button.disabled = done || tries.includes(index);
      button.addEventListener('click', () => onPick(index));
      container.append(button);
    });
    const last = tries[tries.length - 1];
    result.hidden = last === undefined;
    if (last !== undefined) {
      const right = last === question.answer;
      result.dataset.result = right ? 'right' : 'wrong';
      result.textContent = `${right ? 'Correct.' : 'Not quite.'} ${question.options[last].why}`;
      if (!right) result.append(element('span', 'cl-retry', ' Try another answer.'));
    }
  }

  function renderCase() {
    const data = item();
    const entry = state();
    $('#sl-case-title').textContent = data.title;
    $('#sl-case-kind').textContent = data.kind;
    $('#sl-case-source').textContent = `Lecture: ${data.source}`;
    $('#sl-case-fluency').textContent = `AI Fluency: ${data.fluency}`;
    $('#sl-case-fluency').hidden = !data.fluency;
    $('#sl-case-origin').hidden = data.origin !== 'teacher-reviewed';
    $('#sl-case-question').textContent = data.question;
    const count = data.flaws.length;
    $('#sl-spot-hint').textContent =
      count === 1
        ? 'Tap the 1 line that is wrong, then check.'
        : `Tap the ${count} lines that are wrong, then check.`;
    renderLines();
    $('#sl-spot-check').hidden = entry.spotChecked;

    const spot = $('#sl-spot-result');
    spot.hidden = !entry.spotChecked;
    if (entry.spotChecked) {
      const found = data.flaws.filter((n) => entry.flagged.includes(n)).length;
      const perfect = spotPerfect(data, entry);
      spot.dataset.result = perfect ? 'right' : 'partial';
      const extra = found === data.flaws.length ? ', but also marked a line that is fine' : '';
      spot.textContent = perfect
        ? `★ You found all ${data.flaws.length} problems.`
        : `You found ${found} of ${data.flaws.length} problems${extra}. Read the notes on the marked lines.`;
    }

    $('#sl-step-cause').hidden = !entry.spotChecked;
    renderChoice(data.cause, entry.causeTries, $('#sl-cause-options'), $('#sl-cause-result'), (n) => {
      entry.causeTries.push(n);
      save();
      renderCase();
    });

    const causeDone = solved(entry.causeTries, data.cause.answer);
    $('#sl-step-fix').hidden = !causeDone;
    $('#sl-fix-prompt').textContent = data.fix.prompt;
    input.value = entry.draft;
    input.setCustomValidity('');
    $('#sl-check').hidden = entry.revealed;
    $('#sl-correction-result').hidden = !entry.revealed;
    $('#sl-ref-title').textContent = data.fix.title;
    $('#sl-ref-text').textContent = data.fix.text;
    $('#sl-ref-example').textContent = data.fix.example;
    $('#sl-ref-example').classList.toggle('cl-prose', data.format !== 'code');
    const criteria = $('#sl-criteria');
    criteria.replaceChildren();
    data.fix.criteria.forEach((criterion, index) => {
      const label = element('label', 'cl-check');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = entry.checks.includes(index);
      box.addEventListener('change', () => {
        entry.checks = box.checked
          ? [...entry.checks, index].sort()
          : entry.checks.filter((n) => n !== index);
        save();
      });
      label.append(box, element('span', '', criterion));
      criteria.append(label);
    });

    $('#sl-next-question').hidden = !(causeDone && entry.nextSeen);
    $('#sl-apply-question').textContent = data.apply.question;
    renderChoice(data.apply, entry.applyTries, $('#sl-apply-options'), $('#sl-apply-result'), (n) => {
      const wasDone = solved(entry.applyTries, data.apply.answer);
      entry.applyTries.push(n);
      save();
      renderCase();
      if (!wasDone && n === data.apply.answer) {
        app.appendEvent({
          module: 'correction-lab',
          type: 'case-completed',
          conceptId: data.conceptId,
          caseId: data.id,
        });
      }
    });
    $('#sl-case-end').hidden = !solved(entry.applyTries, data.apply.answer);
    $('#sl-lesson-link').href = `../knowledge-map/?topic=${data.conceptId}`;
    renderList();
    app.icons();
  }

  function open(index) {
    current = index;
    const url = new URL(location.href);
    url.searchParams.set('case', item().id);
    history.replaceState(null, '', url);
    save();
    renderCase();
  }

  $('#sl-spot-check').addEventListener('click', () => {
    const entry = state();
    const result = $('#sl-spot-result');
    if (!entry.flagged.length) {
      result.hidden = false;
      result.dataset.result = 'wrong';
      result.textContent = 'Tap at least one line you think is wrong.';
      return;
    }
    entry.spotChecked = true;
    save();
    renderCase();
    $('#sl-spot-result').focus();
  });
  input.addEventListener('input', () => {
    input.setCustomValidity('');
    state().draft = input.value;
    save();
    renderList();
  });
  $('#sl-check').addEventListener('click', () => {
    if (!input.value.trim()) {
      input.setCustomValidity('Write your fix first.');
      input.reportValidity();
      return;
    }
    state().revealed = true;
    state().nextSeen = true;
    save();
    renderCase();
    $('#sl-ref-title').focus();
    app.appendEvent({
      module: 'correction-lab',
      type: 'reference-opened',
      conceptId: item().conceptId,
      caseId: item().id,
    });
  });
  $('#sl-next-case').addEventListener('click', () => {
    open((current + 1) % cases.length);
    $('#sl-case-title').scrollIntoView({ block: 'start' });
    $('#sl-case-title').focus({ preventScroll: true });
  });
  $('#sl-reset').addEventListener('click', () => {
    if (!confirm('Start this case again? Your answers and stars for it will be cleared.')) return;
    progress[item().id] = blank();
    save();
    renderCase();
  });

  $('#sl-spot-result').tabIndex = -1;
  $('#sl-ref-title').tabIndex = -1;
  renderCase();
})();
