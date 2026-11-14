let courseId = null;
let courseReviewed = false;
let publishedVersions = [];
let courseActivity = [];
let busy = false;
let reviewedPreview = false;
let caseLoaded = false;

function updateCourseStatus() {
  $('#editing-state').textContent = dirty ? 'Unsaved edits. Save before reviewing.' :
    acceptedDraft ? 'All edits saved.' : 'Add material and save your new draft.';
  const revision = acceptedDraft?.revision;
  const published = publishedVersions.find((version) => version.draftRevision === revision);
  $('#revision-state').textContent = revision ? `Draft revision ${revision}` : '';
  $('#release-status').textContent = published ? `Revision ${revision} was released as version ${published.version}.` :
    courseReviewed ? `Revision ${revision} is approved and ready to publish.` :
      revision ? `Revision ${revision} needs review.` : 'Save a draft to start review.';
  $('#review-card').hidden = dirty || !reviewedPreview || courseReviewed;
  $('#review-course').disabled = busy || !revision || dirty || courseReviewed;
  $('#approve-course').disabled = busy || dirty || !reviewedPreview || !$('#review-confirm').checked;
  $('#publish-course').disabled = busy || !courseReviewed || dirty || Boolean(published);
  $('#open-course').disabled = busy || !$('#course-list').value;
  $('#new-course').disabled = busy;
  $('#course-sign-out').disabled = busy;
  $('#save-course').disabled = busy;
}

function action(task, target = '#message') {
  return async (event) => {
    event?.preventDefault();
    if (busy) return;
    clearErrors();
    $('#course-status').textContent = '';
    busy = true;
    $('#editor').inert = true;
    updateCourseStatus();
    try {
      await task();
    } catch (error) {
      if (error.status === 409 && courseId) {
        $('#conflict-warning').hidden = false;
        $('#conflict-warning').textContent = error.message;
        $('#reload-latest').hidden = false;
      }
      if (error.status === 401) {
        $('#course-sign-in').hidden = false;
        $('#course-sign-out').hidden = true;
        $('#account-status').textContent = 'Your session expired. Sign in again to continue.';
      }
      if (target === '#message') showError(error);
      else $(target).textContent = error.message;
    } finally {
      busy = false;
      $('#editor').inert = false;
      updateCourseStatus();
    }
  };
}

async function loadCase() {
  if (caseLoaded) return;
  ({ case: caseFacts } = await courseRequest('case'));
  $('#facts-title').textContent = caseFacts.title;
  $('#case-scenario').textContent = caseFacts.scenario;
  $('#case-claim').textContent = caseFacts.aiClaim;
  $('#requirements').replaceChildren(...caseFacts.requirements.map(({ text }) => element('li', text)));
  $('#starter-code').textContent = caseFacts.starterCode;
  caseLoaded = true;
}

async function refreshCourseList() {
  const { courses } = await courseRequest('list');
  $('#course-list').replaceChildren(element('option', 'Choose a course'), ...courses.map((course) => {
    const option = element('option', `${course.title} · revision ${course.revision}`);
    option.value = course.id;
    return option;
  }));
  $('#course-list').options[0].value = '';
  $('#course-list').value = courseId || '';
  $('#course-status').textContent = courses.length ? '' : 'Create your first course from the checkout case.';
  updateCourseStatus();
}

function selectCourse(data) {
  courseId = data?.id ?? null;
  acceptedDraft = data?.draft ?? null;
  courseReviewed = data?.reviewed ?? false;
  publishedVersions = data?.versions ?? [];
  courseActivity = data?.engagement ?? [];
  reviewedPreview = false;
  $('#review-confirm').checked = false;
  $('#review-lesson').replaceChildren();
  renderForm(acceptedDraft);
  $('#course-work').hidden = false;
  const releaseList = $('#release-list');
  releaseList.replaceChildren();
  if (!publishedVersions.length) releaseList.append(element('li', 'No published versions.'));
  for (const release of publishedVersions) {
    const item = element('li');
    const link = element('a', `Version ${release.version} · ${release.title}`);
    const url = new URL('/enhancement-v2/studio/learner/', window.location.origin);
    url.search = new URLSearchParams({ course: courseId, version: release.version });
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    const activity = courseActivity.find(({ version }) => version === release.version);
    item.append(link, element('div', `Draft revision ${release.draftRevision} · ${new Date(release.publishedAt).toLocaleString()}`),
      element('div', `${activity.started} started · ${activity.submitted} submitted`));
    releaseList.append(item);
  }
}

async function reopen(id, confirm = true) {
  if (confirm && dirty && !window.confirm('Reopen the saved draft and discard unsaved edits?')) {
    $('#course-list').value = courseId || '';
    return;
  }
  const data = await courseRequest('open', { query: { course: id } });
  selectCourse(data);
  $('#course-list').value = courseId;
  $('#course-status').textContent = `Opened ${data.draft.content.title}.`;
}

let signedInAccount = null;

async function account(role, accountId) {
  if (signedInAccount && signedInAccount !== accountId) {
    selectCourse(null);
    $('#course-work').hidden = true;
  }
  signedInAccount = accountId || null;
  $('#course-sign-in').hidden = Boolean(role);
  $('#course-sign-out').hidden = !role;
  $('#teacher-workspace').hidden = true;
  $('#account-status').textContent = role === 'teacher' ? 'Signed in as a teacher.' :
    role ? 'This Studio requires a teacher account. Sign out to switch accounts.' : 'Sign in to open your courses.';
  if (role === 'teacher') {
    try {
      await loadCase();
      await refreshCourseList();
      $('#teacher-workspace').hidden = false;
    } catch (error) {
      $('#account-status').textContent = error.message;
    }
  }
}

