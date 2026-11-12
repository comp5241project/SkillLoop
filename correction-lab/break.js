/**
 * "Break the vibe-coded app": the learner uses a small app in a sandboxed frame and bugs are
 * detected from the app's real calls. To fix it they report each bug to the AI (no code needed)
 * and review the change that comes back, or edit the code themselves. Either way the fix is
 * verified by running hidden tests in a Web Worker. Nothing here is graded by an AI.
 */
(function () {
  const app = window.SkillLoop;
  const levels = window.SkillLoopLevels;
  const runner = window.SkillLoopRunner;
  const $ = (selector) => document.querySelector(selector);
  const frame = $('#bk-app');
  const editor = $('#bk-code');
  editor.maxLength = 5000;

  const saved = app.read('correction', {});
  const stored = saved.break && typeof saved.break === 'object' ? saved.break : {};
  const ids = (value, allowed) =>
    Array.isArray(value) ? [...new Set(value.filter((id) => allowed.includes(id)))] : [];
  // A map from bug ID to an option index (0-2), dropping anything else.
  const picks = (value, bugIds) =>
    Object.fromEntries(
      Object.entries(value && typeof value === 'object' ? value : {}).filter(
        ([id, n]) => bugIds.includes(id) && [0, 1, 2].includes(n)
      )
    );
  const blank = (data) => ({
    found: [],
    hints: [],
    code: data.code,
    passed: false,
    runs: 0,
    refShown: false,
    lessonTries: [],
    mode: data.repair ? 'report' : 'code',
    report: {},
    sent: null,
    sends: 0,
    firstPass: false,
    flagged: [],
    explain: {},
  });
  const progress = {};
  levels.forEach((data) => {
    const entry = stored[data.id] && typeof stored[data.id] === 'object' ? stored[data.id] : {};
    const bugIds = data.bugs.map((bug) => bug.id);
    const explain = {};
    bugIds.forEach((id) => {
      explain[id] = ids(entry.explain && entry.explain[id], [0, 1, 2]);
    });
    progress[data.id] = {
      ...blank(data),
      found: ids(entry.found, bugIds),
      hints: ids(entry.hints, bugIds),
      code: typeof entry.code === 'string' ? entry.code.slice(0, 5000) : data.code,
      passed: entry.passed === true,
      runs: Number.isInteger(entry.runs) ? entry.runs : 0,
      refShown: entry.refShown === true,
      lessonTries: ids(entry.lessonTries, [0, 1, 2]),
      mode: data.repair && entry.mode !== 'code' ? 'report' : 'code',
      report: picks(entry.report, bugIds),
      sent: data.repair && entry.sent ? picks(entry.sent, bugIds) : null,
      sends: Number.isInteger(entry.sends) ? entry.sends : 0,
      firstPass: entry.firstPass === true,
      flagged: ids(entry.flagged, bugIds),
      explain,
    };
  });

  const requested = new URLSearchParams(location.search).get('level');
  let current = Math.max(0, levels.findIndex((data) => data.id === requested));
  let results = null; // Last test results for the code now shown in the app.
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
  const solved = (tries, answer) => tries.includes(answer);
  const explained = (data, entry) => data.bugs.every((bug) => solved(entry.explain[bug.id], bug.explain2.answer));
  const complete = (data) => {
    const entry = progress[data.id];
    if (!entry.passed) return false;
    return data.repair ? explained(data, entry) : solved(entry.lessonTries, data.lesson.answer);
  };
  function stars(data) {
    const entry = progress[data.id];
    const fixedWell = entry.passed && (entry.sent ? entry.firstPass : !entry.refShown);
    const understood = data.repair
      ? entry.passed && data.bugs.every((bug) => entry.explain[bug.id][0] === bug.explain2.answer)
      : entry.lessonTries[0] === data.lesson.answer;
    return (
      Number(entry.found.length === data.bugs.length && entry.hints.length === 0) +
      Number(fixedWell) +
      Number(understood)
    );
  }
  // The code the app and the tests use: the AI's reply to the last report, the learner's own
  // edit once it passes, or the original.
  function activeCode() {
    const entry = state();
    if (entry.sent) return runner.assemble(level(), entry.sent);
    return entry.passed ? entry.code : level().code;
  }

  /**
   * The app runs in a sandboxed frame with no access to this page or its storage. A small
   * harness wraps the level's functions and reports when a real call shows a bug.
   */
  function loadApp() {
    const data = level();
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
</style></head><body>${data.html}<script>${safe(activeCode())}</script><script>${harness}</script><script>${safe(data.wire)}</script></body></html>`;
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

  /** Run the hidden tests off the page; code that never finishes is stopped after 3 seconds. */
  function runTests(code) {
    return new Promise((resolve) => {
      const data = level();
      worker = new Worker('/correction-lab/break-worker.js');
      const done = (outcome) => {
        clearTimeout(timer);
        worker.terminate();
        worker = null;
        resolve(outcome);
      };
      const timer = setTimeout(
        () => done({ error: 'it did not finish within 3 seconds. Check for a loop that never ends.' }),
        3000
      );
      worker.onmessage = (event) => done(event.data);
      worker.onerror = () => done({ error: 'the test runner could not start.' });
      worker.postMessage({ code, fns: data.fns, tests: data.tests });
    });
  }
  function markPassed() {
    const entry = state();
    if (entry.passed) return;
    entry.passed = true;
    app.appendEvent({ module: 'correction-lab', type: 'fix-verified', conceptId: level().conceptId, caseId: level().id });
  }

  function choiceGroup(question, tries, onPick) {
    const wrap = element('div', 'bk-choice');
    const done = solved(tries, question.answer);
    const box = element('div', 'cl-options');
    box.setAttribute('role', 'group');
    question.options.forEach((option, index) => {
      const button = element('button', 'cl-option', option.text);
      button.type = 'button';
      if (tries.includes(index)) button.dataset.result = index === question.answer ? 'right' : 'wrong';
      button.disabled = done || tries.includes(index);
      button.addEventListener('click', () => onPick(index));
      box.append(button);
    });
    wrap.append(box);
    const last = tries[tries.length - 1];
    if (last !== undefined) {
      const right = last === question.answer;
      const result = element('div', 'cl-result', `${right ? 'Correct.' : 'Not quite.'} ${question.options[last].why}`);
      result.dataset.result = right ? 'right' : 'wrong';
      wrap.append(result);
    }
    return wrap;
  }

  function renderLevels() {
    const list = $('#bk-levels');
    list.replaceChildren();
    levels.forEach((data, index) => {
      const button = element('button', 'sl-btn cl-case');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === current));
      const count = stars(data);
      const meta = element('span', 'cl-case-meta');
      meta.append(
        element('span', 'cl-stars', '★'.repeat(count) + '☆'.repeat(3 - count)),
        element('span', '', complete(data) ? 'Complete' : `${progress[data.id].found.length} of ${data.bugs.length} bugs`)
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
      ? 'Fixed. The app below runs the fixed code, so try to break it again.'
      : entry.sent
        ? `The app below now runs the AI's fix. Try it. Bugs found: ${entry.found.length} of ${data.bugs.length}.`
        : `Use the app with inputs the AI never tried. Bugs found: ${entry.found.length} of ${data.bugs.length}.`;
  }

  function renderTests(list, items) {
    list.replaceChildren();
    (items || []).forEach((result) => {
      const row = element('li', 'bk-test', result.name);
      row.dataset.ok = String(result.ok);
      row.prepend(element('span', 'bk-mark', result.ok ? 'Pass' : 'Fail'));
      if (result.error) row.append(element('span', 'cl-line-note', `Error: ${result.error}`));
      list.append(row);
    });
  }

  // Step 2 without code: a bug report per found bug. The learner chooses what should happen.
  function renderReport() {
    const data = level();
    const entry = state();
    const box = $('#bk-report');
    box.replaceChildren();
    data.bugs.forEach((bug, index) => {
      const card = element('fieldset', 'bk-report-card');
      if (!entry.found.includes(bug.id)) {
        card.append(element('legend', '', `Bug ${index + 1}`), element('p', 'cl-hint', 'Find this bug in the app before you can report it.'));
        box.append(card);
        return;
      }
      card.append(element('legend', '', bug.title));
      const facts = element('dl', 'bk-facts');
      facts.append(
        element('dt', '', 'What I did'),
        element('dd', '', bug.did),
        element('dt', '', 'What happened'),
        element('dd', '', bug.happened),
        element('dt', '', 'What should happen')
      );
      card.append(facts);
      const options = element('div', 'cl-options');
      options.setAttribute('role', 'group');
      options.setAttribute('aria-label', `What should happen for: ${bug.title}`);
      bug.fixes.forEach((fix, n) => {
        const button = element('button', 'cl-option', fix.ask);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(entry.report[bug.id] === n));
        button.disabled = entry.passed;
        button.addEventListener('click', () => {
          entry.report[bug.id] = n;
          save();
          render();
        });
        options.append(button);
      });
      card.append(options);
      box.append(card);
    });
    const ready = entry.found.length > 0 && entry.found.every((id) => entry.report[id] !== undefined);
    const changed = !entry.sent || entry.found.some((id) => entry.sent[id] !== entry.report[id]);
    $('#bk-send').disabled = !ready || !changed || entry.passed || Boolean(worker);
    $('#bk-send-label').textContent = entry.sent ? 'Send the updated report' : 'Send to the AI';
  }

  // Step 3: what the AI changed, in plain words, with the real test results.
  function renderReview() {
    const data = level();
    const entry = state();
    $('#bk-step-review').hidden = !entry.sent;
    if (!entry.sent) return;
    const reported = data.bugs.filter((bug) => entry.sent[bug.id] !== undefined);
    const failing = (results || []).some((result) => !result.ok);
    $('#bk-ai-reply').textContent = `Thanks for the report. I made ${reported.length} change${reported.length === 1 ? '' : 's'} and I am confident it is fixed now.`;
    const list = $('#bk-changes');
    list.replaceChildren();
    reported.forEach((bug, index) => {
      const fix = bug.fixes[entry.sent[bug.id]];
      const flagged = entry.flagged.includes(bug.id);
      const card = element('div', 'bk-change');
      const head = element(failing && !flagged ? 'button' : 'div', 'bk-change-head');
      head.append(element('strong', '', `Change ${index + 1} · ${bug.title}`), element('span', '', fix.say));
      if (head.tagName === 'BUTTON') {
        head.type = 'button';
        head.addEventListener('click', () => {
          entry.flagged.push(bug.id);
          save();
          render();
        });
      }
      card.append(head);
      if (flagged) {
        card.dataset.result = fix.correct ? 'right' : 'wrong';
        card.append(
          element(
            'p',
            'bk-verdict',
            fix.correct
              ? 'This change does what the owner wants. Look at the others.'
              : `${fix.why} Change this part of your report above and send it again.`
          )
        );
      }
      const details = element('details', 'bk-diff');
      details.append(element('summary', '', 'Show the code the AI added'), element('pre', 'sl-code', fix.code));
      card.append(details);
      list.append(card);
    });
    const status = $('#bk-review-status');
    const wrong = reported.some((bug) => !bug.fixes[entry.sent[bug.id]].correct);
    if (!results) {
      status.dataset.result = '';
      status.textContent = 'Running the tests…';
    } else if (!failing) {
      status.dataset.result = 'right';
      status.textContent = `★ All ${results.length} tests pass. The AI's fix matches what the owner wants.`;
    } else if (wrong) {
      status.dataset.result = 'partial';
      status.textContent = 'The AI says it is fixed, but tests fail. Read each change and tap the one that does not do what the owner wants.';
    } else {
      status.dataset.result = 'partial';
      status.textContent = 'These changes are right, but tests still fail: there is a bug you have not found and reported yet. Keep breaking the app.';
    }
    renderTests($('#bk-ai-tests'), results);
  }

  // Step 4: why each change is the right one.
  function renderExplain() {
    const data = level();
    const entry = state();
    $('#bk-step-explain').hidden = !(data.repair && entry.passed);
    const box = $('#bk-explain');
    box.replaceChildren();
    if (!data.repair || !entry.passed) return;
    data.bugs.forEach((bug) => {
      const tries = entry.explain[bug.id];
      box.append(
        element('p', 'cl-apply-question', bug.explain2.question),
        choiceGroup(bug.explain2, tries, (index) => {
          tries.push(index);
          save();
          if (explained(data, entry)) {
            app.appendEvent({ module: 'correction-lab', type: 'level-completed', conceptId: data.conceptId, caseId: data.id });
          }
          render();
        })
      );
    });
  }

  function renderLesson() {
    const data = level();
    const entry = state();
    $('#bk-step-lesson').hidden = Boolean(data.repair) || !entry.passed;
    if (data.repair) return;
    $('#bk-lesson-question').textContent = data.lesson.question;
    const group = choiceGroup(data.lesson, entry.lessonTries, (index) => {
      entry.lessonTries.push(index);
      save();
      if (index === data.lesson.answer) {
        app.appendEvent({ module: 'correction-lab', type: 'level-completed', conceptId: data.conceptId, caseId: data.id });
      }
      render();
    });
    $('#bk-lesson-options').replaceChildren(...group.querySelector('.cl-options').children);
    const result = $('#bk-lesson-result');
    const feedback = group.querySelector('.cl-result');
    result.hidden = !feedback;
    if (feedback) {
      result.dataset.result = feedback.dataset.result;
      result.textContent = feedback.textContent;
    }
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
    const reporting = entry.mode === 'report';
    $('#bk-fix-title').textContent = reporting ? 'Report it to the AI' : 'Fix it';
    $('#bk-owner').textContent = (data.repair && data.repair.owner) || 'What the fix must do';
    $('#bk-rules').replaceChildren(...data.rules.map((rule) => element('li', '', rule)));
    $('#bk-report-block').hidden = !reporting;
    $('#bk-code-block').hidden = reporting;
    $('#bk-mode-report').hidden = !data.repair;
    if (reporting) renderReport();
    if (editor.value !== entry.code) editor.value = entry.code;
    $('#bk-show-ref').hidden = entry.runs === 0 && !entry.refShown;
    $('#bk-reference').hidden = !entry.refShown;
    $('#bk-reference').textContent = data.reference;
    renderTests($('#bk-tests'), entry.sent ? null : results);

    renderReview();
    renderExplain();
    renderLesson();
    $('#bk-end').hidden = !complete(data);
    $('#bk-lesson-link').href = `/knowledge-map/?topic=${data.conceptId}`;
    renderLevels();
    app.icons();
  }

  function status(box, message, result) {
    box.hidden = !message;
    box.textContent = message || '';
    box.dataset.result = result || '';
  }

  async function open(index) {
    current = index;
    results = null;
    $('#bk-toast').hidden = true;
    status($('#bk-run-status'), '');
    status($('#bk-send-status'), '');
    const url = new URL(location.href);
    url.searchParams.set('level', level().id);
    history.replaceState(null, '', url);
    loadApp();
    render();
    // Results are not stored; run the tests again for a fix that was sent or passed earlier.
    const opened = current;
    if ((state().sent || state().passed) && !worker) {
      const outcome = await runTests(activeCode());
      if (opened !== current) return;
      results = outcome.results || null;
      render();
    }
  }

  $('#bk-send').addEventListener('click', async () => {
    if (worker) return;
    const entry = state();
    entry.sent = Object.fromEntries(entry.found.map((id) => [id, entry.report[id]]));
    entry.sends += 1;
    entry.flagged = [];
    results = null;
    save();
    loadApp();
    render();
    status($('#bk-send-status'), 'The AI is changing the code…');
    const outcome = await runTests(activeCode());
    results = outcome.results || [];
    if (results.length && results.every((result) => result.ok)) {
      if (entry.sends === 1) entry.firstPass = true;
      markPassed();
    }
    save();
    status($('#bk-send-status'), '');
    render();
    $('#bk-step3r').scrollIntoView({ block: 'start' });
    $('#bk-step3r').focus({ preventScroll: true });
  });
  $('#bk-mode-code').addEventListener('click', () => {
    const entry = state();
    // Start from whatever the app runs now, so an AI fix can be finished by hand.
    if (entry.sent) entry.code = activeCode();
    entry.sent = null;
    entry.mode = 'code';
    results = null;
    save();
    loadApp();
    render();
  });
  $('#bk-mode-report').addEventListener('click', () => {
    state().mode = 'report';
    save();
    render();
  });

  $('#bk-run').addEventListener('click', async () => {
    if (worker) return;
    const entry = state();
    const box = $('#bk-run-status');
    $('#bk-run').disabled = true;
    status(box, 'Running the tests…');
    const outcome = await runTests(editor.value);
    $('#bk-run').disabled = false;
    entry.runs += 1;
    if (outcome.error) {
      results = null;
      entry.passed = false;
      status(box, `Your code could not run: ${outcome.error}`, 'wrong');
    } else {
      results = outcome.results;
      const failed = results.filter((result) => !result.ok).length;
      if (failed) {
        entry.passed = false;
        status(box, `${failed} of ${results.length} tests fail. Read the rules again and keep going.`, 'partial');
      } else {
        status(box, `★ All ${results.length} tests pass. The app now runs your code.`, 'right');
        markPassed();
      }
    }
    save();
    loadApp();
    render();
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
    if (!confirm('Start this level again? Found bugs, your answers and stars for it will be cleared.')) return;
    const data = level();
    progress[data.id] = { ...blank(data), explain: Object.fromEntries(data.bugs.map((bug) => [bug.id, []])) };
    save();
    open(current);
  });

  open(current);
})();
