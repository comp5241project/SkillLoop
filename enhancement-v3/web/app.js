export const root = '/enhancement-v3/web/';
const params = new URLSearchParams(location.search);
const page = document.body.dataset.page;
export const workspace = document.getElementById('workspace');
export const status = (message = '', error = false) => {
  const target = document.getElementById('status');
  if (target) { target.textContent = message; target.dataset.error = error; }
};
export const node = (tag, text, attrs = {}) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) element.setAttribute(key, value);
  }
  return element;
};
export const link = (label, url, primary = false) => node('a', label, { href: url, class: primary ? 'button primary' : 'button' });
export const pageURL = (name, data = {}) => root + name + '.html' + (Object.keys(data).length ? '?' + new URLSearchParams(data) : '');
const publishedURL = (page, course) => pageURL(page, { course: course.courseId, version: course.version });
const journeyURL = (route, course) => route + '?' + new URLSearchParams({ journey: '1', course: course.courseId, version: course.version });
export const panel = (title, ...children) => {
  const container = node('section', null, { class: 'panel' });
  container.append(node('h2', title), ...children);
  return container;
};
export const actions = (...children) => {
  const group = node('div', null, { class: 'actions' });
  group.append(...children);
  return group;
};
export const tag = text => node('span', text, { class: 'tag' });
export const paragraph = text => node('p', text);
export const list = (items, ordered = false) => {
  const element = node(ordered ? 'ol' : 'ul');
  element.append(...items.map(item => node('li', item)));
  return element;
};
export const field = (parent, label, input) => {
  const wrapper = node('label', label);
  wrapper.append(input);
  parent.append(wrapper);
  return input;
};
export function button(label, run, primary = false) {
  const element = node('button', label, { type: 'button', class: primary ? 'primary' : '' });
  element.addEventListener('click', () => task(element, run));
  return element;
}
export async function task(control, run) {
  if (control.disabled) return;
  control.disabled = true;
  status('Working…');
  try { await run(); if (document.getElementById('status')?.textContent === 'Working…') status(); }
  catch (error) {
    status(error.message, true);
    if (error.status === 401) document.getElementById('account')?.replaceChildren(link('Sign in again', pageURL(page || 'index',
      { ...Object.fromEntries(params), signIn: '1' })));
  } finally { control.disabled = false; }
}
export async function request(op, { data, query, file } = {}) {
  const url = '/api/courses/?' + new URLSearchParams({ op, ...query });
  const writing = data !== undefined || file;
  const headers = writing ? { 'X-SkillLoop-Course': '1', 'Content-Type': file ? 'application/octet-stream' : 'application/json',
    ...(file ? { 'X-SkillLoop-Filename': encodeURIComponent(file.name) } : {}) } : undefined;
  let response;
  try {
    response = await fetch(url, { method: writing ? 'POST' : 'GET', headers, body: file ?? (writing ? JSON.stringify(data) : undefined),
      cache: 'no-store' });
  } catch { throw new Error('The course service could not be reached. Your saved work is unchanged.'); }
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) throw Object.assign(new Error(value?.error ?? (response.status === 413 ?
    'The source is too large. Use a file up to 3 MB.' : 'The course service is unavailable. Try again.')), { status: response.status });
  return value;
}

export function setIntro(text, title) {
  document.getElementById('intro').textContent = text;
  if (title) document.getElementById('title').textContent = title;
}
function loginForm(onSuccess) {
  const form = node('form');
  field(form, 'Email', node('input', null, { type: 'email', name: 'email', required: '', autocomplete: 'username' }));
  field(form, 'Password', node('input', null, { type: 'password', name: 'password', required: '', autocomplete: 'current-password' }));
  const submit = node('button', 'Sign in', { type: 'submit', class: 'primary' });
  form.append(submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(form));
    task(submit, async () => onSuccess(await request('login', { data: { email, password } })));
  });
  return panel('Sign in to SkillLoop', paragraph('Use your existing SkillLoop course account.'), form);
}
export function requireAccount(onSuccess = session => location.assign(homeFor(session.role))) {
  const login = loginForm(onSuccess);
  workspace.replaceChildren(login);
  login.querySelector('input')?.focus();
}
const homeFor = role => pageURL(role === 'teacher' ? 'studio' : 'learning');