const revisionRequest = () => ({ courseId, revision: acceptedDraft?.revision ?? null, confirm: true });

async function applyTemplate(level) {
  if (dirty && !window.confirm('Replace the current form with the Mock example?')) return;
  const beginner = level === 'beginner';
  const brief = { topic: beginner ? 'Empty cart and numeric averages' : 'Discount boundary validation',
    learnerLevel: level, constraints: beginner ? 'Use a simple trace.' : 'Check both endpoints.',
    objectives: [{ objectiveId: beginner ? 'obj-empty-cart' : 'obj-discount',
      text: beginner ? 'Explain the empty-cart average result.' : 'Check both inclusive discount endpoints.',
      requirementIds: [beginner ? 'empty-cart' : 'discount'] }] };
  const { proposal } = await courseRequest('mock', { body: { brief } });
  const { title, objectives, explanation, codeExample, exercises } = proposal;
  renderForm({ brief, content: { title, objectives, explanation, codeExample, exercises } });
  reviewedPreview = false;
  markDirty();
  $('#message').textContent = 'Mock example loaded into the form. Edit and save it as teacher-authored material.';
}

signIn($('#course-sign-in'), account, (error) => { $('#account-status').textContent = error.message; });
$('#course-sign-out').addEventListener('click', action(async () => {
  if (dirty && !window.confirm('Sign out and discard unsaved edits?')) return;
  await courseRequest('logout', { body: {} });
  await account(null);
  $('#course-list').replaceChildren();
}, '#account-status'));
$('#new-course').addEventListener('click', action(async () => {
  if (dirty && !window.confirm('Create a new draft and discard unsaved edits?')) return;
  selectCourse(null);
  $('#course-list').value = '';
  $('#start-title').setAttribute('tabindex', '-1');
  $('#start-title').focus();
}, '#course-status'));
$('#open-course').addEventListener('click', action(() => reopen($('#course-list').value), '#course-status'));
$('#reload-latest').addEventListener('click', action(() => reopen(courseId)));
$('#course-list').addEventListener('change', updateCourseStatus);
$('#editor').addEventListener('input', () => { reviewedPreview = false; markDirty(); });
$('#editor').addEventListener('change', markDirty);
$('#add-objective').addEventListener('click', () => { addObjective(); markDirty(); });
$('#add-exercise').addEventListener('click', () => { addExercise(); markDirty(); });
$('#empty-template').addEventListener('click', action(() => applyTemplate('beginner')));
$('#discount-template').addEventListener('click', action(() => applyTemplate('intermediate')));
$('#editor').addEventListener('submit', action(async () => {
  const saved = await courseRequest('save', { body: { ...revisionRequest(), form: collectForm() } });
  const sameCourse = saved.id === courseId;
  selectCourse({ ...saved, reviewed: sameCourse && courseReviewed && saved.draft.revision === acceptedDraft?.revision,
    versions: sameCourse ? publishedVersions : [], engagement: sameCourse ? courseActivity : [] });
  await refreshCourseList();
  $('#message').textContent = `Saved revision ${acceptedDraft.revision}.`;
}));
$('#preview-button').addEventListener('click', action(async () => {
  invalidatePreview();
  const { lesson } = await courseRequest('preview', { body: { form: collectForm() } });
  renderPreview(lesson);
}));
$('#review-course').addEventListener('click', action(async () => {
  const saved = await courseRequest('open', { query: { course: courseId } });
  if (saved.draft.revision !== acceptedDraft.revision) {
    throw Object.assign(new Error('A newer draft was saved. Reopen it before review.'), { status: 409 });
  }
  const { brief, content } = saved.draft;
  const { lesson } = await courseRequest('preview', { body: { form: { brief, content } } });
  renderLesson($('#review-lesson'), lesson, 4);
  $('#review-title').textContent = `Review revision ${saved.draft.revision} · ${lesson.title}`;
  $('#review-confirm').checked = false;
  reviewedPreview = true;
  $('#review-card').hidden = false;
  $('#review-title').focus();
}));
$('#review-confirm').addEventListener('change', updateCourseStatus);
$('#approve-course').addEventListener('click', action(async () => {
  if (!reviewedPreview || dirty || !$('#review-confirm').checked) return;
  await courseRequest('review', { body: revisionRequest() });
  courseReviewed = true;
  reviewedPreview = false;
  $('#message').textContent = `Approved revision ${acceptedDraft.revision}. You can publish it now.`;
}));
$('#publish-course').addEventListener('click', action(async () => {
  if (!window.confirm(`Publish a public, fixed version from revision ${acceptedDraft.revision}?`)) return;
  const result = await courseRequest('publish', { body: revisionRequest() });
  await reopen(courseId, false);
  $('#message').textContent = `Published version ${result.version}. Share its student link below.`;
}));

courseRequest('session').then(({ role, accountId }) => account(role, accountId)).catch((error) => {
  $('#course-sign-in').hidden = false;
  $('#account-status').textContent = error.message;
});
