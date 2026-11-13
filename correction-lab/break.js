/**
 * Part 4, AI-assisted verification. Input is { case, dialogue, testSpecs }: the shared case,
 * the repair plan the learner confirmed in part 3, and the case's fixed tests. The learner
 * applies the plan (by choosing changes or editing code), the tests really run in a Web
 * Worker, and AI reviews the results. Output is
 * { caseId, aiSource, verification: { testSource, tests, outcome, aiReview, reviewTopics } }.
 * Test statuses and the outcome always come from the runner, never from the AI.
 */
(function () {
  const app = window.SkillLoop;
  const shared = window.SkillLoopShared;
  const levels = window.SkillLoopLevels;
  const runner = window.SkillLoopRunner;
  const $ = (selector) => document.querySelector(selector);
  const caseIds = Object.keys(shared.cases);
  const frame = $('#bk-app');
  const editor = $('#bk-code');
  editor.maxLength = 5000;
  const WORDS = { pass: 'Pass', fail: 'Fail', error: 'Error', not_run: 'Not run' };
  const OUTCOMES = {
    passed: 'All tests pass for this case.',
    needs_revision: 'Needs revision: at least one test fails.',
    inconclusive: 'Inconclusive: some tests could not run.',
  };

  /* ---- Handoff with the other parts -------------------------------------------------
   * The integration step will connect saving and navigation. Until then no confirmed plan
   * arrives from part 3, so the page says so and offers the labelled sample plan.
   * Replace these two functions when the shared store exists; nothing else reads or writes
   * cross-part data. readPart3 returns part 3's whole output { caseId, aiSource, dialogue }
   * as saved, or null; it is checked with runner.checkDialogue before use.
   */
  function readPart3(/* caseId */) {
    return null;
  }
  function writeVerification(output) {
    state().output = output;
    save();
    document.dispatchEvent(new CustomEvent('skillloop:verification', { detail: output }));
  }

  const saved = app.read('correction', {});
  const stored = saved.verify && typeof saved.verify === 'object' ? saved.verify : {};
  const blank = (caseId) => ({
    plan: null, // { source: 'sample' | 'dialogue', dialogue, key }
    reproduced: [],
    choices: {},
    mode: 'choices',
    code: shared.cases[caseId].starterCode,
    run: null, // { code, tests } for the code the tests last ran on
    review: null, // { key, aiSource, aiReview, reviewTopics }
    hints: [],
    explain: {},
    output: null,
  });
  const progress = {};
  const planProblems = {}; // caseId → why a part 3 output found for it cannot be used
  let replanned = false;
  caseIds.forEach((caseId) => {
    const found = readPart3(caseId);
    const checked = found ? runner.checkDialogue(found, shared.cases[caseId]) : { problems: [] };
    if (found && checked.problems.length) planProblems[caseId] = checked.problems;
    const dialogue = checked.dialogue || null;
    const key = dialogue ? JSON.stringify(dialogue) : '';
    let entry = stored[caseId] && typeof stored[caseId] === 'object' ? stored[caseId] : {};
    // A new or changed plan from part 3 starts this case again: earlier results were for another plan.
    if (dialogue && !(entry.plan && entry.plan.source === 'dialogue' && entry.plan.key === key)) {
      entry = {};
      replanned = true;
    }
    const issueIds = shared.cases[caseId].issues.map((issue) => issue.issueId);
    const list = (value) => (Array.isArray(value) ? value.filter((id) => issueIds.includes(id)) : []);
    const choices = {};
    const explain = {};
    issueIds.forEach((id) => {
      if (entry.choices && [0, 1, 2].includes(entry.choices[id])) choices[id] = entry.choices[id];
      const tries = entry.explain && Array.isArray(entry.explain[id]) ? entry.explain[id] : [];
      explain[id] = tries.filter((n) => [0, 1, 2].includes(n));
    });
    progress[caseId] = {
      ...blank(caseId),
      plan: dialogue
        ? { source: 'dialogue', dialogue, key }
        : entry.plan && entry.plan.source === 'sample'
          ? { source: 'sample', dialogue: shared.sampleDialogues[caseId] }
          : null,
      reproduced: list(entry.reproduced),
      choices,
      mode: entry.mode === 'code' ? 'code' : 'choices',
      code: typeof entry.code === 'string' ? entry.code.slice(0, 5000) : shared.cases[caseId].starterCode,
      run: entry.run && typeof entry.run.code === 'string' && Array.isArray(entry.run.tests) ? entry.run : null,
      review: entry.review && typeof entry.review.aiReview === 'string' ? entry.review : null,
      hints: list(entry.hints),
      explain,
      output: entry.output && entry.output.verification ? entry.output : null,
    };
  });

  const requested = new URLSearchParams(location.search).get('case');
  let current = caseIds.includes(requested) ? requested : caseIds[0];
  let worker = null;
  if (replanned) save();

  const item = () => shared.cases[current];
  const level = () => levels[current];
  const state = () => progress[current];
  function save() {
    // Other pages share the `correction` key, so keep whatever they stored.
    app.write('correction', { ...app.read('correction', {}), verify: progress });
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  // The code the tests and the app use right now.
  function activeCode() {
    const entry = state();
    return entry.mode === 'code' ? entry.code : runner.assemble(level(), entry.choices);
  }
  // Results count only for the exact code they ran on; after any change they are not_run.
  function tests() {
    const entry = state();
    if (entry.run && entry.run.code === activeCode()) return entry.run.tests;
    return item().tests.map((spec) => ({ testId: spec.testId, status: 'not_run', actual: '' }));
  }
  const hasRun = () => tests().some((result) => result.status !== 'not_run');
  const reviewKey = () => JSON.stringify(tests());
  const review = () => (state().review && state().review.key === reviewKey() ? state().review : null);
  const solved = (tries, answer) => tries.includes(answer);

  /**
   * The app runs in a sandboxed frame with no access to this page or its storage. A small
   * harness reports when a real call shows one of the case's issues.
   */
  function loadApp() {
    const data = level();
    const entry = state();
    // Hand-edited code runs in the app only after the worker has shown that it finishes.
    const safeToRun = entry.mode !== 'code' || (hasRun() && tests().every((result) => result.status !== 'error'));
    const code = safeToRun ? activeCode() : item().starterCode;
    const safe = (source) => source.replace(/<\/script/gi, '<\\/script');
    const watch = Object.entries(data.detectors).map(([id, d]) => ({ id, fn: d.fn, detect: d.detect }));
    const harness = `(function () {
  var caseId = ${JSON.stringify(current)};
  window.__report = function (issueId) { parent.postMessage({ skillloop: 'issue', caseId: caseId, issueId: issueId }, '*'); };
  var watch = ${JSON.stringify(watch)};
  ${JSON.stringify(data.fns)}.forEach(function (name) {
    var original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function () {
      var args = Array.prototype.slice.call(arguments), result, error = null;
      try { result = original.apply(this, args); } catch (thrown) { error = thrown; }
      watch.forEach(function (w) {
        if (w.fn !== name) return;
        var hit = false;
        try { hit = !!new Function('args', 'result', 'error', 'return (' + w.detect + ');')(args, result, error); } catch (_) {}
        if (hit) window.__report(w.id);
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
input, textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 9px 10px; border: 1px solid #d8d3c8; border-radius: 8px; font: inherit; }
button { margin: 12px 6px 0 0; padding: 9px 14px; border: 1px solid #b4472a; border-radius: 8px; background: #b4472a; color: #fff; font: inherit; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: default; }
fieldset { margin: 12px 0 0; padding: 10px 12px 12px; border: 1px solid #e5e1d8; border-radius: 10px; }
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
    if (message.skillloop !== 'issue' || message.caseId !== current) return;
    const entry = state();
    if (!item().issues.some((issue) => issue.issueId === message.issueId)) return;
    if (entry.reproduced.includes(message.issueId)) return;
    entry.reproduced.push(message.issueId);
    save();
    renderIssues();
  });

  /** Run the fixed tests off the page; code that never finishes is stopped after 3 seconds. */
  function runTests(code) {
    return new Promise((resolve) => {
      const checks = level().checks;
      worker = new Worker('/correction-lab/break-worker.js');
      const done = (results) => {
        clearTimeout(timer);
        worker.terminate();
        worker = null;
        resolve(results);
      };
      const stuck = (actual) => checks.map((check) => ({ testId: check.testId, status: 'error', actual }));
      const timer = setTimeout(
        () => done(stuck('The code did not finish within 3 seconds. Check for a loop or a request that never ends.')),
        3000
      );
      worker.onmessage = (event) => done(event.data);
      worker.onerror = () => done(stuck('The test runner could not start.'));
      worker.postMessage({ code, fns: level().fns, checks });
    });
  }
  async function runNow() {
    if (worker) return;
    const entry = state();
    const code = activeCode();
    entry.run = null;
    entry.review = null;
    entry.output = null;
    $('#bk-send').disabled = true;
    $('#bk-run').disabled = true;
    const box = $('#bk-outcome');
    box.dataset.result = '';
    box.textContent = 'Running the tests…';
    const results = await runTests(code);
    entry.run = { code, tests: results };
    save();
    loadApp();
    render();
    $('#bk-step4').scrollIntoView({ block: 'start' });
    $('#bk-step4').focus({ preventScroll: true });
    if (runner.outcome(results) === 'passed') {
      app.appendEvent({ module: 'correction-lab', type: 'fix-verified', conceptId: item().topicIds[0], caseId: current });
    }
  }

  function renderCases() {
    const list = $('#bk-levels');
    list.replaceChildren();
    caseIds.forEach((caseId) => {
      const entry = progress[caseId];
      const button = element('button', 'sl-btn cl-case');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(caseId === current));
      const out = entry.output && entry.output.verification.outcome;
      const label = out ? { passed: 'Passed', needs_revision: 'Needs revision', inconclusive: 'Inconclusive' }[out] : entry.plan ? 'In progress' : 'Not started';
      button.append(
        element('span', 'cl-case-name', shared.cases[caseId].title),
        element('span', 'cl-case-meta', label)
      );
      button.addEventListener('click', () => open(caseId));
      list.append(button);
    });
  }

  function statusMark(status) {
    const mark = element('span', 'bk-mark', WORDS[status]);
    mark.dataset.status = status;
    return mark;
  }

  // Step 1: the confirmed plan as an acceptance checklist.
  function renderPlan() {
    const entry = state();
    const data = item();
    const results = tests();
    $('#bk-plan-source').textContent =
      entry.plan.source === 'sample'
        ? 'Sample plan (fictional example data, not your own dialogue).'
        : 'The plan you confirmed in the repair dialogue.';
    $('#bk-rules').replaceChildren(...data.requirements.map((rule) => element('li', '', rule)));
    const box = $('#bk-plan');
    box.replaceChildren();
    entry.plan.dialogue.plan.forEach((step) => {
      const issue = data.issues.find((candidate) => candidate.issueId === step.issueId);
      const card = element('fieldset', 'bk-report-card');
      card.append(element('legend', '', issue ? issue.title : step.issueId));
      const facts = element('dl', 'bk-facts');
      facts.append(
        element('dt', '', 'Problem'),
        element('dd', '', step.problem),
        element('dt', '', 'Change requested'),
        element('dd', '', step.changeRequest)
      );
      card.append(facts);
      const checks = element('ul', 'bk-tests');
      step.checks.forEach((check) => {
        const result = results.find((r) => r.testId === check.testId) || { status: 'not_run' };
        const row = element('li', 'bk-test');
        row.dataset.status = result.status;
        row.append(statusMark(result.status), element('span', '', `${check.input} → ${check.expected}`));
        checks.append(row);
      });
      card.append(checks);
      box.append(card);
    });
    $('#bk-plan-feedback').textContent = entry.plan.dialogue.feedback
      ? `Feedback from the dialogue step: ${entry.plan.dialogue.feedback}`
      : '';
  }

  // Step 2: which issues the learner has seen for themselves in the running app.
  function renderIssues() {
    const entry = state();
    const list = $('#bk-bugs');
    list.replaceChildren();
    item().issues.forEach((issue) => {
      const seen = entry.reproduced.includes(issue.issueId);
      const card = element('div', 'bk-bug');
      card.dataset.found = String(seen);
      card.append(element('strong', '', issue.title));
      card.append(element('p', '', seen ? `Reproduced: ${issue.observed}` : 'Not reproduced in the app yet.'));
      list.append(card);
    });
  }

  // Step 3 without code: one card per issue; the learner chooses the change that matches
  // what they asked for. A wrong request leads to a wrong change, and the tests show it.
  function renderChoices() {
    const entry = state();
    const data = item();
    const results = tests();
    const ran = hasRun();
    const box = $('#bk-report');
    box.replaceChildren();
    data.issues.forEach((issue) => {
      const step = entry.plan.dialogue.plan.find((candidate) => candidate.issueId === issue.issueId);
      const fixes = level().repair.fixes[issue.issueId];
      const card = element('fieldset', 'bk-report-card');
      card.append(element('legend', '', issue.title));
      const facts = element('dl', 'bk-facts');
      facts.append(
        element('dt', '', 'You asked for'),
        element('dd', '', step ? step.changeRequest : 'Nothing: this issue is not in your plan.')
      );
      card.append(facts);
      const options = element('div', 'cl-options');
      options.setAttribute('role', 'group');
      options.setAttribute('aria-label', `Change for: ${issue.title}`);
      fixes.forEach((fix, index) => {
        const button = element('button', 'cl-option', fix.label);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(entry.choices[issue.issueId] === index));
        button.addEventListener('click', () => {
          // Choosing again leaves the issue unchanged, so a learner can undo a change.
          if (entry.choices[issue.issueId] === index) delete entry.choices[issue.issueId];
          else entry.choices[issue.issueId] = index;
          entry.hints = entry.hints.filter((id) => id !== issue.issueId);
          entry.output = null;
          save();
          loadApp();
          render();
        });
        options.append(button);
      });
      card.append(options);

      const chosen = fixes[entry.choices[issue.issueId]];
      const own = data.tests.filter((spec) => spec.issueId === issue.issueId).map((spec) => spec.testId);
      const failed = results.filter((r) => own.includes(r.testId) && r.status === 'fail').length;
      if (ran && chosen) {
        const details = element('details', 'bk-diff');
        details.append(element('summary', '', 'What this change does, and its code'), element('p', '', chosen.say));
        details.append(element('pre', 'sl-code', Object.values(chosen.parts).join('\n') || '(This change removes the line that cleared the draft.)'));
        card.append(details);
      }
      if (ran && failed) {
        if (entry.hints.includes(issue.issueId)) {
          card.append(
            element(
              'p',
              'bk-verdict',
              chosen ? (chosen.correct ? 'This change meets the requirement. Look at the other items.' : chosen.why) : `No change is applied for this issue yet. ${issue.observed}`
            )
          );
        } else {
          const hint = element('button', 'sl-text-button', `${failed} test${failed === 1 ? '' : 's'} for this item fail. Show a hint`);
          hint.type = 'button';
          hint.addEventListener('click', () => {
            entry.hints.push(issue.issueId);
            save();
            render();
          });
          card.append(hint);
        }
      }
      box.append(card);
    });
  }

  // Step 4: every test of the case with its real status.
  function renderResults() {
    const data = item();
    const results = tests();
    const out = runner.outcome(results);
    const box = $('#bk-outcome');
    if (!hasRun()) {
      box.dataset.result = '';
      box.textContent = state().run
        ? 'The code changed since the last run, so the earlier results no longer apply. Run the tests again.'
        : 'The tests have not run on this code yet.';
    } else {
      box.dataset.result = { passed: 'right', needs_revision: 'partial', inconclusive: 'wrong' }[out];
      const passed = results.filter((r) => r.status === 'pass').length;
      box.textContent = `${OUTCOMES[out]} ${passed} of ${results.length} pass.`;
    }
    const list = $('#bk-tests');
    list.replaceChildren();
    results.forEach((result) => {
      const spec = data.tests.find((candidate) => candidate.testId === result.testId);
      const row = element('li', 'bk-test');
      row.dataset.status = result.status;
      const body = element('span', 'bk-test-body');
      body.append(
        element('strong', '', spec.action),
        element('span', 'cl-line-note', `Expected: ${spec.expected}`),
        element('span', 'cl-line-note', result.actual ? `Actual: ${result.actual}` : 'Actual: not run yet.')
      );
      row.append(statusMark(result.status), body);
      list.append(row);
    });
  }

  /** Labelled fallback when the AI is not connected: built only from the real results. */
  function sampleReview() {
    const data = item();
    const results = tests();
    const failing = results.filter((r) => r.status !== 'pass');
    if (!failing.length) {
      return {
        aiReview: `Sample review (AI not connected): all ${results.length} tests pass on the current code. That shows the stated requirements hold for these inputs; it does not show the app is safe or complete beyond this teaching case.`,
        reviewTopics: [],
      };
    }
    const first = failing[0];
    const spec = data.tests.find((candidate) => candidate.testId === first.testId);
    const topics = new Set();
    failing.forEach((r) => {
      const issue = data.issues.find((candidate) => candidate.issueId === data.tests.find((t) => t.testId === r.testId).issueId);
      (issue ? issue.topicIds : ['software-testing']).forEach((id) => topics.add(id));
    });
    return {
      aiReview: `Sample review (AI not connected): ${failing.length} of ${results.length} tests do not pass. For example, "${spec.action}" expected "${spec.expected}" but the result was: ${first.actual} Compare the change with the requirement, adjust it and run the tests again.`,
      reviewTopics: [...topics],
    };
  }
  function buildOutput(aiSource, aiReview, reviewTopics) {
    const results = tests();
    return {
      caseId: current,
      aiSource,
      verification: { testSource: 'runner', tests: results, outcome: runner.outcome(results), aiReview, reviewTopics },
    };
  }
  function setReview(aiSource, aiReview, reviewTopics) {
    state().review = { key: reviewKey(), aiSource, aiReview, reviewTopics };
    writeVerification(buildOutput(aiSource, aiReview, reviewTopics));
    app.appendEvent({ module: 'correction-lab', type: 'verification-reviewed', conceptId: item().topicIds[0], caseId: current });
    render();
  }

  // Step 5: AI explains the results; step 6 and the record follow.
  function renderReview() {
    const ran = hasRun();
    const current_ = review();
    $('#bk-step-review').hidden = !ran;
    $('#bk-review').hidden = !current_;
    $('#bk-review-actions').hidden = Boolean(current_);
    if (current_) {
      $('#bk-review-label').textContent = current_.aiSource === 'api' ? 'AI review' : 'Sample review';
      $('#bk-review-text').textContent = current_.aiReview;
      const topics = $('#bk-review-topics');
      topics.replaceChildren();
      if (current_.reviewTopics.length) {
        topics.append('Topics to revise: ');
        current_.reviewTopics.forEach((topicId, index) => {
          const topic = shared.topics.find((candidate) => candidate.topicId === topicId);
          const link = element('a', '', topic ? topic.title : topicId);
          link.href = `/knowledge-map/concept.html?graph=software-development&topic=${encodeURIComponent(topicId)}`;
          if (index) topics.append(', ');
          topics.append(link);
        });
      }
    }
    const output = current_ && state().output;
    $('#bk-step-output').hidden = !output;
    if (output) {
      $('#bk-output-note').textContent =
        `Outcome: ${output.verification.outcome}. Tests ran in your browser (testSource: runner); the review is from ${output.aiSource === 'api' ? 'the AI service' : 'a labelled sample'} (aiSource: ${output.aiSource}).`;
      $('#bk-output').textContent = JSON.stringify(output, null, 2);
    }
  }

  function renderExplain() {
    const entry = state();
    const passed = hasRun() && runner.outcome(tests()) === 'passed';
    $('#bk-step-explain').hidden = !passed;
    const box = $('#bk-explain');
    box.replaceChildren();
    if (!passed) return;
    item().issues.forEach((issue) => {
      const question = level().explain[issue.issueId];
      const tries = entry.explain[issue.issueId];
      const done = solved(tries, question.answer);
      const options = element('div', 'cl-options');
      options.setAttribute('role', 'group');
      question.options.forEach((option, index) => {
        const button = element('button', 'cl-option', option.text);
        button.type = 'button';
        if (tries.includes(index)) button.dataset.result = index === question.answer ? 'right' : 'wrong';
        button.disabled = done || tries.includes(index);
        button.addEventListener('click', () => {
          tries.push(index);
          save();
          renderExplain();
        });
        options.append(button);
      });
      const wrap = element('div', 'bk-choice');
      wrap.append(options);
      const last = tries[tries.length - 1];
      if (last !== undefined) {
        const right = last === question.answer;
        const result = element('div', 'cl-result', `${right ? 'Correct.' : 'Not quite.'} ${question.options[last].why}`);
        result.dataset.result = right ? 'right' : 'wrong';
        wrap.append(result);
      }
      box.append(element('p', 'cl-apply-question', question.question), wrap);
    });
  }

  function render() {
    const data = item();
    const entry = state();
    $('#bk-title').textContent = data.title;
    $('#bk-scenario').textContent = data.scenario;
    $('#bk-claim').textContent = data.aiClaim;
    $('#bk-topics').replaceChildren(
      ...data.topicIds.map((topicId) => {
        const topic = shared.topics.find((candidate) => candidate.topicId === topicId);
        return element('span', 'sl-chip', topic ? topic.title : topicId);
      })
    );
    $('#bk-noplan').hidden = Boolean(entry.plan);
    const problems = planProblems[current] || [];
    $('#bk-noplan-problems').hidden = !problems.length;
    $('#bk-noplan-none').hidden = problems.length > 0;
    $('#bk-noplan-list').replaceChildren(...problems.map((problem) => element('li', '', problem)));
    $('#bk-flow').hidden = !entry.plan;
    renderCases();
    if (!entry.plan) {
      app.icons();
      return;
    }
    renderPlan();
    $('#bk-try').textContent = level().tryIt;
    renderIssues();
    const choosing = entry.mode === 'choices';
    $('#bk-fix-title').textContent = choosing ? 'Apply the plan' : 'Edit the code';
    $('#bk-report-block').hidden = !choosing;
    $('#bk-code-block').hidden = choosing;
    if (choosing) renderChoices();
    if (editor.value !== entry.code) editor.value = entry.code;
    $('#bk-send').disabled = Boolean(worker);
    $('#bk-run').disabled = Boolean(worker);
    renderResults();
    renderReview();
    renderExplain();
    app.icons();
  }

  function open(caseId) {
    current = caseId;
    const url = new URL(location.href);
    url.searchParams.set('case', current);
    history.replaceState(null, '', url);
    $('#bk-review-status').hidden = true;
    if (state().plan) loadApp();
    render();
  }

  $('#bk-load-sample').addEventListener('click', () => {
    state().plan = { source: 'sample', dialogue: shared.sampleDialogues[current] };
    save();
    loadApp();
    render();
  });
  $('#bk-send').addEventListener('click', runNow);
  $('#bk-run').addEventListener('click', runNow);
  $('#bk-mode-code').addEventListener('click', () => {
    const entry = state();
    // Start from the chosen changes, so a partly correct repair can be finished by hand.
    entry.code = runner.assemble(level(), entry.choices);
    entry.mode = 'code';
    entry.output = null;
    save();
    loadApp();
    render();
  });
  $('#bk-mode-report').addEventListener('click', () => {
    state().mode = 'choices';
    state().output = null;
    save();
    loadApp();
    render();
  });
  editor.addEventListener('input', () => {
    state().code = editor.value;
    state().output = null;
    save();
    renderCases();
    renderPlan();
    renderResults();
    renderReview();
    renderExplain();
  });
  $('#bk-restore').addEventListener('click', () => {
    if (!confirm('Replace your edits with the starter code?')) return;
    state().code = item().starterCode;
    save();
    loadApp();
    render();
  });

  $('#bk-ask-ai').addEventListener('click', async () => {
    const entry = state();
    const box = $('#bk-review-status');
    const button = $('#bk-ask-ai');
    const key = reviewKey();
    button.disabled = true;
    box.hidden = false;
    box.dataset.result = '';
    box.textContent = 'Asking the AI to review the results…';
    try {
      const response = await fetch('/api/correction/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review',
          caseId: current,
          tests: tests(),
          plan: entry.plan.dialogue.plan.map(({ issueId, changeRequest }) => ({ issueId, changeRequest })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.error || 'The AI review failed.'), { code: body.code });
      // Ignore a reply for results that have since changed.
      if (key !== reviewKey()) return;
      box.hidden = true;
      setReview('api', body.verification.aiReview, body.verification.reviewTopics);
    } catch (error) {
      box.dataset.result = 'wrong';
      box.textContent =
        error.code === 'NOT_CONFIGURED'
          ? 'The AI service is not connected on this site yet. You can show the labelled sample review instead.'
          : error instanceof TypeError
            ? 'The review service could not be reached. Try again, or show the labelled sample review.'
            : `${error.message} Try again, or show the labelled sample review.`;
    } finally {
      button.disabled = false;
    }
  });
  $('#bk-sample-review').addEventListener('click', () => {
    const sample = sampleReview();
    $('#bk-review-status').hidden = true;
    setReview('sample', sample.aiReview, sample.reviewTopics);
  });

  $('#bk-reset').addEventListener('click', () => {
    if (!confirm('Start this case again? Your changes, results and review for it will be cleared.')) return;
    const explain = Object.fromEntries(item().issues.map((issue) => [issue.issueId, []]));
    // Keep a plan that came from the dialogue; a sample plan is loaded again only on request.
    const plan = state().plan && state().plan.source === 'dialogue' ? state().plan : null;
    progress[current] = { ...blank(current), explain, plan };
    save();
    open(current);
  });

  open(current);
})();
