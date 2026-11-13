(function () {
  'use strict';

  const data = window.LearningPathDiagnosisData;
  const model = window.LearningPathDiagnosisModel;
  const STORAGE_KEY = 'learningPathDiagnosis';
  const MAX_EXPLANATION = 400;

  const state = {
    caseId: null,
    questions: [],
    questionSource: null,
    responses: {},
    learner: { background: 'beginner', goal: 'internship' },
    result: null,
    source: null,
    aiAvailable: null,
    availabilityPromise: null,
    questionRequest: 0,
    questionsLoading: false,
    busy: false,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function icon(name) {
    const element = document.createElement('i');
    element.setAttribute('data-lucide', name);
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function announce(message) {
    const live = $('lp-live');
    if (live) live.textContent = message;
  }

  function showError(message) {
    const box = $('lp-error');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  function hideError() {
    const box = $('lp-error');
    if (!box) return;
    box.textContent = '';
    box.hidden = true;
  }

  function caseData() {
    return state.caseId ? data.findCase(state.caseId) : null;
  }

  function activeQuestions() {
    return state.questions;
  }

  function activeCase() {
    const found = caseData();
    return found ? { ...found, questions: state.questions } : null;
  }

  function conceptTitle(conceptId) {
    const point = data.knowledgePoint(conceptId);
    return point ? point.title : conceptId;
  }

  function levelLabel(level) {
    return { foundation: 'Foundation', developing: 'Developing', ready: 'Ready' }[level] || level;
  }

  function setStage(name) {
    const stages = { cases: 'lp-case-step', diagnosis: 'lp-diagnosis-step', result: 'lp-result-step' };
    Object.values(stages).forEach((id) => {
      const section = $(id);
      if (section) section.hidden = true;
    });
    const current = $(stages[name]);
    if (current) current.hidden = false;

    document.querySelectorAll('.lp-step').forEach((step) => {
      step.removeAttribute('aria-current');
      if (step.dataset.step === 'diagnosis') {
        step.setAttribute('aria-current', 'step');
        const small = step.querySelector('small');
        if (small) small.textContent = name === 'result' ? 'Completed' : 'Current part';
      }
    });
  }

  function selectedCaseButton(caseId) {
    const grid = $('lp-case-grid');
    if (!grid) return null;
    return grid.querySelector('[data-case-id="' + caseId + '"]');
  }

  function selectCase(caseId) {
    state.caseId = caseId;
    state.questions = [];
    state.questionSource = null;
    state.questionRequest += 1;
    state.questionsLoading = false;
    state.responses = {};
    state.result = null;
    state.source = null;
    document.querySelectorAll('.lp-case-card').forEach((card) => {
      card.setAttribute('aria-pressed', String(card.dataset.caseId === caseId));
    });
    const start = $('lp-start');
    if (start) start.disabled = !caseId;
    hideError();
    const found = data.findCase(caseId);
    if (found) announce(found.title + ' selected. Start the diagnosis when ready.');
  }

  function renderCases() {
    const grid = $('lp-case-grid');
    if (!grid) return;
    grid.textContent = '';
    data.cases.forEach((item) => {
      const card = node('button', 'lp-case-card');
      card.type = 'button';
      card.dataset.caseId = item.id;
      card.setAttribute('aria-pressed', String(item.id === state.caseId));
      card.setAttribute('aria-label', item.title + ' — ' + item.tagline);

      const top = node('span', 'lp-case-top');
      top.append(node('span', 'sl-chip', item.stack));
      top.append(node('span', 'lp-select-mark', 'Select'));

      const title = node('span', 'lp-case-title', item.title);
      const tagline = node('span', 'lp-case-tagline', item.tagline);
      const summary = node('span', 'sl-small lp-case-summary', item.summary);
      const points = node('span', 'lp-case-points');
      item.knowledgePoints.forEach((conceptId) => {
        points.append(node('span', 'sl-chip', conceptTitle(conceptId)));
      });

      card.append(top, title, tagline, summary, points);
      grid.append(card);
    });
    const start = $('lp-start');
    if (start) start.disabled = !state.caseId;
  }

  function renderBrief() {
    const brief = $('lp-case-brief');
    if (!brief) return;
    brief.textContent = '';
    const found = caseData();
    if (!found) return;

    const card = node('article', 'sl-card lp-case-brief');
    const head = node('div', 'sl-row lp-brief-head');
    const titleWrap = node('div');
    titleWrap.append(node('div', 'sl-kicker', 'Case brief'));
    titleWrap.append(node('h2', 'lp-brief-title', found.title));
    titleWrap.append(node('p', 'sl-small', found.summary));
    head.append(titleWrap);
    head.append(node('span', 'sl-chip', found.stack));

    const codeWrap = node('div', 'lp-code-wrap');
    codeWrap.append(node('div', 'lp-code-label', 'Code under discussion'));
    const pre = node('pre', 'lp-snippet');
    pre.append(node('code', '', found.snippet));
    codeWrap.append(pre);

    const points = node('div', 'lp-case-points');
    found.knowledgePoints.forEach((conceptId) => {
      points.append(node('span', 'sl-chip', conceptTitle(conceptId)));
    });

    card.append(head, codeWrap, points);
    brief.append(card);
  }

  function renderQuestionSource(message, isAi) {
    const source = $('lp-question-source');
    if (!source) return;
    source.textContent = message || '';
    source.hidden = !message;
    source.classList.toggle('is-ai', Boolean(isAi));
  }

  function renderQuestionState(message) {
    const list = $('lp-question-list');
    if (!list) return;
    list.textContent = '';
    const stateCard = node('div', 'sl-card lp-question-state');
    stateCard.append(node('p', 'sl-small', message));
    list.append(stateCard);
    updateRunState();
  }

  function renderQuestionError(message) {
    const list = $('lp-question-list');
    if (!list) return;
    list.textContent = '';
    const card = node('div', 'lp-error lp-question-state');
    card.setAttribute('role', 'alert');
    card.append(node('p', 'sl-small', message));
    const actions = node('div', 'sl-row lp-question-actions');
    const retry = node('button', 'sl-btn', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', () => loadQuestions(true));
    const fallback = node('button', 'sl-btn', 'Use authored checks');
    fallback.type = 'button';
    fallback.addEventListener('click', () => {
      const found = caseData();
      if (!found) return;
      state.questions = found.questions;
      state.questionSource = 'authored';
      hideError();
      renderQuestions();
      renderQuestionSource(
        'Authored sample checks · AI could not write a fresh set. These fixed checks still support an AI diagnosis.'
      );
      announce('Authored sample checks loaded.');
      updateRunState();
    });
    actions.append(retry, fallback);
    card.append(actions);
    list.append(card);
    updateRunState();
  }

  function renderQuestions() {
    const list = $('lp-question-list');
    const questions = activeQuestions();
    if (!list) return;
    list.textContent = '';
    if (!questions.length) {
      updateRunState();
      return;
    }

    questions.forEach((question, index) => {
      const fieldset = node('fieldset', 'lp-question');
      fieldset.dataset.questionId = question.id;

      const legend = document.createElement('legend');
      legend.append(node('span', 'lp-q-number', 'Check ' + (index + 1)));
      legend.append(node('span', 'lp-q-prompt', question.prompt));
      fieldset.append(legend);
      fieldset.append(
        node('p', 'sl-small lp-q-concept', conceptTitle(question.conceptId) + ' · choose one approach')
      );

      const saved = state.responses[question.id] || {};
      const options = node('div', 'lp-options');
      question.options.forEach((option) => {
        const label = node('label', 'lp-option');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = option.id;
        input.required = true;
        if (saved.optionId === option.id) input.checked = true;
        const text = node('span', 'lp-option-text', option.label);
        label.append(input, text);
        options.append(label);
      });
      fieldset.append(options);

      const explainId = 'explain-' + question.id;
      const explainLabel = node('label', 'lp-explain-label', 'Explain your reasoning (optional)');
      explainLabel.htmlFor = explainId;
      const textarea = document.createElement('textarea');
      textarea.id = explainId;
      textarea.className = 'lp-explain';
      textarea.dataset.questionId = question.id;
      textarea.maxLength = MAX_EXPLANATION;
      textarea.rows = 2;
      textarea.placeholder = 'In your own words: what would you check, and why?';
      textarea.value = saved.explanation || '';

      const counter = node(
        'span',
        'lp-counter',
        String(textarea.value.length) + '/' + MAX_EXPLANATION
      );
      counter.dataset.counterFor = question.id;
      fieldset.append(explainLabel, textarea, counter);
      list.append(fieldset);
    });
  }

  async function loadQuestions(force) {
    if (!state.caseId || state.questionsLoading) return;
    if (!force && activeQuestions().length) {
      renderQuestions();
      return;
    }

    const found = caseData();
    if (!found) return;
    const token = ++state.questionRequest;
    state.questions = [];
    state.questionSource = null;
    renderQuestionSource('Checking the AI service…');
    renderQuestionState('Checking whether live AI is available…');

    await ensureAvailability();
    if (token !== state.questionRequest) return;

    if (state.aiAvailable === false) {
      state.questions = found.questions;
      state.questionSource = 'authored';
      hideError();
      renderQuestions();
      renderQuestionSource(
        'Authored sample checks · live AI is not configured, so these fixed checks are used.'
      );
      announce('Live AI is unavailable. Authored sample checks loaded.');
      updateRunState();
      return;
    }

    state.questionsLoading = true;
    renderQuestionSource('Writing four fresh checks for this case…', true);
    renderQuestionState('DeepSeek is writing a fresh set of case-specific checks…');
    updateRunState();
    announce('Writing new AI checks.');

    try {
      let response;
      try {
        response = await fetch('/api/learning-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ action: 'questions', caseId: found.id }),
        });
      } catch {
        throw new Error('The AI service is unreachable. Please retry.');
      }

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (response.status === 503 && payload.code === 'ai-not-configured') {
        state.aiAvailable = false;
        updateAiStatus();
        state.questions = found.questions;
        state.questionSource = 'authored';
        renderQuestions();
        renderQuestionSource(
          'Authored sample checks · live AI is not configured, so these fixed checks are used.'
        );
        announce('Live AI is unavailable. Authored sample checks loaded.');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || 'The AI could not write new checks.');
      }

      const generated = payload && payload.questions;
      const check = model.validateQuestions(generated, found);
      if (!check.ok) {
        throw new Error('The AI returned an invalid question set. Please retry.');
      }
      if (token !== state.questionRequest) return;

      state.questions = generated;
      state.questionSource = 'ai';
      hideError();
      renderQuestions();
      renderQuestionSource(
        'AI-written checks · a fresh set for this attempt. Choose one approach per check.',
        true
      );
      announce('Four new AI-written checks are ready.');
    } catch (error) {
      if (token !== state.questionRequest) return;
      state.questions = [];
      state.questionSource = null;
      renderQuestionSource('AI checks could not be loaded.');
      renderQuestionError(
        error && error.message
          ? error.message
          : 'The AI could not write new checks. Please retry.'
      );
      announce('Question generation failed. Retry or use the authored checks.');
    } finally {
      if (token === state.questionRequest) {
        state.questionsLoading = false;
        updateRunState();
      }
    }
  }

  async function openDiagnosis() {
    if (!state.caseId) return;
    state.responses = {};
    state.result = null;
    state.source = null;
    hideError();
    renderBrief();
    setStage('diagnosis');
    const heading = $('lp-diagnosis-heading');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    await loadQuestions(true);
  }

  function collectResponses() {
    const questions = activeQuestions();
    const list = $('lp-question-list');
    if (!questions.length || !list) return null;
    const responses = [];
    for (const question of questions) {
      const checked = list.querySelector('input[name="' + question.id + '"]:checked');
      if (!checked) {
        showError(
          'Answer all ' + questions.length + ' checks before running the diagnosis.'
        );
        const first = list.querySelector('input[name="' + question.id + '"]');
        if (first) first.focus();
        return null;
      }
      const textarea = list.querySelector('textarea[data-question-id="' + question.id + '"]');
      const explanation = textarea ? textarea.value.trim() : '';
      if (explanation.length > MAX_EXPLANATION) {
        showError('Keep each explanation to ' + MAX_EXPLANATION + ' characters or fewer.');
        if (textarea) textarea.focus();
        return null;
      }
      responses.push({
        questionId: question.id,
        optionId: checked.value,
        explanation,
      });
    }
    state.responses = responses.reduce((acc, item) => {
      acc[item.questionId] = { optionId: item.optionId, explanation: item.explanation };
      return acc;
    }, {});
    return responses;
  }

  function updateRunState() {
    const run = $('lp-run');
    if (!run) return;
    const blocked = state.busy || state.questionsLoading || !activeQuestions().length;
    run.disabled = blocked;
    run.setAttribute('aria-busy', String(state.busy || state.questionsLoading));
    if (state.busy) {
      run.textContent = 'Diagnosing…';
    } else if (state.questionsLoading) {
      run.textContent = 'Writing checks…';
    } else {
      run.textContent =
        state.aiAvailable === false ? 'Run sample diagnosis' : 'Run AI diagnosis';
      run.append(icon('sparkles'));
      refreshIcons();
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    updateRunState();
  }

  function updateAiStatus() {
    const chip = $('lp-ai-status');
    if (!chip) return;
    chip.classList.remove('is-live', 'is-local', 'is-checking');
    if (state.aiAvailable === null) {
      chip.textContent = 'Checking AI service…';
      chip.classList.add('is-checking');
    } else if (state.aiAvailable) {
      chip.textContent = 'Live AI ready';
      chip.classList.add('is-live');
    } else {
      chip.textContent = 'Local sample mode';
      chip.classList.add('is-local');
    }
    updateRunState();
  }

  async function checkAvailability() {
    if (state.availabilityPromise) return state.availabilityPromise;
    state.availabilityPromise = (async () => {
      try {
        const response = await fetch('/api/learning-path', {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('unavailable');
        const payload = await response.json();
        state.aiAvailable = Boolean(payload && payload.available);
      } catch {
        state.aiAvailable = false;
      }
      updateAiStatus();
      return state.aiAvailable;
    })();
    try {
      return await state.availabilityPromise;
    } finally {
      state.availabilityPromise = null;
    }
  }

  async function ensureAvailability() {
    if (state.aiAvailable !== null) return state.aiAvailable;
    return checkAvailability();
  }

  function saveProfile() {
    if (!window.SkillLoop) return;
    try {
      const profile = window.SkillLoop.read('profile', {}) || {};
      window.SkillLoop.write('profile', {
        ...profile,
        background: state.learner.background,
        goal: state.learner.goal,
      });
    } catch {
      /* A blocked storage area must not stop the diagnosis. */
    }
  }

  function saveRecord(record) {
    if (window.SkillLoop) {
      try {
        window.SkillLoop.write(STORAGE_KEY, record);
        if (typeof window.SkillLoop.appendEvent === 'function') {
          window.SkillLoop.appendEvent({
            module: 'learning-path',
            type: 'diagnosis-completed',
            conceptIds: record.result.priorities,
          });
        }
      } catch {
        announce('Diagnosis ready, but this browser could not save it.');
      }
    }
  }

  async function runDiagnosis(event) {
    event.preventDefault();
    if (state.busy) return;
    hideError();
    const responses = collectResponses();
    if (!responses) {
      announce('Choose one approach for every check.');
      return;
    }
    const found = caseData();
    const questions = activeQuestions();
    if (!found || !questions.length) return;
    const diagnosisCase = { ...found, questions };

    const background = $('lp-background');
    const goal = $('lp-goal');
    state.learner = {
      background: background ? background.value : 'beginner',
      goal: goal ? goal.value : 'internship',
    };
    saveProfile();
    setBusy(true);
    announce('Diagnosis in progress.');

    try {
      let result;
      let source;
      if (state.aiAvailable === false) {
        result = model.buildLocalDiagnosis(diagnosisCase, responses);
        source = 'local';
      } else {
        let response;
        try {
          response = await fetch('/api/learning-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              action: 'diagnose',
              caseId: found.id,
              learner: state.learner,
              responses,
              ...(state.questionSource === 'ai' ? { questions } : {}),
            }),
          });
        } catch {
          throw new Error(
            'The AI service is unreachable. Your answers are still here — please retry.'
          );
        }

        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }

        if (response.status === 503 && payload.code === 'ai-not-configured') {
          state.aiAvailable = false;
          updateAiStatus();
          result = model.buildLocalDiagnosis(diagnosisCase, responses);
          source = 'local';
        } else if (!response.ok) {
          throw new Error(payload.error || 'The AI diagnosis could not be completed.');
        } else {
          result = payload.result;
          source = 'ai';
          const check = model.validateResult(result, diagnosisCase, responses);
          if (!check.ok) {
            throw new Error('The AI returned an invalid diagnosis. Please retry.');
          }
        }
      }

      const record = {
        schemaVersion: 2,
        caseId: found.id,
        questionSource: state.questionSource === 'ai' ? 'ai' : 'authored',
        ...(state.questionSource === 'ai' ? { questions } : {}),
        learner: state.learner,
        responses,
        result,
        source,
        updatedAt: new Date().toISOString(),
      };
      saveRecord(record);
      showResult(record);
      announce(source === 'ai' ? 'AI diagnosis ready.' : 'Sample diagnosis ready.');
    } catch (error) {
      showError(error && error.message ? error.message : 'The diagnosis failed. Please retry.');
      announce('Diagnosis failed. Your answers are still here.');
    } finally {
      setBusy(false);
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function renderResult(record) {
    const host = $('lp-result');
    const found = data.findCase(record.caseId);
    if (!host || !found) return;
    host.textContent = '';

    if (record.source === 'local') {
      const note = node('div', 'lp-source-note');
      note.append(node('strong', '', 'Local sample diagnosis'));
      note.append(
        node(
          'p',
          'sl-small',
          'The live AI service is not configured in this environment. This result follows the authored rubric and is a sample, not an AI judgment.'
        )
      );
      host.append(note);
    } else {
      host.append(
        node(
          'p',
          'sl-small lp-ai-note',
          'Generated by the shared AI service as a planning aid. Verify it against your own work; it is not a grade or a mastery claim.'
        )
      );
    }

    const overall = node('div', 'sl-card lp-overall');
    const levelRow = node('div', 'lp-level-row');
    levelRow.append(
      node('span', 'lp-level lp-level-' + record.result.overall.level, levelLabel(record.result.overall.level))
    );
    levelRow.append(node('span', 'sl-small', 'Overall evidence level · planning aid'));
    overall.append(levelRow);
    overall.append(node('p', 'lp-summary', record.result.overall.summary));
    host.append(overall);

    const dimensions = node('div', 'lp-dimensions');
    record.result.dimensions.forEach((dimension) => {
      const card = node('article', 'sl-card lp-dimension');
      const head = node('div', 'lp-dimension-head');
      const titleWrap = node('div');
      titleWrap.append(node('div', 'sl-kicker', 'Knowledge point'));
      titleWrap.append(node('h3', '', conceptTitle(dimension.conceptId)));
      head.append(titleWrap);
      head.append(
        node('span', 'lp-level lp-level-' + dimension.level, levelLabel(dimension.level))
      );

      const evidence = node('blockquote', 'lp-evidence');
      evidence.append(node('p', '', '“' + dimension.evidence + '”'));
      evidence.append(node('cite', 'sl-small', 'Evidence from your answer'));

      const feedback = node('div', 'lp-feedback-grid');
      const strength = node('div', 'lp-feedback');
      strength.append(node('strong', '', 'What it shows'));
      strength.append(node('p', 'sl-small', dimension.strength));
      const gap = node('div', 'lp-feedback');
      gap.append(node('strong', '', 'What to work on'));
      gap.append(node('p', 'sl-small', dimension.gap));
      feedback.append(strength, gap);

      card.append(head, evidence, feedback);
      dimensions.append(card);
    });
    host.append(dimensions);

    const lower = node('div', 'sl-grid lp-result-grid');
    const priorities = node('div', 'sl-card');
    priorities.append(node('h3', '', 'Priority knowledge points'));
    priorities.append(
      node('p', 'sl-small', 'Use these as the focus for parts 2–4.')
    );
    const priorityList = node('ul', 'lp-priority-list');
    record.result.priorities.forEach((conceptId) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'lp-priority-link';
      link.href =
        '/knowledge-map/concept.html?graph=software-development&topic=' +
        encodeURIComponent(conceptId);
      link.append(node('span', '', conceptTitle(conceptId)));
      link.append(icon('arrow-up-right'));
      item.append(link);
      priorityList.append(item);
    });
    priorities.append(priorityList);

    const steps = node('div', 'sl-card');
    steps.append(node('h3', '', 'Next steps'));
    const stepList = node('ol', 'lp-next-list');
    record.result.nextSteps.forEach((step) => {
      stepList.append(node('li', '', step));
    });
    steps.append(stepList);
    lower.append(priorities, steps);
    host.append(lower);
    refreshIcons();
  }

  function showResult(record) {
    const found = data.findCase(record.caseId);
    if (!found) return;
    const questions =
      Array.isArray(record.questions) && record.questions.length
        ? record.questions
        : found.questions;
    state.caseId = record.caseId;
    state.questions = questions;
    state.questionSource =
      record.questionSource === 'ai' ||
      (Array.isArray(record.questions) && record.questions.length > 0)
        ? 'ai'
        : 'authored';
    state.result = record.result;
    state.source = record.source;
    state.learner = {
      background: record.learner && record.learner.background ? record.learner.background : 'beginner',
      goal: record.learner && record.learner.goal ? record.learner.goal : 'internship',
    };
    state.responses = (record.responses || []).reduce((acc, item) => {
      if (questions.some((question) => question.id === item.questionId)) {
        acc[item.questionId] = {
          optionId: item.optionId,
          explanation: item.explanation || '',
        };
      }
      return acc;
    }, {});

    const background = $('lp-background');
    const goal = $('lp-goal');
    if (background) background.value = state.learner.background;
    if (goal) goal.value = state.learner.goal;

    const caseLine = $('lp-result-case');
    if (caseLine) {
      const date = formatDate(record.updatedAt);
      const checks =
        state.questionSource === 'ai' ? 'AI-written checks' : 'Authored sample checks';
      caseLine.textContent = found.title + ' · ' + checks + (date ? ' · ' + date : '');
    }
    const sourceLabel = $('lp-source-label');
    if (sourceLabel) {
      sourceLabel.textContent =
        record.source === 'ai' ? 'AI diagnosis · live model' : 'Local sample diagnosis';
    }
    renderResult(record);
    setStage('result');
    const section = $('lp-result-step');
    if (section) {
      section.focus({ preventScroll: true });
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function loadProfile() {
    if (!window.SkillLoop) return;
    const profile = window.SkillLoop.read('profile', {}) || {};
    state.learner = {
      background: ['beginner', 'student', 'graduate'].includes(profile.background)
        ? profile.background
        : 'beginner',
      goal: ['internship', 'build'].includes(profile.goal) ? profile.goal : 'internship',
    };
    const background = $('lp-background');
    const goal = $('lp-goal');
    if (background) background.value = state.learner.background;
    if (goal) goal.value = state.learner.goal;
  }

  function restoreSaved() {
    if (!window.SkillLoop) return false;
    const record = window.SkillLoop.read(STORAGE_KEY, {});
    if (!record || ![1, 2].includes(record.schemaVersion)) return false;
    const found = data.findCase(record.caseId);
    if (!found || !record.result) return false;

    let questions = found.questions;
    if (Array.isArray(record.questions)) {
      const questionCheck = model.validateQuestions(record.questions, found);
      if (!questionCheck.ok) return false;
      questions = record.questions;
    } else if (record.questionSource === 'ai') {
      return false;
    }
    const view = { ...found, questions };

    if (!Array.isArray(record.responses) || record.responses.length !== questions.length) {
      return false;
    }
    if (new Set(record.responses.map((item) => item && item.questionId)).size !== questions.length) {
      return false;
    }
    const validResponses = questions.every((question) => {
      const response = record.responses.find((item) => item && item.questionId === question.id);
      return (
        response &&
        question.options.some((option) => option.id === response.optionId) &&
        typeof (response.explanation || '') === 'string'
      );
    });
    if (!validResponses) return false;
    const check = model.validateResult(record.result, view, record.responses);
    if (!check.ok) return false;
    const normalized = {
      ...record,
      questions: record.questions || undefined,
      questionSource:
        record.questionSource === 'ai' || Array.isArray(record.questions)
          ? 'ai'
          : 'authored',
      source: record.source === 'ai' ? 'ai' : 'local',
    };
    showResult(normalized);
    return true;
  }

  function clearSaved() {
    if (!window.SkillLoop) return;
    try {
      window.SkillLoop.write(STORAGE_KEY, null);
    } catch {
      /* Ignore blocked storage. */
    }
  }

  function focusAndScroll(id) {
    const element = $(id);
    if (!element) return;
    element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindEvents() {
    const grid = $('lp-case-grid');
    if (grid) {
      grid.addEventListener('click', (event) => {
        const card = event.target.closest('.lp-case-card');
        if (card) selectCase(card.dataset.caseId);
      });
    }
    const start = $('lp-start');
    if (start) start.addEventListener('click', () => openDiagnosis());

    const back = $('lp-back-to-cases');
    if (back) {
      back.addEventListener('click', () => {
        state.questionRequest += 1;
        state.questionsLoading = false;
        updateRunState();
        setStage('cases');
        focusAndScroll('lp-case-heading');
      });
    }

    const form = $('lp-diagnosis-form');
    if (form) form.addEventListener('submit', runDiagnosis);

    const questions = $('lp-question-list');
    if (questions) {
      questions.addEventListener('change', (event) => {
        if (!event.target.matches('input[type="radio"]')) return;
        const questionId = event.target.name;
        const textarea = questions.querySelector(
          'textarea[data-question-id="' + questionId + '"]'
        );
        state.responses[questionId] = {
          optionId: event.target.value,
          explanation: textarea ? textarea.value : '',
        };
        hideError();
      });
      questions.addEventListener('input', (event) => {
        if (!event.target.matches('textarea[data-question-id]')) return;
        const questionId = event.target.dataset.questionId;
        state.responses[questionId] = {
          ...(state.responses[questionId] || {}),
          explanation: event.target.value,
        };
        const counter = questions.querySelector('[data-counter-for="' + questionId + '"]');
        if (counter) {
          counter.textContent = event.target.value.length + '/' + MAX_EXPLANATION;
        }
      });
    }

    const retake = $('lp-retake');
    if (retake) retake.addEventListener('click', () => openDiagnosis());

    const newCase = $('lp-new-case');
    if (newCase) {
      newCase.addEventListener('click', () => {
        state.caseId = null;
        state.questions = [];
        state.questionSource = null;
        state.questionRequest += 1;
        state.questionsLoading = false;
        state.responses = {};
        state.result = null;
        state.source = null;
        clearSaved();
        renderCases();
        setStage('cases');
        focusAndScroll('lp-case-heading');
      });
    }

    ['lp-background', 'lp-goal'].forEach((id) => {
      const select = $(id);
      if (!select) return;
      select.addEventListener('change', () => {
        state.learner = {
          background: $('lp-background') ? $('lp-background').value : 'beginner',
          goal: $('lp-goal') ? $('lp-goal').value : 'internship',
        };
        saveProfile();
      });
    });
  }

  function init() {
    if (!data || !model) {
      const live = $('lp-live');
      if (live) live.textContent = 'The diagnosis data could not be loaded.';
      return;
    }
    loadProfile();
    const restored = restoreSaved();
    renderCases();
    if (!restored) setStage('cases');
    bindEvents();
    checkAvailability();
    refreshIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