export async function session() {
  const state = await request('session');
  const account = document.getElementById('account');
  if (state.role) {
    account.replaceChildren(button('Sign out', async () => {
      await request('logout', { data: {} });
      location.assign(pageURL('index'));
    }));
  } else {
    account.replaceChildren(button('Sign in', () => {
      const existing = document.querySelector('#sign-in');
      if (existing) { existing.querySelector('input').focus(); return; }
      const login = loginForm(result => location.assign(homeFor(result.role)));
      login.id = 'sign-in';
      workspace.prepend(login);
      login.querySelector('input').focus();
    }));
  }
  return state;
}
export function locationLabel(location) {
  return location.kind === 'url' ? 'Web excerpt ' + location.number : (location.kind === 'page' ? 'Page ' : 'Paragraph ') + location.number;
}
export function notesPanel(notes, title = 'Teacher-approved notes') {
  return panel(title, ...notes.map(note => {
    const article = node('article');
    article.append(node('h3', note.heading), node('p', note.text, { class: 'source-text' }));
    for (const { location } of note.citations) {
      const label = locationLabel(location);
      article.append(location.kind === 'url' ? node('a', label, { class: 'tag', href: location.url, rel: 'noreferrer' }) : tag(label));
    }
    return article;
  }));
}
const courseQuery = () => ({ course: params.get('course') ?? '', version: params.get('version') ?? '' });
const courseInfo = course => [tag('Version ' + course.version), tag(course.caseTitle), ...(course.level ? [tag(course.level)] : []),
  paragraph(course.summary), list(course.objectives)];
const stageLabels = { diagnosis: 'Diagnosis', learning: 'Case Learning', repair: 'Repair', verification: 'Verification' };
function cards(courses, personal) {
  const grid = node('div', null, { class: 'grid' });
  for (const course of courses) {
    const buttons = [link('View course', publishedURL('course', course), !personal)];
    if (personal) {
      buttons.unshift(link('Resume ' + stageLabels[course.stage], journeyURL(course.route, course), true));
      if (course.personalized && course.diagnosed) buttons.push(link('AI Personalized Learning', publishedURL('lesson', course)));
    }
    grid.append(panel(course.title, ...courseInfo(course), ...(personal ? [tag(course.outcome ?
      'Verification: ' + course.outcome : 'Current stage: ' + stageLabels[course.stage])] : []), actions(...buttons)));
  }
  return grid;
}

