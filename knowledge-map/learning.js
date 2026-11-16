(function () {
  if (new URLSearchParams(location.search).get('journey') === '1') return;
  const samples = window.SkillLoopSamples;
  const contract = window.SkillLoopLearningContract;
  const content = window.SkillLoopLearningContent;
  const feedback = window.SkillLoopLearningFeedback;
  const part1 = window.SkillLoopPart1Adapter;
  const part1Data = window.LearningPathDiagnosisData;
  const catalog = part1.catalog(samples.topics, part1Data);
  const store = window.SkillLoop;
  const flow = window.SkillLoopFlow;
  const progressKey = 'learningProgress';
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const topics = new Map(samples.topics.map((item) => [item.topicId, item.title]));
  const picker = $('sample-case');
  const modePicker = $('learning-mode-select');
  let session;

  for (const [id, item] of Object.entries(samples.cases)) {
    const option = el('option', item.title);
    option.value = id;
    picker.append(option);
  }

  function showError(message) {
    $('learning-session').hidden = true;
    $('learning-error').hidden = false;
    $('learning-error-message').textContent = message;
    $('open-sample-mode').hidden = false;
  }

  function matchesAttempt(value, { record }) {
    return !!record && value?.caseId === record.caseId && value.diagnosisUpdatedAt === record.updatedAt;
  }

  function isCurrent(current) {
    if (session !== current) return false;
    if (!current.record) return true;
    const latest = store.read('learningPathDiagnosis', null);
    if (latest?.caseId === current.record.caseId && latest.updatedAt === current.record.updatedAt) return true;
    session = null;
    $('learning-mode').textContent = 'Diagnosis changed';
    showError('Your diagnosis changed. Reload Case learning to open the latest attempt.');
    return false;
  }

  function readCourse(current) {
    if (!current.record) return null;
    const saved = store.read(progressKey, null);
    if (!matchesAttempt(saved, current) || typeof saved.id !== 'string') return null;
    if (saved.source === 'authored-fallback' && saved.lessons === null) return saved;
    if (saved.source === 'ai-generated' && contract.validLessons(saved.lessons, current.selected)) return saved;
    return null;
  }

  function writeCourse(current) {
    if (!current.record || !isCurrent(current)) return;
    const { record, course, entries, reflection } = current;
    store.write(progressKey, {
      caseId: record.caseId, diagnosisUpdatedAt: record.updatedAt, ...course,
      entries: Object.fromEntries(entries), reflection,
    });
  }

  function resetSummary() {
    $('continue-dialogue').hidden = true;
    $('handoff-status').textContent = '';
    $('learning-summary').hidden = true;
    $('learning-output').textContent = '';
    $('ai-reflection').textContent = '';
    $('reflection-retry').hidden = true;
  }

  function start(input, { record = null, mode = 'api' } = {}) {
    session = null;
    resetSummary();
    $('learning-cards').replaceChildren();
    $('learning-card-navigation').hidden = true;
    $('course-actions').hidden = true;
    if (!contract.validInput(input, catalog)) {
      showError('The Part 1 diagnosis is incomplete or invalid. Return to Diagnosis to complete it.');
      return;
    }
    const { case: currentCase, result } = input;
    const selected = result.priorities;
    const current = { input, record, selected, mode, course: null, entries: new Map(), pending: new Set(), reflection: null, reflecting: false, generating: false };
    session = current;
    $('learning-error').hidden = true;
    $('learning-session').hidden = false;
    $('case-title').textContent = currentCase.title;
    $('case-scenario').textContent = currentCase.summary;
    $('assessment-summary').textContent = result.overall.summary;
    $('weak-topics').replaceChildren(...selected.map((id) => {
      const link = el('a', topics.get(id), 'learning-tag');
      link.href = '#topic-' + id;
      return link;
    }));

    if (!record) {
      openCourse(current, { source: 'standalone', lessons: null });
      return;
    }
    const saved = readCourse(current);
    if (saved) {
      openCourse(current, saved);
      return;
    }
    renderSummary(current);
    generateCourse(current);
  }

  async function generateCourse(current) {
    if (!isCurrent(current) || current.generating || current.course) return;
    current.generating = true;
    $('course-actions').hidden = true;
    $('learning-mode').textContent = 'AI course';
    $('learning-intro').textContent = 'Generating lessons for your priority topics…';
    try {
      const result = await feedback.generateLessons(current.input);
      if (!isCurrent(current)) return;
      if (result?.aiSource !== 'api' || !contract.validLessons(result.lessons, current.selected)) {
        throw new Error('The course did not match your priority topics.');
      }
      const saved = readCourse(current);
      openCourse(current, saved || { id: crypto.randomUUID(), source: 'ai-generated', lessons: result.lessons }, !saved);
    } catch (error) {
      if (!isCurrent(current)) return;
      const saved = readCourse(current);
      if (saved) {
        openCourse(current, saved);
        return;
      }
      $('learning-intro').textContent = 'Could not generate your course. ' + error.message;
      $('course-actions').hidden = false;
    } finally {
      current.generating = false;
    }
  }

  function openCourse(current, saved, persist = false) {
    const { id, source, lessons } = saved;
    const byTopic = lessons
      ? Object.fromEntries(lessons.map((lesson) => [lesson.topicId, {
        explanation: lesson.explanation, example: lesson.example,
        exercise: { kind: 'text', prompt: lesson.prompt }, generated: lesson,
      }]))
      : content[current.input.case.caseId];
    if (current.selected.some((topicId) => !byTopic?.[topicId])) {
      showError('A practice card is missing for this diagnosis.');
      return;
    }
    current.course = { id, source, lessons };
    if (source === 'authored-fallback') current.mode = 'sample';
    for (const topicId of current.selected) {
      const entry = saved.entries?.[topicId];
      if (typeof entry?.answer === 'string' && entry.answer.length <= 800 &&
          (entry.result === null || contract.validFeedback(entry.result, current.mode))) {
        current.entries.set(topicId, entry);
      }
    }
    if (contract.validReflection(saved.reflection, current.selected)) current.reflection = saved.reflection;
    if (persist) writeCourse(current);
    $('course-actions').hidden = true;
    $('learning-mode').textContent = {
      'ai-generated': 'AI-generated course',
      'authored-fallback': 'Prewritten practice · Local feedback',
      standalone: current.mode === 'api' ? 'Standalone practice · Live AI feedback' : 'Standalone Sample mode',
    }[source];
    $('learning-intro').textContent = 'Choose a priority topic or work through the cards in order.';
    $('learning-cards').replaceChildren(...current.selected.map((topicId) => card(current, topicId, byTopic[topicId])));
    store.icons();
    $('learning-card-navigation').hidden = current.selected.length < 2;
    showCard(current);
    renderSummary(current);
  }

  function showCard(current) {
    const requested = current.selected.findIndex((id) => location.hash === '#topic-' + id);
    const index = Math.max(0, requested);
    current.cardIndex = index;
    const cards = $('learning-cards').children;
    for (const [position, link] of [...$('weak-topics').children].entries()) {
      cards[position].inert = position !== index;
      if (position === index) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    $('learning-card-position').textContent = `${index + 1} of ${cards.length}`;
    $('learning-previous').hidden = index === 0;
    $('learning-next').hidden = index === cards.length - 1;
  }

  function selectCard(hash) {
    // Keep the topic in the URL without triggering the browser's anchor scroll.
    if (location.hash !== hash) history.pushState(null, '', hash);
    if (session?.course) showCard(session);
  }

  function moveCard(offset) {
    const id = session?.selected[session.cardIndex + offset];
    if (id) selectCard('#topic-' + id);
  }

  function renderFeedback(article, response, result) {
    article.dataset.complete = 'true';
    const verdict = result.judgment[0].toUpperCase() + result.judgment.slice(1);
    const explanation = result.aiSource === 'sample' ? result.message : result.explanation;
    response.replaceChildren(el('strong', verdict, 'learning-verdict'), el('p', explanation));
    if (result.followUp) {
      const followUp = el('p', undefined, 'learning-follow-up');
      followUp.append(el('strong', 'Follow-up'), document.createTextNode(' ' + result.followUp));
      response.append(followUp);
    }
  }

  function card(current, topicId, lesson) {
    const { input } = current;
    const article = el('article', undefined, 'learning-card');
    article.id = 'topic-' + topicId;
    article.append(el('h3', topics.get(topicId)), el('p', lesson.explanation),
      el('h4', 'In this case'), el('p', lesson.example));
    const dimension = input.result.dimensions.find((item) => item.conceptId === topicId);
    const evidence = el('details');
    evidence.append(el('summary', 'Diagnosis evidence'), el('p', `Gap: ${dimension.gap}`),
      el('p', `Strength: ${dimension.strength}`), el('p', `Evidence: ${dimension.evidence}`));
    article.append(evidence);
    const details = el('details');
    details.append(el('summary', 'View starter code'), el('pre', input.case.starterCode));
    article.append(details);
    const form = el('form');
    const fieldset = el('fieldset');
    fieldset.append(el('legend', lesson.exercise.prompt));
    const saved = current.entries.get(topicId);
    let answer;
    if (lesson.exercise.kind === 'choice') {
      lesson.exercise.options.forEach((option, index) => {
        const label = el('label');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'answer-' + topicId;
        radio.value = String(index);
        radio.checked = saved?.answer === radio.value;
        label.append(radio, document.createTextNode(' ' + option));
        fieldset.append(label);
      });
      answer = () => form.querySelector('input:checked')?.value;
    } else {
      const field = el('textarea');
      field.setAttribute('aria-label', lesson.exercise.prompt);
      field.maxLength = 800;
      field.value = saved?.answer || '';
      fieldset.append(field);
      answer = () => field.value.trim();
    }
    const button = el('button', undefined, 'sl-btn sl-btn-main learning-check-answer');
    button.type = 'submit';
    const bot = el('i');
    bot.setAttribute('data-lucide', 'bot');
    bot.setAttribute('aria-hidden', 'true');
    button.append(bot, document.createTextNode('Check answer'));
    const response = el('div', undefined, 'learning-feedback');
    response.setAttribute('role', 'status');
    form.append(fieldset, button, response);
    article.append(form);
    if (saved?.result) renderFeedback(article, response, saved.result);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = answer();
      if (!value) {
        response.textContent = 'Answer the question before checking.';
        return;
      }
      checkAnswer(current, topicId, lesson, value, button, article, response);
    });
    return article;
  }

  // If another tab finished preparing a course, use its saved version.
  // If it updated the same course, merge completed attempts before writing.
  function refreshCourse(current) {
    if (!isCurrent(current)) return false;
    const saved = readCourse(current);
    if (!saved) return true;
    if (saved.id !== current.course.id) {
      start(current.input, { record: current.record });
      return false;
    }
    for (const id of current.selected) {
      const entry = saved.entries?.[id];
      if (typeof entry?.answer === 'string' && entry.answer.length <= 800 && contract.validFeedback(entry.result, current.mode)) {
        current.entries.set(id, entry);
      }
    }
    return true;
  }

  async function checkAnswer(current, topicId, lesson, answer, button, article, response) {
    if (current.pending.has(topicId) || current.reflecting || !refreshCourse(current)) return;
    current.pending.add(topicId);
    button.disabled = true;
    response.textContent = 'Checking…';
    if (!current.entries.get(topicId)?.result) {
      current.entries.set(topicId, { answer, result: null });
      writeCourse(current);
    }
    try {
      const result = await feedback.evaluate({
        topicId, exercise: lesson.exercise, answer, input: current.input, mode: current.mode, lesson: lesson.generated,
        authored: current.course.source === 'authored-fallback',
      });
      if (!refreshCourse(current)) return;
      if (!contract.validFeedback(result, current.mode)) throw new Error('Invalid feedback.');
      if (current.record) flow.clearLearning(store, current.record.caseId);
      current.entries.set(topicId, { answer, result });
      current.reflection = null;
      $('ai-reflection').textContent = '';
      $('reflection-retry').hidden = true;
      writeCourse(current);
      renderFeedback(article, response, result);
    } catch (error) {
      if (isCurrent(current)) response.textContent = `Feedback unavailable: ${error.message} Your answer is still here; try again.`;
    } finally {
      current.pending.delete(topicId);
      if (isCurrent(current)) {
        button.disabled = false;
        renderSummary(current);
      }
    }
  }

  function redactAnswer(text, answer) {
    return answer.length >= 12 ? text.replaceAll(answer, '[answer omitted]') : text;
  }

  function handoffResults(current) {
    return new Map([...current.entries].filter(([, entry]) => entry.result).map(([topicId, { answer, result }]) => [
      topicId,
      current.mode === 'api' ? {
        ...result,
        explanation: redactAnswer(result.explanation, answer),
        practiceFocus: redactAnswer(result.practiceFocus, answer).slice(0, 300),
      } : result,
    ]));
  }

  function showRecord(current, output, saved) {
    const { caseId } = output;
    $('learning-output').textContent = JSON.stringify(output, null, 2);
    $('continue-dialogue').hidden = !saved || !Object.hasOwn(samples.cases, caseId);
    $('continue-dialogue').href = '/interview/?flow=1&case=' + encodeURIComponent(caseId);
    $('handoff-status').textContent = !current.record ? 'Standalone practice is separate from your diagnosis.'
      : !saved ? 'This browser could not save the learning record. Keep this page open to view it.'
        : Object.hasOwn(samples.cases, caseId) ? 'Learning saved. Continue with your practice focus.'
          : 'Learning saved. A simulated interview is not available for this case yet.';
  }

  function renderSummary(current) {
    const results = handoffResults(current);
    const stored = current.record && flow.learningRecord(store, current.record.caseId)?.learned.output;
    const savedOutput = contract.validOutput(stored, current.input, catalog) ? stored : null;
    if (!results.size && !savedOutput) return;
    $('learning-summary').hidden = false;
    $('summary-content').replaceChildren(...current.selected.map((id) => {
      const status = results.has(id) ? (results.get(id).needsPractice ? 'Needs more practice' : 'Practiced')
        : savedOutput?.learning.studiedTopics.includes(id) ? 'Practiced in a saved session' : 'Not completed';
      return el('p', `${topics.get(id)}: ${status}`);
    }));
    $('continue-dialogue').hidden = true;
    $('handoff-status').textContent = '';
    if (!results.size && savedOutput) {
      $('summary-state').textContent = 'Your completed learning record is saved.';
      showRecord(current, savedOutput, true);
      return;
    }
    if (results.size < current.selected.length) {
      $('summary-state').textContent = `${results.size} of ${current.selected.length} activities complete.`;
      $('learning-output').textContent = 'Finish the activities to create your learning record.';
      return;
    }
    $('summary-state').textContent = 'All recommended activities are complete.';
    if (current.pending.size) return;
    if (current.mode === 'api' && !current.reflection) {
      $('learning-output').textContent = 'Waiting for your AI reflection.';
      if (!current.reflecting && $('reflection-retry').hidden) runReflection(current, results);
      return;
    }
    if (current.reflection) $('ai-reflection').textContent = current.reflection.reflection;
    let output;
    try {
      output = contract.buildOutput(current.input, results, current.mode, current.reflection, content, catalog,
        current.record ? current.course.source : undefined);
    } catch (error) {
      $('summary-state').textContent = error.message;
      return;
    }
    const unchanged = savedOutput && JSON.stringify(savedOutput) === JSON.stringify(output);
    const saved = !!current.record && (unchanged || flow.saveLearning(store, current.input, output));
    showRecord(current, output, saved);
  }

  async function runReflection(current, results) {
    if (!isCurrent(current) || current.reflecting || current.mode !== 'api') return;
    current.reflecting = true;
    $('reflection-retry').hidden = true;
    $('ai-reflection').textContent = 'Preparing AI reflection…';
    const observations = current.selected.map((topicId) => {
      const { judgment, needsPractice, practiceFocus } = results.get(topicId);
      return { topicId, judgment, needsPractice, practiceFocus };
    });
    try {
      const result = await feedback.reflect({ mode: current.mode, input: current.input, observations });
      if (!refreshCourse(current)) return;
      const latestResults = handoffResults(current);
      if (observations.some((entry) => {
        const latest = latestResults.get(entry.topicId);
        return !latest || entry.judgment !== latest.judgment || entry.needsPractice !== latest.needsPractice ||
          entry.practiceFocus !== latest.practiceFocus;
      })) return;
      if (!contract.validReflection(result, current.selected)) throw new Error('Invalid AI reflection.');
      current.reflection = result;
      writeCourse(current);
    } catch (error) {
      if (!isCurrent(current)) return;
      $('ai-reflection').textContent = `AI reflection unavailable: ${error.message} Your completed activities are saved.`;
      $('reflection-retry').hidden = false;
    } finally {
      current.reflecting = false;
      if (isCurrent(current)) renderSummary(current);
    }
  }

  $('course-retry').addEventListener('click', () => {
    if (session?.record) generateCourse(session);
  });
  $('course-fallback').addEventListener('click', () => {
    const current = session;
    if (!current?.record || current.generating || current.course || !isCurrent(current)) return;
    const saved = readCourse(current);
    openCourse(current, saved || { id: crypto.randomUUID(), source: 'authored-fallback', lessons: null }, !saved);
  });
  $('reflection-retry').addEventListener('click', () => {
    if (session) runReflection(session, handoffResults(session));
  });
  $('learning-previous').addEventListener('click', () => moveCard(-1));
  $('learning-next').addEventListener('click', () => moveCard(1));
  $('weak-topics').addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectCard(link.hash);
  });
  window.addEventListener('hashchange', () => {
    if (session?.course) showCard(session);
  });
  function startSample() {
    start(samples.samples[picker.value]?.part2.input, { mode: modePicker.value });
  }
  picker.addEventListener('change', startSample);
  modePicker.addEventListener('change', startSample);
  $('open-sample-mode').addEventListener('click', () => {
    $('sample-picker').hidden = false;
    modePicker.value = 'sample';
    picker.value = 'cart-checkout';
    startSample();
  });
  window.addEventListener('storage', (event) => {
    if (session?.record && (event.key === 'skillloop.v1.learningPathDiagnosis' || event.key === null)) isCurrent(session);
  });

  if (window.SkillLoopLearningInput !== undefined) {
    start(window.SkillLoopLearningInput);
  } else {
    try {
      const record = store.read('learningPathDiagnosis', null);
      start(part1.fromRecord(record, catalog, contract, part1Data), { record });
    } catch (error) {
      $('learning-mode').textContent = 'Part 1 diagnosis required';
      showError(error.message);
    }
  }
})();
