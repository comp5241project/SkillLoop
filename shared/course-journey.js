(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('journey') !== '1') return;

  const paths = { diagnosis: '/learning-path/', learning: '/knowledge-map/',
    repair: '/interview/', verification: '/correction-lab/' };
  const titles = { diagnosis: 'Diagnose the delivery', learning: 'Practise the priority',
    repair: 'Plan and apply a repair', verification: 'Verify the implementation' };
  const stages = Object.keys(paths);
  const stage = stages.find((key) => paths[key] === location.pathname.replace(/\/?$/, '/'));
  const main = document.querySelector('main');
  if (!stage || !main) return;
  const courseId = params.get('course');
  const version = params.get('version');
  const query = { course: courseId, version };
  const controls = document.createElement('section');
  controls.className = 'sl-card';
  const notice = node('p', 'Loading your published course…');
  notice.role = 'status';
  main.replaceChildren(node('h1', titles[stage]), notice, controls);

  function node(tag, value) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function link(label, path) {
    const anchor = node('a', label);
    anchor.className = 'sl-btn';
    const url = new URL(path, location.origin);
    url.search = new URLSearchParams({ journey: '1', ...query });
    anchor.href = url;
    return anchor;
  }

  async function request(op, input, extra = {}) {
    const url = new URL('/api/courses/', location.origin);
    url.search = new URLSearchParams({ op, ...query, ...extra });
    const response = await fetch(url, input === undefined ? {} : { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SkillLoop-Course': '1' }, body: JSON.stringify(input) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status });
    return data;
  }

  function formFor(label, save) {
    const form = node('form');
    const button = node('button', label);
    button.className = 'sl-btn sl-btn-main';
    button.type = 'submit';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      const data = new FormData(form);
      button.disabled = true;
      notice.textContent = 'Saving…';
      try { await save(data); }
      catch (error) { notice.textContent = error.message; }
      finally { button.disabled = false; }
    });
    return { form, button };
  }

  function field(group, caption, name, tag, settings = {}) {
    const label = node('label', caption);
    label.style.display = 'block';
    const input = node(tag);
    Object.assign(input, { name, ...settings });
    label.append(input);
    group.append(label);
    return input;
  }

  function select(group, caption, name, choices, existing) {
    const fieldNode = field(group, caption, name, 'select', { required: true });
    const blank = node('option', 'Choose an answer');
    blank.value = '';
    fieldNode.append(blank);
    for (const [index, choice] of choices.entries()) {
      const option = node('option', choice.label ?? choice);
      option.value = choice.id ?? String(index);
      option.selected = option.value === existing;
      fieldNode.append(option);
    }
    return fieldNode;
  }

  function panel(title, content) {
    const item = node('section');
    item.className = 'sl-card';
    item.append(node('h2', title), ...content);
    return item;
  }

  function beginReadback(message, buttonLabel, action) {
    const { form, button } = formFor(buttonLabel, action);
    form.append(node('p', message), button);
    controls.replaceChildren(form);
  }

  function showSignIn() {
    const { form, button } = formFor('Sign in', async (data) => {
      const session = await request('login', Object.fromEntries(data));
      if (session.role !== 'student') throw new Error('Use a learner account to record this journey.');
      await open();
    });
    field(form, 'Email', 'email', 'input', { type: 'email', required: true, autocomplete: 'username' });
    field(form, 'Password', 'password', 'input', { type: 'password', required: true, autocomplete: 'current-password' });
    form.append(button);
    controls.replaceChildren(form);
    notice.textContent = 'Sign in as a learner to save your work to this course version.';
  }

  function render(view) {
    notice.textContent = view.courseTitle + ' · Course version ' + view.version + ' · ' +
      view.caseRef.caseId + '@' + view.caseRef.caseVersion + ' · ' + view.caseRef.conceptId;
    const nav = node('nav');
    nav.setAttribute('aria-label', 'Learning stages');
    stages.forEach((key, index) => {
      const label = 'Part ' + (index + 1) + ' · ' + titles[key];
      if (key === stage) {
        const current = node('strong', label);
        current.setAttribute('aria-current', 'step');
        nav.append(current, ' ');
      } else if (index === 0 || view.completed.includes(stages[index - 1])) nav.append(link(label, paths[key]), ' ');
    });

    const save = async (input) => render(await request('journey', { courseId, version, stage,
      attemptId: view.attemptId, revision: view.revision, input }));

    const requirements = node('ul');
    view.case.requirements.forEach(({ text }) => requirements.append(node('li', text)));
    const starter = node('details');
    starter.append(node('summary', 'Delivered starter code'), node('pre', view.case.starterCode));
    const facts = panel(view.case.title, [node('p', view.case.scenario), node('p', view.case.aiClaim), requirements, starter]);
    controls.replaceChildren(nav, facts);

    if (stage === 'diagnosis') {
      const { form, button } = formFor('Record diagnosis', (data) => save({ answers: Object.fromEntries(
        view.questions.map(({ id }) => [id, { optionId: data.get(id), explanation: data.get(id + '-why') }])) }));
      for (const question of view.questions) {
        const previous = view.answers.find(({ questionId }) => questionId === question.id);
        select(form, question.prompt, question.id, question.options, previous?.optionId);
        field(form, 'Reasoning (optional)', question.id + '-why', 'textarea',
          { maxLength: 400, rows: 2, value: previous?.explanation ?? '' });
      }
      form.append(button);
      controls.append(panel('Check your understanding', [form]));
      if (view.result) controls.append(panel(view.result.practiceRecommended ? 'Priority to practise' : 'Apply what you know',
        [node('p', view.result.question), node('p', 'Your answer: ' + view.result.answer), link('Continue to learning', paths.learning)]));
    } else if (stage === 'learning') {
      const { teaching, diagnosis } = view;
      const source = { 'teacher-published': 'Teacher-published explanation',
        'deterministic-m2': 'Diagnosis-matched teaching · local template', 'authored-fallback': 'Authored fallback' }[teaching.source];
      const notes = [node('p', diagnosis.question), node('p', 'You chose: ' + diagnosis.answer),
        node('p', teaching.requirement.text),
        node('p', teaching.source === 'teacher-published' ? teaching.published.explanation : teaching.card.explanation),
        node('pre', teaching.card.codeExample.excerpt), node('p', teaching.card.codeExample.prompt),
        node('p', teaching.aiState === 'validation-fallback' ? 'The local teaching template could not be validated. Use the authored lesson below.'
          : 'The practice and feedback use a local, authored activity.')];
      if (!teaching.published.matching) {
        const related = node('details');
        related.append(node('summary', 'Teacher reading · ' + teaching.published.title),
          node('p', teaching.published.explanation));
        notes.push(related);
      } else {
        const activities = node('details');
        activities.append(node('summary', 'Teacher activities · ' + teaching.published.title));
        teaching.published.objectives.forEach(({ text }) => activities.append(node('p', text)));
        activities.append(node('pre', teaching.published.codeExample.excerpt), node('p', teaching.published.codeExample.prompt));
        for (const { prompt, publicHints } of teaching.published.exercises) {
          activities.append(node('p', prompt));
          publicHints.forEach(hint => activities.append(node('p', hint)));
        }
        notes.push(activities);
      }
      controls.append(panel(source, notes));
      const { form, button } = formFor('Check my reasoning', (data) =>
        save({ option: Number(data.get('option')), explanation: data.get('why') }));
      select(form, teaching.practice.prompt, 'option', teaching.practice.options);
      field(form, 'Explain your reasoning', 'why', 'textarea', { required: true, maxLength: 1200, rows: 3 });
      form.append(button);
      controls.append(panel('Try a boundary', [form]));
      if (view.result) controls.append(panel('Feedback', [node('p', view.result.feedback),
        link('Continue to repair', paths.repair)]));
    } else if (stage === 'repair') {
      if (!view.issues) {
        controls.append(panel('Verification unavailable', [node('p', 'This case version has no approved runner.')]));
        return;
      }
      const { form: dialogue, button: send } = formFor('Ask for repair guidance', (data) => save({ message: data.get('message') }));
      const turns = node('ol');
      for (const turn of view.result?.dialogue ?? []) {
        const row = node('li');
        row.append(node('p', 'You: ' + turn.message), node('p', 'Local guide: ' + turn.feedback));
        turns.append(row);
      }
      field(dialogue, 'Your question or repair request', 'message', 'textarea', { required: true, maxLength: 1000, rows: 2 });
      dialogue.append(send);
      controls.append(panel('Repair dialogue', [node('p', 'The local guide asks you to connect your plan to observable behavior.'), turns, dialogue]));
      const { form, button } = formFor('Save repair plan', (data) => save({
        choices: Object.fromEntries(view.issues.map(({ issueId }) => [issueId, Number(data.get(issueId))])),
        requests: Object.fromEntries(view.issues.map(({ issueId }) => [issueId, data.get(issueId + '-request')])),
      }));
      for (const issue of view.issues) {
        const block = node('fieldset');
        const checks = node('ul');
        issue.checks.forEach((check) => checks.append(node('li', check.action + ' → ' + check.expected)));
        block.append(node('legend', issue.title), node('p', issue.observed), checks);
        field(block, 'What would you ask the developer to change?', issue.issueId + '-request', 'textarea',
          { required: true, maxLength: 1000, rows: 2, value: view.result?.requests?.[issue.issueId] || '' });
        select(block, 'Apply a change for ' + issue.title, issue.issueId, issue.choices,
          view.result?.choices ? String(view.result.choices[issue.issueId]) : undefined);
        form.append(block);
      }
      form.append(button);
      controls.append(panel('Review the implementation', [node('p', view.feedback), form]));
      if (view.result?.choices) controls.append(link('Continue to verification', paths.verification));
    } else {
      const { form, button } = formFor('Run verification', () => save({}));
      form.append(node('p', 'The case runner executes the approved tests against your selected repair.'), button);
      controls.append(panel('Check the repair', [form]));
      if (view.result) {
        const heading = { passed: 'All tests passed', needs_revision: 'Needs revision',
          inconclusive: 'Verification inconclusive' }[view.result.outcome];
        const tests = node('ul');
        view.result.tests.forEach((test) => tests.append(node('li', test.testId + ' · ' + test.status + ' · ' + test.actual)));
        controls.append(panel(heading, [tests, link('Return to repair', paths.repair),
          link('Back to the published lesson', '/enhancement-v2/studio/learner/')]));
      }
    }
  }

  async function open() {
    const { role } = await request('session');
    if (role !== 'student') {
      if (role === 'teacher') {
        beginReadback('You are signed in as a teacher. Switch accounts to record learner activity.', 'Sign out', async () => {
          await request('logout', {});
          showSignIn();
        });
        notice.textContent = 'Switch to a learner account.';
      } else showSignIn();
      return;
    }
    const { attempt } = await request('attempt');
    if (!attempt) {
      if (stage !== 'diagnosis') {
        notice.textContent = 'Start the diagnosis for this course version first.';
        controls.replaceChildren(link('Go to diagnosis', paths.diagnosis));
      } else {
        notice.textContent = 'Start a saved attempt for this course version.';
        beginReadback('Your answers and verification results belong to this version.', 'Start diagnosis', async () => {
          await request('start', { courseId, version });
          await open();
        });
      }
      return;
    }
    render(await request('journey', undefined, { stage }));
  }

  open().catch(error => {
    notice.textContent = error.message;
    if (error.status === 409) controls.replaceChildren(link('Return to diagnosis', paths.diagnosis));
  });
})();
