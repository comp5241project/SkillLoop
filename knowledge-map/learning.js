(function () {
  const samples = window.SkillLoopSamples;
  const contract = window.SkillLoopLearningContract;
  const content = window.SkillLoopLearningContent;
  const feedback = window.SkillLoopLearningFeedback;
  const part1 = window.SkillLoopPart1Adapter;
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  let session = null;
  const topics = new Map(samples.topics.map((item) => [item.topicId, item.title]));
  const picker = $('sample-case');
  const modePicker = $('learning-mode-select');
  const providedInput = window.SkillLoopLearningInput;
  for (const [id, item] of Object.entries(samples.cases)) {
    const option = el('option', item.title); option.value = id; picker.append(option);
  }
  function showError(message) {
    $('learning-session').hidden = true;
    $('learning-error').hidden = false;
    $('learning-error-message').textContent = message;
  }
  function sampleInput(id) { return samples.samples[id]?.part2.input; }
  function start(input) {
    session = null;
    $('continue-dialogue').hidden = true;
    $('handoff-status').textContent = '';
    $('learning-summary').hidden = true;
    $('learning-output').textContent = '';
    $('ai-reflection').textContent = '';
    $('reflection-retry').hidden = true;
    $('learning-cards').replaceChildren();
    if (!contract.validInput(input, samples)) return showError('The Part 1 diagnosis is incomplete or invalid. Return to My path, or explicitly open standalone Sample mode.');
    const caseId = input.case.caseId;
    const available = content[caseId] || {};
    const selected = input.result.priorities;
    if (!selected.length || selected.some((id) => !available[id])) return showError('No learning card is available for this case and topic selection.');
    session = { input, selected, results: new Map(), pending: new Set(), mode: modePicker.value, reflection: null, reflecting: false };
    $('learning-mode').textContent = modePicker.value === 'api' ? 'Live AI mode · Server feedback' : 'Sample development mode · No AI call';
    $('learning-error').hidden = true;
    $('learning-session').hidden = false;
    $('case-title').textContent = input.case.title;
    $('case-scenario').textContent = input.case.summary;
    $('assessment-summary').textContent = input.result.overall.summary;
    $('weak-topics').replaceChildren();
    selected.forEach((id) => $('weak-topics').append(el('span', topics.get(id), 'learning-tag')));
    $('learning-intro').textContent = 'Recommended from your diagnosis. Complete an activity to add a topic to your learning summary.';
    selected.forEach((id) => $('learning-cards').append(card(input, id, available[id])));
    const savedRecord = window.SkillLoopFlow.learningRecord(window.SkillLoop, caseId);
    if (savedRecord && JSON.stringify(savedRecord.diagnosis.result) === JSON.stringify(input.result)) {
      $('learning-summary').hidden = false;
      $('summary-state').textContent = 'Your completed learning record is saved. Continue, or practise these activities again.';
      $('learning-output').textContent = JSON.stringify(savedRecord.learned.output, null, 2);
      $('continue-dialogue').hidden = false;
      $('continue-dialogue').href = '/interview/?flow=1&case=' + encodeURIComponent(caseId);
    }

  }
  function card(input, topicId, lesson) {
    const article = el('article', undefined, 'learning-card');
    article.append(el('p', topics.get(topicId), 'learning-eyebrow'), el('h3', input.case.title));
    article.append(el('p', lesson.explanation), el('h4', 'In this case'), el('p', lesson.example));
    const dimension = input.result.dimensions.find((item) => item.conceptId === topicId);
    article.append(el('p', `Diagnosis gap: ${dimension.gap}`), el('p', `Observed strength: ${dimension.strength}`),
      el('p', `Evidence: ${dimension.evidence}`));
    const details = el('details');
    details.append(el('summary', 'View starter code'), el('pre', input.case.starterCode));
    article.append(details);
    const form = el('form');
    const fieldset = el('fieldset');
    fieldset.append(el('legend', lesson.exercise.prompt));
    let answer;
    if (lesson.exercise.kind === 'choice') {
      lesson.exercise.options.forEach((option, index) => {
        const label = el('label');
        const radio = el('input'); radio.type = 'radio'; radio.name = `answer-${topicId}`; radio.value = String(index);
        label.append(radio, document.createTextNode(` ${option}`)); fieldset.append(label);
      });
      answer = () => form.querySelector('input:checked')?.value;
    } else {
      const field = el('textarea'); field.setAttribute('aria-label', lesson.exercise.prompt);
      field.maxLength = 800; fieldset.append(field); answer = () => field.value.trim();
    }
    const button = el('button', 'Check answer', 'sl-btn'); button.type = 'submit';
    const response = el('p', '', 'learning-feedback'); response.setAttribute('role', 'status');
    form.append(fieldset, button, response); article.append(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!session || session.input !== input || session.pending.has(topicId) || session.reflecting) return;
      const current = session;
      const value = answer();
      if (value === undefined || value === '') { response.textContent = 'Answer the question before checking.'; return; }
      window.SkillLoopFlow.clearLearning(window.SkillLoop, input.case.caseId);
      $('continue-dialogue').hidden = true;
      session.pending.add(topicId); button.disabled = true; response.textContent = 'Checking…';
      try {
        const result = await feedback.evaluate({ caseId: input.case.caseId, topicId, exercise: lesson.exercise, answer: value, input, mode: current.mode });
        if (session !== current) return;
        if (result.aiSource !== current.mode || typeof result.needsPractice !== 'boolean' ||
            !['correct', 'incomplete', 'incorrect'].includes(result.judgment) ||
            (current.mode === 'sample' ? typeof result.message !== 'string' : typeof result.explanation !== 'string')) throw new Error('Invalid feedback.');
        session.results.set(topicId, result);
        session.reflection = null;
        article.dataset.complete = 'true';
        response.textContent = current.mode === 'sample' ? result.message :
          `${result.judgment}: ${result.explanation}${result.followUp ? ` Follow-up to consider: ${result.followUp}` : ''}`;
        renderSummary();
      } catch (error) { if (session === current) response.textContent = `Feedback unavailable: ${error.message} Your answer is still here; try again.`; }
      finally { if (session === current) { session.pending.delete(topicId); button.disabled = false; } }
    });
    return article;
  }
  function renderSummary() {
    if (!session) return;
    const { input, selected, results } = session;
    const complete = selected.every((id) => results.has(id));
    $('learning-summary').hidden = false;
    $('summary-state').textContent = complete
      ? 'All recommended activities are complete. This summary records practice, not mastery.'
      : `${results.size} of ${selected.length} activities complete. Finish the remaining activities before producing the handoff.`;
    $('summary-content').replaceChildren();
    for (const id of selected) {
      const status = !results.has(id) ? 'Not completed' : results.get(id).needsPractice ? 'Needs more practice' : 'Practiced';
      $('summary-content').append(el('p', `${topics.get(id)}: ${status}`));
    }
    if (!complete) { $('learning-output').textContent = 'No output yet — learning session incomplete.'; return; }
    if (session.mode === 'api' && !session.reflection) {
      $('learning-output').textContent = 'Awaiting validated AI reflection.';
      if (!session.reflecting) runReflection();
      return;
    }
    let output;
    try { output = contract.buildOutput(input, results, session.mode, session.reflection, content, samples); }
    catch (error) { return showError(error.message); }
    $('learning-output').textContent = JSON.stringify(output, null, 2);
    const saved = window.SkillLoopFlow.saveLearning(window.SkillLoop, input, output);
    $('continue-dialogue').hidden = !saved;
    $('continue-dialogue').href = '/interview/?flow=1&case=' + encodeURIComponent(output.caseId);
    $('handoff-status').textContent = saved ? 'Learning saved. Bring your practice focus into the dialogue.' : 'This standalone session is not linked to a saved diagnosis.';
  }
  async function runReflection() {
    const current = session;
    if (!current || current.mode !== 'api' || current.reflecting) return;
    current.reflecting = true;
    $('reflection-retry').hidden = true;
    $('ai-reflection').textContent = 'Preparing AI reflection…';
    try {
      const observations = current.selected.map((topicId) => {
        const result = current.results.get(topicId);
        return { topicId, judgment: result.judgment, needsPractice: result.needsPractice, practiceFocus: result.practiceFocus };
      });
      const result = await feedback.reflect({ mode: current.mode, input: current.input, observations });
      if (session !== current) return;
      if (result.aiSource !== 'api' || !Array.isArray(result.needsPractice) || !Array.isArray(result.practiceFocus) ||
          typeof result.reflection !== 'string') throw new Error('Invalid AI reflection.');
      current.reflection = result;
      $('ai-reflection').textContent = result.reflection;
    } catch (error) {
      if (session !== current) return;
      $('ai-reflection').textContent = `AI reflection unavailable: ${error.message} Your completed answers remain here.`;
      $('reflection-retry').hidden = false;
    } finally {
      if (session === current) { current.reflecting = false; if (current.reflection) renderSummary(); }
    }
  }
  $('reflection-retry').addEventListener('click', runReflection);
  picker.addEventListener('change', () => start(sampleInput(picker.value)));
  modePicker.addEventListener('change', () => start(sampleInput(picker.value)));
  $('open-sample-mode').addEventListener('click', () => {
    $('sample-picker').hidden = false;
    modePicker.value = 'sample';
    picker.value = 'cart-checkout';
    start(sampleInput(picker.value));
  });
  if (providedInput !== undefined) {
    $('sample-picker').hidden = true;
    modePicker.value = 'api';
    start(providedInput);
  } else {
    modePicker.value = 'api';
    try { start(part1.read(window.SkillLoop, samples, contract, window.LearningPathDiagnosisData)); }
    catch (error) { showError(error.message); $('learning-mode').textContent = 'Part 1 diagnosis required'; }
  }
})();
