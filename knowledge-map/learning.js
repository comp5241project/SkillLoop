(async function () {
  if (new URLSearchParams(location.search).get('journey') === '1') return;
  const native = window.SkillLoopNative;
  if (native && !await native.open()) return;
  const samples = window.SkillLoopSamples;
  const contract = window.SkillLoopLearningContract;
  const content = window.SkillLoopLearningContent;
  const feedback = window.SkillLoopLearningFeedback;
  const part1 = window.SkillLoopPart1Adapter;
  const part1Data = native ? native.data(window.LearningPathDiagnosisData) : window.LearningPathDiagnosisData;
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
  const objectives = {
    requirements: 'Identify the expected behavior from the case requirements.',
    'edge-cases': 'Identify inputs or states that exercise the limits of the expected behavior.',
    'software-testing': 'Choose a test that can distinguish expected behavior from a defect.',
    'ai-code-review': 'Check a claim about an AI-generated implementation against the code and requirements.',
    'code-reading': 'Trace the code to predict what it will do with a concrete input.',
    communication: 'Describe expected behavior clearly enough for someone else to verify it.',
  };
  const verdicts = { correct: 'Correct', incomplete: 'Incomplete', incorrect: 'Incorrect' };
  const picker = $('sample-case');
  const modePicker = $('learning-mode-select');
  let session, reviewTrigger;

  for (const [id, item] of Object.entries(samples.cases)) {
    const option = el('option', item.title);
    option.value = id;
    picker.append(option);
  }

  function showError(message) {
    $('case-title').textContent = 'Case learning';
    $('learning-progress').hidden = true;
    $('learning-review-open').hidden = true;
    $('learning-session').hidden = true;
    $('learning-error').hidden = false;
    $('learning-error-message').textContent = message;
    $('open-sample-mode').hidden = Boolean(native);
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
    if (saved.source === 'authored-fallback' && (saved.lessons === null ||
        native && contract.validLessons(saved.lessons, current.selected))) return saved;
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
    $('learning-output').parentElement.open = false;
    $('learning-output').parentElement.hidden = true;
    $('ai-reflection').textContent = '';
    $('reflection-retry').hidden = true;
  }

  function start(input, { record = null, mode = 'api' } = {}) {
    session = null;
    resetSummary();
    $('learning-cards').replaceChildren();
    $('learning-card-navigation').hidden = true;
    $('learning-topic').hidden = true;
    $('topic-evidence').hidden = true;
    $('learning-case').open = false;
    $('learning-progress').hidden = true;
    $('learning-intro').textContent = '';
    $('course-actions').hidden = true;
    if (!contract.validInput(input, catalog)) {
      showError('The Part 1 diagnosis is incomplete or invalid. Return to Diagnosis to complete it.');
      return;
    }
    const { case: currentCase, result } = input;
    const selected = result.priorities;
    const current = { input, record, selected, mode, course: null, entries: new Map(), pending: new Set(),
      reflection: null, reflecting: false, generating: false, drafts: {}, draftPatch: {}, activePatch: null };
    $('learning-save').hidden = !native;
    $('learning-save-status').textContent = '';
    $('learning-save-retry').hidden = true;
    session = current;
    $('learning-error').hidden = true;
    $('learning-session').hidden = false;
    $('learning-case').hidden = false;
    $('case-title').textContent = native?.progress.title || currentCase.title;
    $('case-scenario').textContent = currentCase.summary;
    $('assessment-summary').textContent = result.overall.summary;
    $('weak-topics').replaceChildren(...selected.map((id) => topicLink(id)));
    $('learning-priorities').hidden = selected.length === 0;

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
      const result = native ? await native.act('generate-lessons') : await feedback.generateLessons(current.input);
      if (!isCurrent(current)) return;
      if (result?.aiSource !== 'api' || !contract.validLessons(result.lessons, current.selected)) {
        throw new Error('The course did not match your priority topics.');
      }
      const saved = readCourse(current);
      openCourse(current, saved || { id: result.id ?? crypto.randomUUID(), source: 'ai-generated', lessons: result.lessons }, !saved);
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

  function queueDraft(current, topicId, answer) {
    if (!native) return;
    current.drafts[topicId] = answer;
    current.draftPatch[topicId] = answer;
    $('learning-save-status').textContent = 'Saving practice…';
    clearTimeout(current.draftTimer);
    current.draftTimer = setTimeout(() => flushDraft(current), 350);
  }

  function flushDraft(current) {
    if (!native || session !== current || !current.course) return Promise.resolve(true);
    clearTimeout(current.draftTimer);
    if (current.flushing) return current.flushing.then(ok => ok && flushDraft(current));
    if (current.draftError) return Promise.resolve(false);
    const answers = current.draftPatch;
    const activeTopic = current.activePatch;
    if (!activeTopic && !Object.keys(answers).length) return Promise.resolve(true);
    current.draftPatch = {};
    current.activePatch = null;
    $('learning-save-status').textContent = 'Saving practice…';
    current.flushing = native.act('learning-draft', { deckId: current.course.id, answers, ...(activeTopic ? { activeTopic } : {}) })
      .then(() => {
        if (session === current) $('learning-save-status').textContent =
          Object.keys(current.draftPatch).length || current.activePatch ? 'Saving practice…' : 'Practice saved.';
        return true;
      }, error => {
        current.draftPatch = { ...answers, ...current.draftPatch };
        current.activePatch ??= activeTopic;
        current.draftError = error;
        if (session === current) {
          $('learning-save-status').textContent = error.status === 409
            ? 'Progress changed in another tab. Your edits are still here.'
            : 'Your changes have not been saved. Your edits are still here.';
          $('learning-save-retry').hidden = false;
        }
        return false;
      }).finally(() => { current.flushing = null; });
    return current.flushing;
  }

  $('learning-save-retry').addEventListener('click', async () => {
    const current = session;
    if (!native || !current?.draftError) return;
    const retry = $('learning-save-retry');
    retry.disabled = true;
    try {
      if (current.draftError.status === 409) {
        const latest = await native.refresh();
        if (latest.deck?.id !== current.course.id) {
          $('learning-save-status').textContent = 'The practice cards changed. Copy your edits before reloading.';
          return;
        }
        current.entries = new Map(Object.entries(latest.feedback));
        current.reflection = latest.reflection;
      }
      current.draftError = null;
      retry.hidden = true;
      await flushDraft(current);
    } catch {
      $('learning-save-status').textContent = 'Could not reconnect. Your edits are still here.';
    } finally { retry.disabled = false; }
  });
  if (native) window.addEventListener('pagehide', () => { if (session) flushDraft(session); });

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
    const persisted = native?.progress.learningDrafts;
    if (persisted && persisted.deckId === id) {
      current.drafts = { ...persisted.answers };
      if (!current.selected.some(topic => location.hash === '#topic-' + topic) &&
          current.selected.includes(persisted.activeTopic))
        history.replaceState(null, '', '#topic-' + persisted.activeTopic);
    }
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
    $('learning-intro').textContent = '';
    $('learning-cards').replaceChildren(...current.selected.map((topicId) => card(current, topicId, byTopic[topicId])));
    $('learning-topic').hidden = false;
    $('topic-evidence').hidden = false;
    $('learning-progress').hidden = false;
    $('learning-review-open').hidden = false;
    $('learning-card-navigation').hidden = current.selected.length < 2;
    showCard(current);
    if (native && current.selected.some(topic => location.hash === '#topic-' + topic) &&
        current.selected[current.cardIndex] !== persisted?.activeTopic) saveTopic(current);
    renderSummary(current);
  }

  function topicLink(id, available = true) {
    const item = el('li');
    if (!available) {
      item.textContent = topics.get(id);
      return item;
    }
    const link = el('a', topics.get(id));
    link.href = '#topic-' + id;
    item.append(link);
    return item;
  }

  function revealActiveTopic() {
    const strip = $('learning-priorities');
    const active = strip.querySelector('a[aria-current=location]');
    if (!active || !strip.clientWidth) return;
    const left = strip.getBoundingClientRect().left + strip.clientLeft + 4;
    const right = left + strip.clientWidth - 8;
    const tab = active.getBoundingClientRect();
    if (tab.left < left) strip.scrollLeft += tab.left - left;
    if (tab.right > right) strip.scrollLeft += tab.right - right;
  }

  function showCard(current, focus = false) {
    const { selected, input } = current;
    const index = Math.max(0, selected.findIndex((id) => location.hash === '#topic-' + id));
    current.cardIndex = index;
    const cards = $('learning-cards').children;
    for (const [position, link] of $('weak-topics').querySelectorAll('a').entries()) {
      cards[position].hidden = position !== index;
      if (position === index) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    revealActiveTopic();
    const topicId = selected[index];
    const dimension = input.result.dimensions.find((item) => item.conceptId === topicId);
    $('learning-title').textContent = topics.get(topicId);
    $('learning-objective').textContent = objectives[topicId];
    $('diagnosis-gap').textContent = dimension.gap;
    $('diagnosis-strength').textContent = dimension.strength;
    $('diagnosis-evidence').textContent = dimension.evidence;
    $('learning-card-position').textContent = `Topic ${index + 1} of ${cards.length}`;
    $('learning-previous').hidden = index === 0;
    $('learning-next').hidden = index === cards.length - 1;
    $('learning-review-end').hidden = index !== cards.length - 1;
    if (focus) {
      $('learning-title').focus({ preventScroll: true });
      $('learning-topic').scrollIntoView({ block: 'start' });
    }
  }

  function saveTopic(current) {
    current.activePatch = current.selected[current.cardIndex];
    flushDraft(current);
  }

  function selectCard(hash) {
    // Keep the topic in the URL without triggering the browser's anchor scroll.
    if (location.hash !== hash) history.pushState(null, '', hash);
    if (session?.course) {
      showCard(session, true);
      if (native) saveTopic(session);
    }
  }

  function moveCard(offset) {
    const id = session?.selected[session.cardIndex + offset];
    if (id) selectCard('#topic-' + id);
  }

  function verdictLabel(judgment, tag) {
    const label = el(tag, verdicts[judgment], 'learning-verdict');
    label.dataset.judgment = judgment;
    return label;
  }

  function renderFeedback(response, result) {
    const explanation = result.aiSource === 'sample' ? result.message : result.explanation;
    response.replaceChildren(verdictLabel(result.judgment, 'h4'), el('p', explanation));
    if (result.practiceFocus) {
      const focus = el('div', undefined, 'learning-feedback-detail');
      focus.append(el('h5', 'Practice focus'), el('p', result.practiceFocus));
      response.append(focus);
    }
    if (result.followUp) {
      const reflection = el('div', undefined, 'learning-feedback-detail learning-reflection-prompt');
      reflection.append(el('h5', 'Optional reflection'), el('p', result.followUp));
      response.append(reflection);
    }
  }

  function card(current, topicId, lesson) {
    const article = el('article', undefined, 'learning-card');
    article.id = 'topic-' + topicId;
    article.setAttribute('aria-labelledby', 'learning-title');
    article.append(el('h3', 'Concept'), el('p', lesson.explanation, 'learning-prose'),
      el('h3', 'In this case', 'learning-example-title'), el('p', lesson.example, 'learning-prose learning-example'));
    const form = el('form', undefined, 'learning-exercise');
    const heading = el('h3', 'Practice');
    heading.id = 'practice-' + topicId;
    form.setAttribute('aria-labelledby', heading.id);
    const details = el('details', undefined, 'learning-secondary');
    const code = el('pre');
    code.append(el('code', current.input.case.starterCode));
    details.append(el('summary', 'Starter code'), code);
    details.open = topicId === 'code-reading' || topicId === 'ai-code-review';
    const fieldset = el('fieldset');
    fieldset.append(el('legend', lesson.exercise.prompt), details);
    if (native) {
      const references = native.progress.sourceNotes.find(group => group.topicId === topicId)?.notes ?? [];
      if (references.length) {
        const source = el('details', undefined, 'learning-secondary');
        source.append(el('summary', 'Teacher-approved notes for this topic'));
        for (const note of references) {
          source.append(el('h4', note.heading), el('p', note.text, 'learning-prose'));
          for (const {location} of note.citations) source.append(el('p', location.kind + ' ' + location.number + (location.url ? ' · ' + location.url : '')));
        }
        article.append(source);
      }
    }
    const saved = current.entries.get(topicId);
    const drafted = Object.hasOwn(current.drafts, topicId);
    const initial = drafted ? current.drafts[topicId] : saved?.answer ?? '';
    let answer;
    if (lesson.exercise.kind === 'choice') {
      lesson.exercise.options.forEach((option, index) => {
        const label = el('label', undefined, 'learning-answer-option');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'answer-' + topicId;
        radio.value = String(index);
        radio.checked = initial === radio.value;
        radio.addEventListener('change', () => { if (radio.checked) queueDraft(current, topicId, radio.value); });
        label.append(radio, document.createTextNode(' ' + option));
        fieldset.append(label);
      });
      answer = () => form.querySelector('input:checked')?.value;
    } else {
      const label = el('label', 'Your answer', 'learning-answer-label');
      const field = el('textarea');
      field.id = 'answer-' + topicId;
      label.htmlFor = field.id;
      field.maxLength = 800;
      field.value = initial;
      field.addEventListener('input', () => queueDraft(current, topicId, field.value));
      field.addEventListener('blur', () => flushDraft(current));
      fieldset.append(label, field);
      answer = () => field.value.trim();
    }
    const button = el('button', 'Check answer', 'sl-btn sl-btn-main learning-check-answer');
    button.type = 'submit';
    const response = el('div', undefined, 'learning-feedback');
    response.setAttribute('role', 'status');
    const submitted = el('details', undefined, 'learning-secondary learning-submitted');
    const submittedAnswer = el('p', undefined, 'learning-prose');
    submitted.append(el('summary', 'Last submitted answer'), submittedAnswer);
    const updateSubmitted = () => {
      const prior = current.entries.get(topicId);
      submitted.hidden = !native || !prior || prior.answer === answer();
      submittedAnswer.textContent = prior
        ? lesson.exercise.options?.[Number(prior.answer)] ?? prior.answer : '';
    };
    form.addEventListener('input', updateSubmitted);
    form.append(heading, fieldset, button);
    article.append(form, submitted, response);
    updateSubmitted();
    if (saved?.result) renderFeedback(response, saved.result);
    else if (native && saved) response.textContent = 'Answer saved. Feedback is not ready.';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = answer();
      if (!value) {
        response.textContent = 'Answer the question before checking.';
        return;
      }
      if (native && !await flushDraft(current)) return;
      await checkAnswer(current, topicId, lesson, value, button, response);
      updateSubmitted();
    });
    return article;
  }

  // If another tab finished preparing a course, use its saved version.
  // If it updated the same course, merge completed attempts before writing.
  function refreshCourse(current) {
    if (!isCurrent(current)) return false;
    if (native) return true;
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

  async function checkAnswer(current, topicId, lesson, answer, button, response) {
    if (current.pending.has(topicId) || current.reflecting || !refreshCourse(current)) return;
    current.pending.add(topicId);
    button.disabled = true;
    response.textContent = 'Checking…';
    if (!current.entries.get(topicId)?.result) {
      current.entries.set(topicId, { answer, result: null });
      writeCourse(current);
    }
    try {
      const result = native ? await native.act('feedback', { deckId: current.course.id, topicId, answer }) : await feedback.evaluate({
        topicId, exercise: lesson.exercise, answer, input: current.input, mode: current.mode, lesson: lesson.generated,
        authored: current.course.source === 'authored-fallback',
      });
      if (!refreshCourse(current)) return;
      if (!contract.validFeedback(result, current.mode)) throw new Error('Invalid feedback.');
      if (current.record && !native) flow.clearLearning(store, current.record.caseId);
      $('learning-output').parentElement.hidden = true;
      current.entries.set(topicId, { answer, result });
      if (current.drafts[topicId]?.trim() === answer && !Object.hasOwn(current.draftPatch, topicId))
        delete current.drafts[topicId];
      current.reflection = native?.progress.reflection ?? null;
      $('ai-reflection').textContent = '';
      $('reflection-retry').hidden = true;
      writeCourse(current);
      renderFeedback(response, result);
    } catch (error) {
      if (isCurrent(current)) {
        const pendingEntry = native?.progress.feedback[topicId];
        if (pendingEntry?.answer === answer) {
          current.entries.set(topicId, pendingEntry);
          current.reflection = native.progress.reflection;
          writeCourse(current);
        }
        response.textContent = `Feedback unavailable: ${error.message} Your answer is still here; try again.`;
      }
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
    $('learning-output').parentElement.hidden = false;
    $('continue-dialogue').hidden = Boolean(native) || !saved || !Object.hasOwn(samples.cases, caseId);
    $('continue-dialogue').href = '/interview/?flow=1&case=' + encodeURIComponent(caseId);
    $('handoff-status').textContent = !current.record ? 'Standalone practice stays in this tab.'
      : !saved ? 'This browser could not save the learning record. Keep this page open to view it.'
        : Object.hasOwn(samples.cases, caseId) ? 'Learning saved. Continue with your practice focus.'
          : 'Learning saved. A simulated interview is not available for this case yet.';
  }

  function showSummaryTopics(current, practicedTopics, needsPractice, evaluations) {
    const list = el('ul', undefined, 'learning-topic-links learning-topic-results');
    list.append(...current.selected.map((id) => {
      const item = topicLink(id, current.selected.includes(id));
      const { judgment } = evaluations.get(id) || {};
      const status = el('span', undefined, 'learning-topic-status');
      if (judgment) status.append(verdictLabel(judgment, 'span'));
      else status.append(el('span', practicedTopics.includes(id) ? 'Practiced' :
        current.entries.get(id)?.answer ? 'Answer submitted' : 'Not practiced'));
      if (needsPractice.includes(id)) status.append(el('span', 'Further practice'));
      item.append(status);
      const result = evaluations.get(id);
      if (result) item.append(el('p', result.practiceFocus || result.explanation || result.message, 'learning-review-feedback'));
      return item;
    }));
    $('summary-content').replaceChildren(list);
  }

  function furtherPracticeLabel(count) {
    return count === 1 ? '1 topic needs further practice' : `${count} topics need further practice`;
  }

  function renderSummary(current) {
    const results = handoffResults(current);
    const stored = !native && current.record && flow.learningRecord(store, current.record.caseId)?.learned.output;
    const savedOutput = contract.validOutput(stored, current.input, catalog) ? stored : null;
    const { selected } = current;
    const savedOnly = !results.size && savedOutput;
    const practicedTopics = savedOnly ? savedOutput.learning.studiedTopics : selected.filter((id) => results.has(id));
    const needsPractice = savedOnly ? savedOutput.learning.needsPractice : practicedTopics.filter((id) =>
      results.get(id).needsPractice || current.reflection?.needsPractice.includes(id));
    for (const link of $('weak-topics').querySelectorAll('a')) {
      const complete = practicedTopics.includes(link.hash.slice('#topic-'.length));
      link.toggleAttribute('data-practiced', complete);
      link.setAttribute('aria-label', link.textContent + (complete ? ', practiced' : ''));
    }
    const practiced = selected.filter((id) => practicedTopics.includes(id)).length;
    const further = selected.filter((id) => needsPractice.includes(id)).length;
    $('learning-practiced').textContent = `${practiced}/${selected.length} ${selected.length === 1 ? 'topic' : 'topics'} practiced`;
    $('learning-further-practice').textContent = further ? furtherPracticeLabel(further) : '';
    const progress = $('learning-progress-bar');
    progress.max = selected.length;
    progress.value = practiced;
    revealActiveTopic();
    const incomplete = practiced < selected.length && !savedOnly;
    $('learning-summary').hidden = false;
    $('continue-dialogue').hidden = true;
    $('handoff-status').textContent = '';
    if ($('learning-summary').hidden) return;
    const evaluations = savedOnly ? new Map(savedOutput.learning.activities?.map((item) => [item.topicId, item])) : results;
    $('summary-state').textContent = needsPractice.length ? furtherPracticeLabel(needsPractice.length) + '.' :
      incomplete ? '' : 'No further practice flagged.';
    showSummaryTopics(current, practicedTopics, needsPractice, evaluations);
    {
      $('learning-review-count').textContent = `${practiced}/${selected.length} practiced`;
      $('learning-review-progress').max = selected.length;
      $('learning-review-progress').value = practiced;
      if (incomplete) {
        $('ai-reflection').textContent = 'Reflection is available after completing feedback on each topic.';
        return;
      }
      if (current.mode !== 'api') $('ai-reflection').textContent = 'These practice cards use local feedback.';
    }
    if (savedOnly) {
      showRecord(current, savedOutput, true);
      return;
    }
    if (current.pending.size) return;
    if (current.mode === 'api' && !current.reflection) {
      if (!current.reflecting && $('reflection-retry').hidden) runReflection(current, results);
      return;
    }
    if (current.reflection) $('ai-reflection').textContent = current.reflection.reflection;
    if (native) return;
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

  // Reflection is optional. Use the same revision checks without queuing the formal case check behind the model.
  async function requestPublishedReflection(current) {
    if (!await flushDraft(current)) throw new Error('Save your practice before retrying reflection.');
    const pinned = native.progress;
    const { courseId, version, attemptId, revision } = pinned;
    const query = new URLSearchParams({ op: 'native-save', course: courseId, version });
    const result = fetch('/api/courses/?' + query, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SkillLoop-Course': '1' },
      body: JSON.stringify({ courseId, version, attemptId, revision, action: 'reflection' }),
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The reflection could not be saved.');
      return payload;
    });
    const reflection = { revision, result };
    current.reflectionRequest = reflection;
    try {
      const payload = await result;
      if (native.progress.revision < payload.progress.revision) await native.refresh();
      return payload.data;
    } finally {
      if (current.reflectionRequest === reflection) current.reflectionRequest = null;
    }
  }

  async function submitPublishedCheck(current, input) {
    const revision = native.progress.revision;
    const competing = current?.reflectionRequest;
    try {
      return await native.act('case-check', input);
    } catch (error) {
      if (error.status !== 409 || competing?.revision !== revision) throw error;
      const reflected = await competing.result.catch(() => null);
      if (reflected?.progress.revision !== revision + 1) throw error;
      const latest = await native.refresh();
      if (latest.revision !== reflected.progress.revision) throw error;
      return native.act('case-check', input);
    }
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
      const result = native ? await requestPublishedReflection(current) : await feedback.reflect({ mode: current.mode, input: current.input, observations });
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
      $('ai-reflection').textContent = `AI reflection unavailable: ${error.message} Your activity results are still available.`;
      $('reflection-retry').hidden = false;
    } finally {
      current.reflecting = false;
      if (isCurrent(current)) renderSummary(current);
    }
  }

  $('course-retry').addEventListener('click', () => {
    if (session?.record) generateCourse(session);
  });
  $('course-fallback').addEventListener('click', async () => {
    const current = session;
    if (!current?.record || current.generating || current.course || !isCurrent(current)) return;
    const saved = readCourse(current);
    if (native && !saved) {
      try {
        const deck = await native.act('authored-lessons');
        openCourse(current, { id: deck.id, source: 'authored-fallback', lessons: deck.lessons }, true);
      } catch (error) { $('learning-intro').textContent = error.message; }
      return;
    }
    openCourse(current, saved || { id: crypto.randomUUID(), source: 'authored-fallback', lessons: null }, !saved);
  });
  $('reflection-retry').addEventListener('click', () => {
    if (session) runReflection(session, handoffResults(session));
  });
  $('learning-previous').addEventListener('click', () => moveCard(-1));
  $('learning-next').addEventListener('click', () => moveCard(1));
  function followTopic(event) {
    const link = event.target.closest('a[href^="#topic-"]');
    if (!session?.course || !link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.closest('#learning-review')) {
      reviewTrigger = null;
      $('learning-review').close();
    }
    selectCard(link.hash);
  }
  $('learning-session').addEventListener('click', followTopic);
  $('learning-priorities').addEventListener('click', followTopic);
  window.addEventListener('hashchange', () => {
    if (session?.course && (!location.hash || location.hash.startsWith('#topic-'))) {
      showCard(session, true);
      if (native) saveTopic(session);
    }
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
    $('sample-picker').querySelector('summary').focus();
  });
  window.addEventListener('storage', (event) => {
    if (session?.record && (event.key === 'skillloop.v1.learningPathDiagnosis' || event.key === null)) isCurrent(session);
  });

  {
    const main = $('main-content');
    main.classList.add('learning-published');
    main.append($('published-learning-review').content.cloneNode(true));
    const header = main.querySelector('.learning-header');
    main.prepend(header);
    new ResizeObserver(() => {
      main.style.setProperty('--learning-strip-height', header.offsetHeight + 12 + 'px');
      revealActiveTopic();
    }).observe(header);
    const context = el('div', undefined, 'learning-course-context');
    const metadata = el('div', undefined, 'learning-course-metadata');
    metadata.append(header.querySelector('.learning-eyebrow'), $('learning-mode'));
    context.append($('case-title'), metadata);
    header.prepend(context);
    const tools = el('div', undefined, 'learning-strip-tools');
    const makeReviewButton = id => {
      const button = el('button', 'Review & continue', 'sl-btn sl-btn-main');
      button.type = 'button';
      button.id = id;
      button.hidden = true;
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'learning-review');
      button.addEventListener('click', () => {
        reviewTrigger = button;
        $('learning-review').showModal();
      });
      return button;
    };
    tools.append($('learning-practiced'), makeReviewButton('learning-review-open'));
    $('learning-progress').prepend($('learning-priorities'), tools);
    $('learning-topic').prepend($('learning-card-position'));
    if (native) {
      const requirements = el('ul');
      requirements.append(...native.progress.case.requirements.map(text => el('li', text)));
      $('case-scenario').after(requirements);
    }
    $('learning-card-navigation').after(makeReviewButton('learning-review-end'));
    const progressCard = el('div', undefined, 'learning-review-progress');
    const reviewCount = el('strong');
    reviewCount.id = 'learning-review-count';
    const progress = el('progress');
    progress.id = 'learning-review-progress';
    progress.setAttribute('aria-label', 'Topics practiced');
    progressCard.append(reviewCount, progress);
    $('learning-review-body').append(progressCard, $('learning-summary'));
    $('ai-reflection').before(el('h3', 'Reflection', 'learning-review-reflection-heading'));
    $('learning-review-body').addEventListener('click', followTopic);
    $('learning-review-close').addEventListener('click', () => $('learning-review').close());
    $('learning-review').addEventListener('close', () => {
      reviewTrigger?.focus({ preventScroll: true });
      reviewTrigger = null;
    });
    $('learning-review').addEventListener('click', event => {
      if (event.target !== $('learning-review')) return;
      const bounds = event.target.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right) event.target.close();
    });
    if (!native) {
      $('learning-review-gate').hidden = true;
      $('learning-review-footer').append($('continue-dialogue'), $('handoff-status'));
    }
  }
  if (native) {
    $('learning-error').querySelector('a').href = native.url('/learning-path/');
    const { practice, case: pinned } = native.progress;
    if (practice) {
      const section = el('section', undefined, 'learning-case-check');
      const form = el('form', undefined, 'learning-exercise');
      const options = el('select');
      const label = el('label', practice.prompt);
      options.required = true;
      const blank = el('option', 'Choose an answer');
      blank.value = '';
      options.append(blank);
      practice.options.forEach((text, i) => {
        const item = el('option', text);
        item.value = String(i);
        options.append(item);
      });
      label.append(options);
      const why = el('textarea');
      why.maxLength = 1200;
      why.required = true;
      const explanation = el('label', 'Explain your reasoning');
      explanation.append(why);
      const submit = el('button', 'Check my reasoning', 'sl-btn sl-btn-main');
      submit.type = 'submit';
      const status = el('p');
      status.setAttribute('role', 'status');
      const next = el('a', 'Continue to AI dialogue', 'sl-btn sl-btn-main');
      next.href = native.url('/interview/', { case: pinned.caseId, flow: '1' });
      function completed(learning) {
        next.hidden = !learning;
        $('learning-review-gate').hidden = Boolean(learning);
        form.hidden = Boolean(learning);
        status.textContent = learning?.check.feedback ?? '';
      }
      form.append(label, explanation, submit);
      section.append(el('h2', 'Formal case check'), form, status);
      const extra = el('a', 'AI Personalized Learning', 'sl-btn');
      extra.href = native.personalized;
      $('learning-review-body').append(section);
      $('learning-review-footer').append(next, extra);
      completed(native.progress.learning);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        submit.disabled = true;
        try {
          if (session && !await flushDraft(session)) {
            status.textContent = 'Resolve the practice save before submitting the case check.';
            return;
          }
          status.textContent = 'Saving your case check…';
          const learning = await submitPublishedCheck(session, { option: Number(options.value), explanation: why.value });
          store.write('learningResult', learning);
          completed(learning);
        } catch (error) { status.textContent = error.message; }
        finally { submit.disabled = false; }
      });
    }
  }

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
