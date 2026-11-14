const get = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const identity = { courseId: params.get('course'), version: params.get('version') };
const query = { course: identity.courseId, version: identity.version };
let release;
let role;
let attempt;
let practiceBusy = false;

function renderPractice() {
  get('reopen-practice').hidden = true;
  get('learner-sign-in').hidden = Boolean(role);
  get('learner-sign-out').hidden = !role;
  get('start-practice').hidden = role !== 'student' || Boolean(attempt);
  get('response-form').hidden = role !== 'student' || !attempt;
  get('practice-status').textContent = role === 'teacher' ? 'Teacher view. Sign in as a learner to record practice.' :
    attempt?.submittedAt ? 'Practice submitted. Your responses are saved to this version.' :
      attempt ? 'Practice started. Submit when all responses are ready.' : '';
  const responses = get('responses');
  responses.replaceChildren();
  if (!attempt) return;
  for (const exercise of release.lesson.exercises) {
    const label = courseElement('label', exercise.prompt);
    const field = courseElement('textarea');
    field.name = exercise.exerciseId;
    field.rows = 4;
    field.maxLength = 2000;
    field.required = true;
    field.readOnly = Boolean(attempt.submittedAt);
    field.value = attempt.responses?.[exercise.exerciseId] || '';
    label.append(field);
    responses.append(label);
  }
  get('submit-practice').hidden = Boolean(attempt.submittedAt);
}

async function learnerAccount(nextRole) {
  role = nextRole;
  attempt = null;
  renderPractice();
  if (role === 'student') ({ attempt } = await courseRequest('attempt', { query }));
  renderPractice();
}

function practiceError(error, submitting = false) {
  if (submitting && (error.code === 'attempt-mismatch' || error.status === 401)) {
    get('reopen-practice').hidden = false;
    get('practice-status').textContent = error.status === 401
      ? 'Sign in to the original account in another tab to retry, or reopen the exercise. Your response is still here.'
      : error.message;
    return;
  }
  if (error.status === 401) {
    role = null;
    attempt = null;
    renderPractice();
  }
  get('practice-status').textContent = error.message;
}

function practiceAction(task, { submitting = false } = {}) {
  return async (event) => {
    event.preventDefault();
    if (practiceBusy) return;
    practiceBusy = true;
    const controls = [start, submit, signOut, reopen];
    controls.forEach((button) => { button.disabled = true; });
    try { await task(); } catch (error) { practiceError(error, submitting); }
    finally {
      controls.forEach((button) => { button.disabled = false; });
      practiceBusy = false;
    }
  };
}

signIn(get('learner-sign-in'), learnerAccount, practiceError);
const start = get('start-practice');
start.addEventListener('click', practiceAction(async () => {
  ({ attempt } = await courseRequest('start', { body: identity }));
  renderPractice();
}));
const submit = get('submit-practice');
get('response-form').addEventListener('submit', practiceAction(async () => {
  const responses = Object.fromEntries(new FormData(get('response-form')));
  ({ attempt } = await courseRequest('submit', {
    body: { ...identity, attemptId: attempt.attemptId, responses },
  }));
  renderPractice();
}, { submitting: true }));
const signOut = get('learner-sign-out');
signOut.addEventListener('click', practiceAction(async () => {
  await courseRequest('logout', { body: {} });
  await learnerAccount(null);
}));
const reopen = get('reopen-practice');
reopen.addEventListener('click', () => {
  if (window.confirm('Reopen the exercise with your current sign-in? Unsaved responses in this tab will be discarded.')) {
    window.location.reload();
  }
});

async function loadLesson() {
  release = await courseRequest('published', { query });
  const { lesson } = release;
  get('lesson-title').textContent = lesson.title;
  get('lesson-version').textContent = `SkillLoop · Course version ${release.version} · ${lesson.caseRef.caseId}@${lesson.caseRef.caseVersion}`;
  document.title = lesson.title + ' · SkillLoop';
  renderLesson(get('student-lesson'), lesson);
  get('lesson-status').textContent = '';
  get('student-lesson').hidden = false;
  const journey = get('open-journey');
  const journeyUrl = new URL('/learning-path/', location.origin);
  journeyUrl.search = new URLSearchParams({ journey: '1', ...query });
  journey.href = journeyUrl;
  journey.hidden = false;
  get('practice').hidden = false;
  try {
    const session = await courseRequest('session');
    await learnerAccount(session.role);
  } catch (error) {
    renderPractice();
    practiceError(error);
  }
}
loadLesson().catch((error) => { get('lesson-status').textContent = error.message; });
