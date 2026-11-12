/**
 * "Break the vibe-coded app": the learner uses a small app in a sandboxed frame, bugs are
 * detected from the app's real calls, and the fix is verified by running hidden tests in a
 * Web Worker. Nothing here is graded by an AI.
 */
(function () {
  const app = window.SkillLoop;
  const levels = window.SkillLoopLevels;
  const $ = (selector) => document.querySelector(selector);
  const frame = $('#bk-app');
  const editor = $('#bk-code');
  editor.maxLength = 5000;

  const saved = app.read('correction', {});
  const stored = saved.break && typeof saved.break === 'object' ? saved.break : {};
  const ids = (value, allowed) =>
    Array.isArray(value) ? [...new Set(value.filter((id) => allowed.includes(id)))] : [];
  const progress = {};
  levels.forEach((level) => {
    const entry = stored[level.id] && typeof stored[level.id] === 'object' ? stored[level.id] : {};
    const bugIds = level.bugs.map((bug) => bug.id);
    progress[level.id] = {
      found: ids(entry.found, bugIds),
      hints: ids(entry.hints, bugIds),
      code: typeof entry.code === 'string' ? entry.code.slice(0, 5000) : level.code,
      passed: entry.passed === true,
      runs: Number.isInteger(entry.runs) ? entry.runs : 0,
      refShown: entry.refShown === true,
      lessonTries: ids(entry.lessonTries, [0, 1, 2]),
    };
  });

  const requested = new URLSearchParams(location.search).get('level');
  let current = Math.max(0, levels.findIndex((level) => level.id === requested));
  let results = null;
  let worker = null;

  const level = () => levels[current];
  const state = () => progress[level().id];
  function save() {
    // Other pages share the `correction` key, so keep whatever they stored.
    app.write('correction', { ...app.read('correction', {}), break: progress });
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function stars(data) {
    const entry = progress[data.id];
    return (
      Number(entry.found.length === data.bugs.length && entry.hints.length === 0) +
      Number(entry.passed && !entry.refShown) +
      Number(entry.lessonTries[0] === data.lesson.answer)
    );
  }
  const complete = (data) => progress[data.id].lessonTries.includes(data.lesson.answer);

  /**
   * The app runs in a sandboxed frame with no access to this page or its storage. A small
   * harness wraps the level's functions and reports when a real call shows a bug.
   */
  function loadApp() {
    const data = level();
    const code = state().passed ? state().code : data.code;
    const safe = (source) => source.replace(/<\/script/gi, '<\\/script');
    const harness = `(function () {
  var bugs = ${JSON.stringify(data.bugs.map(({ id, fn, detect }) => ({ id, fn, detect })))};
  ${JSON.stringify(data.fns)}.forEach(function (name) {
    var original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function () {
      var args = Array.prototype.slice.call(arguments), result, error = null;
      try { result = original.apply(this, args); } catch (thrown) { error = thrown; }
      bugs.forEach(function (bug) {
        if (bug.fn !== name) return;
        var hit = false;
        try { hit = !!new Function('args', 'result', 'error', 'return (' + bug.detect + ');')(args, result, error); } catch (_) {}
        if (hit) parent.postMessage({ skillloop: 'bug', level: ${JSON.stringify(data.id)}, bug: bug.id }, '*');
      });
      if (error) throw error;
      return result;
    };
  });
  function size() { parent.postMessage({ skillloop: 'size', height: document.body.offsetHeight }, '*'); }
  size();
  new ResizeObserver(size).observe(document.body);
})();`;
    frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
body { margin: 0; padding: 16px; font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1c1b19; background: #fff; }
h2 { margin: 0 0 12px; font-size: 17px; }
label { display: block; margin: 10px 0 0; font-size: 14px; }
input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 9px 10px; border: 1px solid #d8d3c8; border-radius: 8px; font: inherit; }
button { margin-top: 12px; padding: 9px 14px; border: 1px solid #b4472a; border-radius: 8px; background: #b4472a; color: #fff; font: inherit; cursor: pointer; }
fieldset { margin: 0 0 12px; padding: 10px 12px 12px; border: 1px solid #e5e1d8; border-radius: 10px; }
legend { padding: 0 6px; font-weight: 600; font-size: 14px; }
p { margin: 10px 0 0; } .tip { color: #6b675f; font-size: 13px; margin-top: 0; }
[role=status] { font-weight: 600; min-height: 1.5em; overflow-wrap: anywhere; }
</style></head><body>${data.html}<script>${safe(code)}</script><script>${harness}</script><script>${safe(data.wire)}</script></body></html>`;
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== frame.contentWindow || !message || typeof message !== 'object') return;
    if (message.skillloop === 'size' && Number.isFinite(message.height)) {
      frame.style.height = `${Math.min(1200, Math.max(180, Math.ceil(message.height) + 2))}px`;
    }
    if (message.skillloop !== 'bug' || message.level !== level().id) return;
    const entry = state();
    const bug = level().bugs.find((item) => item.id === message.bug);
    if (!bug || entry.passed || entry.found.includes(bug.id)) return;
    entry.found.push(bug.id);
    save();
    render();
    const toast = $('#bk-toast');
    toast.hidden = false;
    toast.textContent = `Bug found: ${bug.title}.`;
    if (entry.found.length === level().bugs.length) {
      app.appendEvent({ module: 'correction-lab', type: 'bugs-found', conceptId: level().conceptId, caseId: level().id });
    }
  });

  function renderLevels() {
    const list = $('#bk-levels');
    list.replaceChildren();
    levels.forEach((data, index) => {
      const button = element('button', 'sl-btn cl-case');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === current));
      const count = stars(data);
      const meta = element('span', 'cl-case-meta');
      const found = progress[data.id].found.length;
      meta.append(
        element('span', 'cl-stars', '★'.repeat(count) + '☆'.repeat(3 - count)),
        element('span', '', complete(data) ? 'Complete' : `${found} of ${data.bugs.length} bugs`)
      );
      meta.firstChild.setAttribute('aria-label', `${count} of 3 stars`);
      button.append(element('span', 'cl-case-name', data.name), meta);
      button.addEventListener('click', () => open(index));
      list.append(button);
    });
    const total = levels.reduce((sum, data) => sum + stars(data), 0);
    $('#bk-stars').textContent = `★ ${total} / ${levels.length * 3}`;
  }

  function renderBugs() {
    const data = level();
    const entry = state();
    const list = $('#bk-bugs');
    list.replaceChildren();
    data.bugs.forEach((bug, index) => {
      const found = entry.found.includes(bug.id);
      const card = element('div', 'bk-bug');
      card.dataset.found = String(found);
      card.append(element('strong', '', found ? bug.title : `Bug ${index + 1} · not found yet`));
      if (found) card.append(element('p', '', bug.explain));
      else if (entry.hints.includes(bug.id)) card.append(element('p', '', `Hint: ${bug.hint}`));
      else {
        const hint = element('button', 'sl-text-button', 'Show a hint');
        hint.type = 'button';
        hint.setAttribute('aria-label', `Show a hint for bug ${index + 1}`);
        hint.addEventListener('click', () => {
          entry.hints.push(bug.id);
          save();
          render();
        });
        card.append(hint);
      }
      list.append(card);
    });
    $('#bk-progress').textContent = entry.passed
      ? 'Fixed. The app below now runs your code, so try to break it again.'
      : `Use the app with inputs the AI never tried. Bugs found: ${entry.found.length} of ${data.bugs.length}.`;
  }

  function renderTests() {
    const list = $('#bk-tests');
    list.replaceChildren();
    (results || []).forEach((result) => {
      const row = element('li', 'bk-test', result.name);
      row.dataset.ok = String(result.ok);
      row.prepend(element('span', 'bk-mark', result.ok ? 'Pass' : 'Fail'));
      if (result.error) row.append(element('span', 'cl-line-note', `Error: ${result.error}`));
      list.append(row);
    });
  }

  function renderLesson() {
    const data = level();
    const entry = state();
    const lesson = data.lesson;
    const done = entry.lessonTries.includes(lesson.answer);
    $('#bk-lesson-question').textContent = lesson.question;
    const box = $('#bk-lesson-options');
    box.replaceChildren();
    lesson.options.forEach((option, index) => {
      const button = element('button', 'cl-option', option.text);
      button.type = 'button';
      if (entry.lessonTries.includes(index)) {
        button.dataset.result = index === lesson.answer ? 'right' : 'wrong';
      }
      button.disabled = done || entry.lessonTries.includes(index);
      button.addEventListener('click', () => {
        entry.lessonTries.push(index);
        save();
        if (index === lesson.answer) {
          app.appendEvent({ module: 'correction-lab', type: 'level-completed', conceptId: data.conceptId, caseId: data.id });
        }
        render();
      });
      box.append(button);
    });
    const last = entry.lessonTries[entry.lessonTries.length - 1];
    const result = $('#bk-lesson-result');
    result.hidden = last === undefined;
    if (last !== undefined) {
      const right = last === lesson.answer;
      result.dataset.result = right ? 'right' : 'wrong';
      result.textContent = `${right ? 'Correct.' : 'Not quite.'} ${lesson.options[last].why}`;
    }
    $('#bk-end').hidden = !done;
    $('#bk-lesson-link').href = `/knowledge-map/?topic=${data.conceptId}`;
  }

  function render() {
    const data = level();
    const entry = state();
    $('#bk-title').textContent = data.name;
    $('#bk-source').textContent = `Lecture: ${data.source}`;
    $('#bk-request').textContent = data.request;
    $('#bk-claim').textContent = data.claim;
    renderBugs();
    $('#bk-step-fix').hidden = entry.found.length === 0 && !entry.passed;
    const rules = $('#bk-rules');
    rules.replaceChildren(...data.rules.map((rule) => element('li', '', rule)));
    if (editor.value !== entry.code) editor.value = entry.code;
    $('#bk-show-ref').hidden = entry.runs === 0 && !entry.refShown;
    $('#bk-reference').hidden = !entry.refShown;
    $('#bk-reference').textContent = data.reference;
    renderTests();
    $('#bk-step-lesson').hidden = !entry.passed;
    renderLesson();
    renderLevels();
    app.icons();
  }

  function open(index) {
    current = index;
    results = null;
    $('#bk-toast').hidden = true;
    $('#bk-run-status').hidden = true;
    const url = new URL(location.href);
    url.searchParams.set('level', level().id);
    history.replaceState(null, '', url);
    loadApp();
    render();
  }

  function status(message, result) {
    const box = $('#bk-run-status');
    box.hidden = !message;
    box.textContent = message || '';
    box.dataset.result = result || '';
  }

  function finish(outcome) {
    const entry = state();
    $('#bk-run').disabled = false;
    worker = null;
    entry.runs += 1;
    if (outcome.error) {
      results = null;
      status(`Your code could not run: ${outcome.error}`, 'wrong');
    } else {
      results = outcome.results;
      const failed = results.filter((result) => !result.ok).length;
      if (failed) status(`${failed} of ${results.length} tests fail. Read the rules again and keep going.`, 'partial');
      else {
        status(`★ All ${results.length} tests pass. The app now runs your code.`, 'right');
        if (!entry.passed) {
          entry.passed = true;
          app.appendEvent({ module: 'correction-lab', type: 'fix-verified', conceptId: level().conceptId, caseId: level().id });
        }
      }
      if (failed && entry.passed) entry.passed = false;
    }
    save();
    loadApp();
    render();
  }

  $('#bk-run').addEventListener('click', () => {
    if (worker) return;
    const data = level();
    $('#bk-run').disabled = true;
    status('Running the tests…');
    worker = new Worker('/correction-lab/break-worker.js');
    // Stop code that never finishes, such as a loop with no exit.
    const timer = setTimeout(() => {
      worker.terminate();
      finish({ error: 'it did not finish within 3 seconds. Check for a loop that never ends.' });
    }, 3000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      finish(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      finish({ error: 'the test runner could not start.' });
    };
    worker.postMessage({ code: editor.value, fns: data.fns, tests: data.tests });
  });
  editor.addEventListener('input', () => {
    state().code = editor.value;
    save();
  });
  $('#bk-restore').addEventListener('click', () => {
    if (!confirm("Replace your edits with the AI's original code?")) return;
    state().code = level().code;
    save();
    render();
  });
  $('#bk-show-ref').addEventListener('click', () => {
    state().refShown = true;
    save();
    render();
  });
  $('#bk-next').addEventListener('click', () => {
    open((current + 1) % levels.length);
    $('#bk-title').scrollIntoView({ block: 'start' });
    $('#bk-title').focus({ preventScroll: true });
  });
  $('#bk-reset').addEventListener('click', () => {
    if (!confirm('Start this level again? Found bugs, your code and stars for it will be cleared.')) return;
    const data = level();
    progress[data.id] = {
      found: [],
      hints: [],
      code: data.code,
      passed: false,
      runs: 0,
      refShown: false,
      lessonTries: [],
    };
    save();
    open(current);
  });

  loadApp();
  render();
})();