async function catalog(state) {
  setIntro('Pick an instructor-reviewed course with a real software case. Browse freely; sign in when you are ready to learn.');
  const { courses } = await request('v3-catalog');
  workspace.append(courses.length ? cards(courses, false) : panel('No published courses yet',
    paragraph('Try the demo while teachers prepare courses.'), link('Try Demo', '/learning-path/', true)));
  if (!state.role && params.get('signIn') === '1') document.querySelector('#account button')?.click();
}
async function mine(state) {
  setIntro('Resume a formal course at its saved version or revisit your personalized lesson.');
  if (!state.role) return requireAccount();
  if (state.role === 'teacher') return location.replace(pageURL('studio'));
  const { courses } = await request('v3-learning');
  workspace.append(courses.length ? cards(courses, true) : panel('No courses started',
    paragraph('A course appears here after you start it from the library.'), link('Browse Courses', pageURL('index'), true)));
}
async function overview(state) {
  const course = await request('v3-overview', { query: courseQuery() });
  setIntro(course.summary, course.title);
  const begin = async () => {
    await request('start', { data: { courseId: course.courseId, version: course.version } });
    location.assign(journeyURL('/learning-path/', course));
  };
  const controls = state.role === 'teacher' ? link('Open Teacher Studio', pageURL('studio'), true) :
    button('Start Learning', async () => {
      if (state.role === 'student') return begin();
      if (!document.getElementById('course-login')) {
        const login = loginForm(result => result.role === 'teacher' ? location.assign(pageURL('studio')) : begin());
        login.id = 'course-login';
        workspace.prepend(login);
        login.querySelector('input').focus();
      }
    }, true);
  workspace.append(panel('Course overview', tag('Version ' + course.version), tag(course.caseTitle), list(course.objectives, true),
    paragraph('Start with the diagnosis, then practise, plan a repair, and verify it using the registered case tests.'),
    actions(controls, ...(state.role === 'student' && course.personalized ?
      [link('Open AI Personalized Learning', publishedURL('lesson', course))] : []))));
  if (course.notes.length) workspace.append(notesPanel(course.notes));
}
async function lesson(state) {
  setIntro('Extra coaching based on your saved Part 1 answer. Official progress is recorded by the course practice and verification.');
  if (!state.role) return requireAccount(result => result.role === 'teacher' ? location.assign(pageURL('studio')) : location.reload());
  if (state.role === 'teacher') return location.replace(pageURL('studio'));
  let current;
  try { current = await request('v3-lesson', { query: courseQuery() }); }
  catch (error) {
    if (error.status !== 409) throw error;
    const course = { courseId: courseQuery().course, version: courseQuery().version };
    workspace.append(panel('Diagnosis required', paragraph(error.message), link('Open course', publishedURL('course', course), true)));
    return;
  }
  function render(current) {
    const { publication, context, evidenceKey, lesson, generationError, answer, feedback, feedbackError } = current;
    const base = { courseId: publication.courseId, version: publication.version, evidenceKey };
    setIntro(publication.title + ' · Version ' + publication.version);
    const priority = panel(context.requirement.text, tag(context.evidence.practiceRecommended ? 'Diagnosis priority' : 'Transfer practice'),
      paragraph(context.evidence.question), paragraph('Your Part 1 answer: ' + context.evidence.answer), node('pre', context.trace),
      actions(link('Continue to Case Learning', journeyURL('/knowledge-map/', publication)),
        link('My Learning', pageURL('learning'))));
    const instruction = lesson ? panel('Your lesson', tag('AI-generated'), node('h3', lesson.objective),
      paragraph(lesson.explanation), node('h3', 'Apply it to this case'), paragraph(lesson.caseApplication)) :
      panel('Your lesson', paragraph(generationError ?? 'Generate a lesson for this diagnosed requirement. The notes below are available now.'),
        button(generationError ? 'Retry generation' : 'Generate personalized lesson', async () => {
          const result = await request('v3-generate-lesson', { data: base }); render(result);
          if (result.generationError) status(result.generationError, true);
        }, true));
    const onlyCited = lesson ? context.notes.filter(note => lesson.sourceReferences.some(ref => ref.noteId === note.id)) : context.notes;
    workspace.replaceChildren(priority, instruction, notesPanel(onlyCited));
    if (!lesson) return;
    const form = node('form');
    const response = field(form, 'Your reasoning', node('textarea', answer, { required: '', maxlength: '1800', rows: '5' }));
    const submit = node('button', feedbackError ? 'Retry feedback' : 'Save answer and get feedback', { type: 'submit', class: 'primary' });
    form.append(submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      task(submit, async () => {
        const result = await request('v3-answer', { data: { ...base, answer: response.value } });
        render(result);
        status(result.feedbackError ? 'Answer saved. ' + result.feedbackError : 'Answer saved.');
      });
    });
    workspace.append(panel('Supplemental practice', paragraph(lesson.practicePrompt), form,
      ...(feedback ? [node('h3', 'AI feedback'), paragraph(feedback.feedback), paragraph(feedback.nextStep)] : []),
      ...(feedbackError ? [paragraph('Answer saved. ' + feedbackError)] : [])));
  }
  render(current);
}

if (!page) {
  // The anonymous landing page remains available when course sign-in is unavailable.
  request('session').then(state => { if (state.role) location.replace(homeFor(state.role)); }).catch(() => {});
} else if (page !== 'studio') {
  (async () => {
    status('Loading…');
    const state = await session().catch(error => { if (page !== 'index' && page !== 'course') throw error; return { role: null }; });
    await ({ index: catalog, learning: mine, course: overview, lesson })[page](state);
    if (document.getElementById('status').textContent === 'Loading…') status();
  })().catch(error => status(error.message, true));
}
