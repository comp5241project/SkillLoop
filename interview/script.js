/** Conversation view. Decisions, AI feedback and student revisions remain distinct. */
(function () {
  const app = window.SkillLoop;
  const story = window.SkillLoopStory;
  const legacyModel = window.SkillLoopInterviewModel;
  const $ = (selector) => document.querySelector(selector);
  const state = story.restore(app.read('interviewStory', {}));
  const context = legacyModel.contextFromSearch(location.search);
  let session = null;
  let available = false;
  let busy = false;
  let storage = true;
  let retryAction = null;
  let assisted = false;
  try {
    localStorage.setItem('skillloop.story.check', '1');
    localStorage.removeItem('skillloop.story.check');
  } catch (_) {
    storage = false;
  }
  const node = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const icon = (name) => {
    const item = node('i');
    item.dataset.lucide = name;
    item.setAttribute('aria-hidden', 'true');
    return item;
  };
  function button(text, action, className = 'iv-text-button', symbol) {
    const item = node('button', className, text);
    item.type = 'button';
    if (symbol) item.append(icon(symbol));
    item.addEventListener('click', action);
    return item;
  }
  function sourceLabel(title) {
    const label = node('div', 'iv-source-label');
    label.append(icon('sparkles'), node('span', '', title));
    return label;
  }
  function sourceBlock(target, title) {
    target.classList.add('iv-ai-block');
    target.classList.toggle('is-sample', session.mode !== 'ai');
    target.replaceChildren(sourceLabel(title));
    if (session.mode !== 'ai')
      target.append(node('p', 'iv-sample-note', '(Sample — API not connected yet)'));
  }
  function save() {
    app.write('interviewStory', state);
  }
  function announce(text) {
    $('#iv-status').textContent = text;
  }
  function mode() {
    const live = session ? session.mode === 'ai' : available;
    $('#iv-mode').textContent = live ? 'Live AI' : 'Demo';
    $('#iv-mode').classList.toggle('is-live', live);
    $('#iv-save-status').hidden = storage;
    $('#iv-save-status').textContent = storage ? '' : 'Saved for this visit only';
  }
  function setBusy(value, label) {
    busy = value;
    for (const item of document.querySelectorAll('#interview-app :is(button, textarea, select)'))
      item.disabled = value;
    $('#iv-thinking').hidden = !value;
    $('#iv-scene').setAttribute('aria-busy', String(value));
    if (label) announce(label);
  }
  function show(view, focus = false) {
    $('#iv-room').hidden = view !== 'room';
    $('#iv-review').hidden = view !== 'review';
    document.body.classList.toggle('iv-in-review', view === 'review');
    if (session) {
      state.lastSessionId = session.id;
      state.lastView = view;
      save();
    }
    if (focus) {
      const heading = view === 'room' ? $('#iv-question') : $('#iv-review-title');
      heading.focus({ preventScroll: true });
      $('#main-content').scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    mode();
    app.icons();
  }
  function sameContext(record) {
    return (
      (!context.conceptId || record.context.conceptId === context.conceptId) &&
      ['courseId', 'activityId', 'graphId', 'publicationVersion'].every(
        (key) => (record.context[key] || '') === (context[key] || '')
      )
    );
  }
  async function home(resumeLast = false) {
    session = null;
    retryAction = null;
    const previous = state.sessions.find((s) => s.id === state.lastSessionId && sameContext(s));
    if (resumeLast && state.lastView === 'review' && previous?.status === 'completed')
      return open(previous);
    const pending = state.sessions.find((s) => s.status === 'active' && sameContext(s));
    if (pending) return open(pending);
    const topic =
      story.topics.find((t) => t.conceptId === context.conceptId) ||
      story.topic(state.sessions[0]?.topicId);
    return start(topic.id);
  }
  async function ask(action, index) {
    const cleanSession = JSON.parse(JSON.stringify(session));
    cleanSession.review = null;
    cleanSession.suggestions = {};
    cleanSession.comparisons = {};
    cleanSession.revisionDrafts = {};
    for (const turn of cleanSession.turns)
      turn.revisions = action === 'compare' ? turn.revisions.slice(-1) : [];
    const response = await fetch('/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, session: cleanSession, index }),
      signal: AbortSignal.timeout(42000),
    });
    let body;
    try {
      body = await response.json();
    } catch (_) {
      throw new Error('The AI connection is unavailable. Your conversation is saved.');
    }
    if (!response.ok || body.source !== 'ai')
      throw new Error(body.error || 'The AI connection is unavailable. Please retry.');
    return body.result;
  }
  async function start(topicId) {
    if (busy) return;
    $('#iv-scenarios').close();
    const profile = app.read('profile', {}) || {};
    const learnerLevel = ['beginner', 'student', 'graduate'].includes(profile.background)
      ? profile.background
      : 'beginner';
    const conceptId =
      context.conceptId && !story.topics.some((t) => t.conceptId === context.conceptId)
        ? context.conceptId
        : story.topic(topicId).conceptId;
    session = story.create(topicId, available ? 'ai' : 'demo', {
      ...context,
      learnerLevel,
      conceptId,
    });
    state.sessions.unshift(session);
    state.sessions = state.sessions.slice(0, 30);
    save();
    $('#iv-scenario-open').replaceChildren(
      document.createTextNode(story.topic(topicId).title),
      icon('chevron-down')
    );
    app.appendEvent({
      module: 'interview',
      type: 'conversation-started',
      sessionId: session.id,
      conceptId: session.context.conceptId,
    });
    await next();
  }
  async function open(record) {
    session = record;
    $('#iv-history').close();
    $('#iv-scenario-open').replaceChildren(
      document.createTextNode(story.topic(record.topicId).title),
      icon('chevron-down')
    );
    if (record.status === 'completed') await review();
    else if (record.current) renderTurn(true);
    else await next();
  }
  function renderTurn(focus = false) {
    const turn = session.current;
    $('#iv-error').hidden = true;
    $('#iv-exit').hidden = false;
    $('#iv-log-open').hidden = !session.turns.length;
    $('#iv-ack').textContent = turn.acknowledgement;
    $('#iv-feedback').hidden = !turn.feedback?.observation;
    $('#iv-feedback').classList.toggle('is-sample', session.mode !== 'ai');
    $('#iv-feedback-source').textContent = 'AI feedback';
    $('#iv-feedback-sample').hidden = session.mode === 'ai';
    $('#iv-feedback-observation').textContent = turn.feedback?.observation || '';
    $('#iv-feedback-suggestion').textContent = turn.feedback?.suggestion
      ? 'Try: ' + turn.feedback.suggestion
      : '';
    $('#iv-question').textContent = turn.question;
    $('#iv-last-answer').hidden = !session.turns.length;
    $('#iv-last-answer').textContent = session.turns.length
      ? 'You: ' + session.turns.at(-1).answer
      : '';
    $('#iv-choice-label').textContent = 'Reply starters';
    $('#iv-choices').hidden = false;
    $('#iv-choices').replaceChildren();
    turn.choices.forEach((choice, index) =>
      $('#iv-choices').append(
        button(
          choice,
          () => {
            const combined = session.draft.trim()
              ? session.draft.trimEnd() + '\n' + choice
              : choice;
            if (combined.length > 1500) {
              $('#iv-ideas-status').textContent =
                'This idea would exceed 1,500 characters. Shorten your reply first.';
              return;
            }
            session.draft = combined;
            session.draftIdea = { index, text: choice };
            session.updatedAt = new Date().toISOString();
            save();
            $('#iv-answer').value = combined;
            $('#iv-ideas').close();
            $('#iv-answer').focus();
            $('#iv-answer').setCustomValidity('');
            announce('Idea added. Edit it before sending your reply.');
          },
          'iv-choice',
          'corner-down-left'
        )
      )
    );
    $('#iv-compose').hidden = false;
    $('#iv-choices').hidden = false;
    $('#iv-own-answer').hidden = false;
    $('#iv-answer').value = session.draft;
    show('room', focus);
  }
  async function next() {
    $('#iv-compose').hidden = true;
    $('#iv-own-answer').hidden = true;
    $('#iv-feedback').hidden = true;
    $('#iv-choices').replaceChildren();
    $('#iv-choice-label').textContent = '';
    $('#iv-ack').textContent = '';
    $('#iv-question').textContent = session.turns.length
      ? 'Let me think about that…'
      : 'Preparing your question…';
    $('#iv-error').hidden = true;
    $('#iv-exit').hidden = false;
    $('#iv-log-open').hidden = !session.turns.length;
    $('#iv-last-answer').hidden = !session.turns.length;
    $('#iv-last-answer').textContent = session.turns.length
      ? 'You: ' + session.turns.at(-1).answer
      : '';
    show('room', true);
    setBusy(true, 'Maya is preparing a reply.');
    try {
      const turn = session.mode === 'ai' ? await ask('turn') : story.demoTurn(session);
      story.accept(session, turn);
      save();
      setBusy(false);
      if (session.status === 'completed') await review();
      else renderTurn(true);
    } catch (error) {
      setBusy(false);
      $('#iv-thinking').hidden = true;
      $('#iv-question').textContent = 'Couldn’t load the next question.';
      $('#iv-error-text').textContent = error.message;
      $('#iv-error').hidden = false;
      retryAction = next;
    }
  }
  async function reply(text, choiceIndex = null) {
    if (busy) return;
    $('#iv-ideas').close();
    try {
      story.answer(session, text, choiceIndex);
    } catch (error) {
      announce(error.message);
      return;
    }
    save();
    await next();
  }
  function renderTranscript(target, records = session.turns) {
    target.replaceChildren();
    records.forEach((turn, index) => {
      const item = node('article', 'iv-turn-record');
      if (turn.acknowledgement) item.append(node('p', 'iv-small', 'Maya: ' + turn.acknowledgement));
      item.append(
        node('h3', '', index + 1 + '. Maya: ' + turn.question),
        node('p', '', 'You: ' + turn.answer)
      );
      if (turn.feedback) {
        const feedback = node('div', 'iv-turn-feedback');
        sourceBlock(feedback, 'AI feedback');
        feedback.append(
          node('p', '', turn.feedback.observation),
          node('p', '', 'Try: ' + turn.feedback.suggestion)
        );
        item.append(feedback);
      }
      for (const [version, revision] of turn.revisions.entries())
        item.append(
          node(
            'p',
            'iv-turn-revision',
            'Revision ' +
              (version + 1) +
              (revision.assisted ? ' · AI-assisted draft' : '') +
              ': ' +
              revision.text
          )
        );
      target.append(item);
    });
    app.icons();
  }
  async function review() {
    $('#iv-error').hidden = true;
    $('#iv-review-summary').hidden = false;
    $('#iv-review-summary').textContent = session.review?.summary || 'Preparing your review…';
    $('#iv-highlights').replaceChildren();
    $('#iv-next-practice').textContent = '';
    $('#iv-review-retry').hidden = true;
    $('#iv-feedback-title').textContent = 'AI review';
    $('#iv-review-feedback').classList.toggle('is-sample', session.mode !== 'ai');
    $('#iv-review-source').hidden = session.mode === 'ai';
    $('#iv-review-source').textContent = '(Sample — API not connected yet)';
    $('#iv-lesson').href =
      legacyModel.safeReturnPath(session.context.returnTo) ||
      '../knowledge-map/?topic=' + encodeURIComponent(session.context.conceptId);
    const select = $('#iv-improve-select');
    select.replaceChildren();
    session.turns.forEach((turn, index) => {
      const option = node('option', '', 'Answer ' + (index + 1));
      option.value = index;
      select.append(option);
    });
    select.value = String(session.review?.highlights.find((h) => h.kind === 'improve')?.turn || 0);
    renderEditor();
    renderTranscript($('#iv-transcript'));
    $('#iv-transcript-count').textContent = session.turns.length + ' replies';
    $('#iv-transcript').parentElement.open = false;
    show('review', true);
    if (!session.review) {
      setBusy(true, 'Preparing your review.');
      try {
        const result = session.mode === 'ai' ? await ask('review') : story.demoReview(session);
        if (!story.validReview(result, session.turns))
          throw new Error('The review could not be linked to your answers. Please retry.');
        session.review = result;
        session.updatedAt = new Date().toISOString();
        save();
        select.value = String(result.highlights.find((item) => item.kind === 'improve')?.turn || 0);
        renderEditor();
      } catch (error) {
        $('#iv-review-summary').textContent = error.message;
        $('#iv-review-retry').hidden = false;
      } finally {
        setBusy(false);
      }
    }
    renderFeedback();
    app.icons();
  }
  function renderFeedback() {
    if (!session.review) return;
    $('#iv-review-summary').hidden = session.mode !== 'ai';
    $('#iv-review-summary').textContent = session.review.summary;
    $('#iv-next-practice').textContent = session.review.nextStep;
    const target = $('#iv-highlights');
    target.replaceChildren();
    for (const item of session.review.highlights) {
      const card = node('article', 'iv-highlight');
      const heading = node('div', 'iv-highlight-head');
      heading.append(
        icon(item.kind === 'strength' ? 'circle-check' : 'pencil-line'),
        node('h3', '', item.title)
      );
      card.append(
        heading,
        node('blockquote', '', '“' + item.quote + '”'),
        node('p', '', item.advice),
        button(
          'Edit answer ' + (item.turn + 1),
          () => {
            $('#iv-improve-select').value = item.turn;
            renderEditor();
            $('#iv-revision').focus();
          },
          'iv-text-button',
          'arrow-up-right'
        )
      );
      target.append(card);
    }
    app.icons();
  }
  function renderEditor() {
    const index = Number($('#iv-improve-select').value);
    const turn = session.turns[index];
    const draft = session.revisionDrafts[index];
    assisted = draft?.assisted ?? turn.revisions.at(-1)?.assisted ?? false;
    $('#iv-original').textContent = 'Original: ' + turn.answer;
    $('#iv-revision').value = draft?.text ?? turn.revisions.at(-1)?.text ?? turn.answer;
    $('#iv-suggestion').hidden = true;
    $('#iv-suggestion').replaceChildren();
    $('#iv-suggest').hidden = false;
    $('#iv-improve-status').textContent = '';
    $('#iv-suggest').replaceChildren(icon('sparkles'), document.createTextNode('AI rewrite'));
    $('#iv-compare').hidden = !turn.revisions.length || session.mode !== 'ai';
    $('#iv-comparison').hidden = true;
    if (session.comparisons[index] && !draft) showComparison(session.comparisons[index]);
    if (draft) $('#iv-compare').hidden = true;
    app.icons();
  }
  function showSuggestion(result) {
    const target = $('#iv-suggestion');
    sourceBlock(target, 'AI rewrite');
    target.hidden = false;
    $('#iv-suggest').hidden = true;
    const reason = node('details', 'iv-why');
    reason.append(node('summary', '', 'Why'), node('p', '', result.reason));
    target.append(
      node('p', '', result.suggestion),
      reason,
      button(
        'Use this draft',
        () => {
          $('#iv-revision').value = result.suggestion;
          assisted = true;
          saveRevisionDraft();
          target.hidden = true;
          $('#iv-suggest').hidden = false;
          $('#iv-revision').focus();
        },
        'iv-text-button',
        'pencil-line'
      )
    );
    app.icons();
  }
  async function suggest() {
    const index = Number($('#iv-improve-select').value);
    if (session.suggestions[index]) return showSuggestion(session.suggestions[index]);
    setBusy(true, 'Preparing an example response.');
    $('#iv-improve-status').textContent = 'Preparing an example…';
    try {
      const result =
        session.mode === 'ai'
          ? await ask('rewrite', index)
          : {
              suggestion: story.topic(session.topicId).example,
              reason: story.topic(session.topicId).nextStep,
            };
      session.suggestions[index] = result;
      save();
      showSuggestion(result);
      $('#iv-improve-status').textContent = '';
    } catch (error) {
      $('#iv-improve-status').textContent = error.message;
    } finally {
      setBusy(false);
    }
  }
  function showComparison(result) {
    const target = $('#iv-comparison');
    sourceBlock(target, 'AI comparison');
    target.append(node('p', '', result.improved), node('p', '', 'Next: ' + result.nextStep));
    target.hidden = false;
    app.icons();
  }
  async function compare() {
    const index = Number($('#iv-improve-select').value);
    if (session.comparisons[index]) return showComparison(session.comparisons[index]);
    setBusy(true, 'Comparing your two versions.');
    $('#iv-improve-status').textContent = 'Comparing versions…';
    try {
      const result = await ask('compare', index);
      session.comparisons[index] = result;
      save();
      showComparison(result);
      $('#iv-improve-status').textContent = '';
    } catch (error) {
      $('#iv-improve-status').textContent = error.message;
    } finally {
      setBusy(false);
    }
  }
  function history() {
    $('#iv-history-summary').textContent = state.sessions.length
      ? storage
        ? 'Saved in this browser'
        : 'Saved for this visit only'
      : 'No interviews yet.';
    const list = $('#iv-history-list');
    list.replaceChildren();
    for (const record of [...state.sessions].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    )) {
      const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(
        new Date(record.updatedAt)
      );
      const item = button('', () => open(record), 'iv-history-item');
      const copy = node('span', '', story.topic(record.topicId).title);
      copy.append(
        node(
          'small',
          '',
          date +
            ' · ' +
            record.turns.length +
            ' replies · ' +
            (record.mode === 'ai' ? 'AI conversation' : 'Demo')
        )
      );
      item.append(
        icon(record.status === 'completed' ? 'notebook-pen' : 'message-circle'),
        copy,
        node('small', '', record.status === 'completed' ? 'Review' : 'Continue')
      );
      list.append(item);
    }
    const legacy = legacyModel.restore(app.read('interviewStudio', {})).sessions;
    $('#iv-legacy').hidden = !legacy.length;
    const oldList = $('#iv-legacy-list');
    oldList.replaceChildren();
    for (const record of legacy) {
      const entry = node('details');
      entry.append(node('summary', '', record.activity.title));
      for (const answer of record.answers) {
        const text = node('div', 'iv-turn-record');
        text.append(node('h3', '', answer.question), node('p', '', answer.original));
        for (const r of answer.revisions) text.append(node('p', 'iv-turn-revision', r.text));
        entry.append(text);
      }
      if (record.draft) entry.append(node('p', 'iv-small', 'Saved draft: ' + record.draft));
      oldList.append(entry);
    }
    $('#iv-history').showModal();
    app.icons();
  }
  $('#iv-history-open').addEventListener('click', history);
  $('#iv-history-close').addEventListener('click', () => $('#iv-history').close());
  $('#iv-log-close').addEventListener('click', () => $('#iv-log').close());
  $('#iv-log-open').addEventListener('click', () => {
    renderTranscript($('#iv-log-list'));
    $('#iv-log').showModal();
  });
  $('#iv-exit').addEventListener('click', () => {
    save();
    location.href = '../index.html';
  });
  $('#iv-home').addEventListener('click', () => {
    save();
    location.href = '../index.html';
  });
  $('#iv-again').addEventListener('click', () => $('#iv-scenarios').showModal());
  $('#iv-scenario-open').addEventListener('click', () => $('#iv-scenarios').showModal());
  $('#iv-scenarios-close').addEventListener('click', () => $('#iv-scenarios').close());
  for (const topic of story.topics)
    $('#iv-scenario-list').append(
      button(topic.title, () => start(topic.id), 'iv-choice', topic.icon)
    );
  $('#iv-retry').addEventListener('click', () => retryAction?.());
  $('#iv-review-retry').addEventListener('click', review);
  $('#iv-own-answer').addEventListener('click', () => {
    $('#iv-ideas-status').textContent = '';
    $('#iv-ideas').showModal();
    app.icons();
  });
  $('#iv-ideas-close').addEventListener('click', () => $('#iv-ideas').close());
  $('#iv-answer').addEventListener('input', () => {
    session.draft = $('#iv-answer').value;
    session.updatedAt = new Date().toISOString();
    save();
    $('#iv-answer').setCustomValidity('');
  });
  $('#iv-answer').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      event.preventDefault();
      $('#iv-compose').requestSubmit();
    }
  });
  $('#iv-compose').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('#iv-answer').value;
    if (!text.trim()) {
      $('#iv-answer').setCustomValidity('Write what you would say.');
      $('#iv-answer').reportValidity();
      return;
    }
    reply(text, session.draftIdea?.text === text.trim() ? session.draftIdea.index : null);
  });
  $('#iv-improve-select').addEventListener('change', renderEditor);
  $('#iv-suggest').addEventListener('click', suggest);
  $('#iv-compare').addEventListener('click', compare);
  function saveRevisionDraft() {
    const index = Number($('#iv-improve-select').value);
    session.revisionDrafts[index] = { text: $('#iv-revision').value, assisted };
    session.updatedAt = new Date().toISOString();
    save();
    $('#iv-compare').hidden = true;
    $('#iv-comparison').hidden = true;
    $('#iv-improve-status').textContent = storage ? 'Draft saved' : 'Draft kept for this visit.';
  }
  $('#iv-revision').addEventListener('input', saveRevisionDraft);
  $('#iv-revise-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const index = Number($('#iv-improve-select').value);
    try {
      const changed = story.revise(session, index, $('#iv-revision').value);
      if (changed) {
        session.turns[index].revisions.at(-1).assisted = assisted;
        save();
        renderTranscript($('#iv-transcript'));
      }
      $('#iv-improve-status').textContent = changed ? 'Rewrite saved' : 'No changes to save';
      $('#iv-compare').hidden = !session.turns[index].revisions.length || session.mode !== 'ai';
      $('#iv-comparison').hidden = true;
    } catch (error) {
      $('#iv-improve-status').textContent = error.message;
    }
  });
  $('#iv-export').addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
    );
    const link = node('a');
    link.href = url;
    link.download = session.id + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  app.icons();
  if (location.protocol === 'file:') {
    home(true);
    return;
  }
  setBusy(true);
  fetch('/api/interview', { signal: AbortSignal.timeout(5000) })
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((result) => {
      available = result.available === true;
    })
    .catch(() => {})
    .finally(() => {
      setBusy(false);
      home(true);
    });
})();
