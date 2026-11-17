import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startM4Stack } from './m4-local-stack.mjs';
import { client } from './m5-test-support.mjs';

export const sourceFile = new URL('../docs/enhancement-v3/cart-checkout-source.txt', import.meta.url);
const fixture = new URL('./enhancement-v3-ai-fixture.mjs', import.meta.url).href;

test('v3 sends reviewed content through the formal Journey and isolates revision, learner, and model output', { timeout: 120000 }, async t => {
  const stack = await startM4Stack(t, { appImports: [fixture] });
  const call = client(stack);
  const login = (name) => call('login', { body: stack.accounts[name] });
  const teacher = await login('teacher');
  const otherTeacher = await login('other-teacher');
  const a = await login('student');
  const b = await login('other-student');
  const source = await readFile(sourceFile);
  const upload = async (cookie, data, origin = stack.base) => {
    const response = await fetch(stack.base + '/api/courses/?op=v3-import-file', {
      method: 'POST', body: data, headers: { Cookie: cookie, Origin: origin,
        'Content-Type': 'application/octet-stream', 'X-SkillLoop-Filename': 'checkout.txt', 'X-SkillLoop-Course': '1' },
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await upload(a, source)).status, 403);
  assert.equal((await upload(teacher, source, 'https://evil.example')).status, 403);
  const malformed = (await upload(teacher, 'Document about an unrelated topic.')).data;
  await call('v3-generate', { cookie: teacher, body: { id: malformed.id, revision: malformed.revision }, status: 422 });
  assert.equal((await call('v3-open', { cookie: teacher, query: { draft: malformed.id } })).source.fragments.length, 1);

  const uploaded = await upload(teacher, source);
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
  let draft = uploaded.data;
  const draftQuery = { draft: draft.id };
  const write = (op, input = {}, status = 200) => call('v3-' + op,
    { cookie: teacher, body: { id: draft.id, revision: draft.revision, ...input }, status });
  await call('v3-open', { query: draftQuery, status: 401 });
  await call('v3-open', { cookie: 'sl_course_access=expired-test-token', query: draftQuery, status: 401 });
  await call('v3-open', { cookie: otherTeacher, query: draftQuery, status: 404 });
  await call('v3-open', { cookie: a, query: draftQuery, status: 403 });
  assert.deepEqual((await call('v3-catalog')).courses, []);
  draft = await write('generate');
  assert.equal(draft.ai.model, 'v3-test-model');
  await write('save', { revision: 1, content: draft.content }, 409);
  const pristine = draft.content;
  draft = await write('save', { content: { ...pristine, objectives: ['Describe interpolation methods.', 'Apply interpolation to a curve.'] } });
  draft = await write('match');
  assert.deepEqual(draft.choices, []);
  draft = await write('save', { content: pristine });
  draft = await write('match');
  assert.equal(draft.choices.length, 1);
  assert.deepEqual(draft.choices[0].mapping.map(link => link.requirementId), ['empty-cart', 'discount']);
  draft = await write('select', { selection: 0, confirm: true });
  const preview = await write('preview');
  assert.equal(preview.notes[0].citations[0].location.number, 2);
  assert.equal(preview.notes[0].citations[0].quote, undefined);
  await write('publish', { confirm: true }, 409);
  await call('v3-review', { cookie: a, body: { id: draft.id, revision: draft.revision, confirm: true }, status: 403 });
  await write('review', { confirm: true });
  const v1 = await write('publish', { confirm: true });
  assert.deepEqual(await write('publish', { confirm: true }), v1);
  assert.equal((await call('list', { cookie: teacher })).courses.length, 0);
  await call('open', { cookie: teacher, query: { course: v1.courseId }, status: 404 });
  assert.equal((await call('v3-catalog')).courses[0].title, pristine.title);
  assert.doesNotMatch(JSON.stringify(await call('v3-catalog')), /teacherAnswerGuidance|fragments|numeric zero before dividing/);
  const query = { course: v1.courseId, version: v1.version };
  const versionInput = { courseId: v1.courseId, version: v1.version };
  const publicV1 = await call('v3-overview', { query });
  assert.equal(publicV1.mode, 'journey');
  assert.equal((await call('v3-entry', { cookie: a, query })).started, false);
  const old = await call('published', { query });
  assert.equal(old.lesson.caseRef.caseId, 'cart-checkout');
  assert.equal(old.lesson.objectives.length, 2);
  assert.equal(old.lesson.exercises.length, 2);

  async function diagnose(cookie, weak) {
    await call('start', { cookie, body: versionInput });
    const stage = 'diagnosis';
    const view = await call('journey', { cookie, query: { ...query, stage } });
    await call('journey', { cookie, body: { ...versionInput, stage, attemptId: view.attemptId, revision: view.revision,
      input: { answers: Object.fromEntries(view.questions.map(question => [
        question.id, { optionId: question.id === weak ? 'off' : 'best', explanation: '' },
      ])) } } });
    return view.attemptId;
  }
  const attemptId = await diagnose(a, 'cart-checkout-code-reading');
  assert.equal((await call('v3-begin', { cookie: a, body: versionInput })).route, '/knowledge-map/');
  assert.equal((await call('native-start', { cookie: a, body: versionInput, status: 409 })).code, 'course-mode-mismatch');
  await call('v3-lesson', { cookie: b, query, status: 409 });
  await diagnose(b, 'cart-checkout-edge-cases');
  const lesson = cookie => call('v3-lesson', { cookie, query });
  const baseA = await lesson(a), baseB = await lesson(b);
  assert.equal(baseA.attemptId, attemptId);
  assert.equal(baseA.context.requirement.id, 'empty-cart');
  assert.equal(baseB.context.requirement.id, 'discount');
  const generate = (cookie, evidenceKey, status = 200) => call('v3-generate-lesson',
    { cookie, body: { ...versionInput, evidenceKey }, status });
  await generate(b, baseA.evidenceKey, 409);
  const learnedA = await generate(a, baseA.evidenceKey);
  const learnedB = await generate(b, baseB.evidenceKey);
  assert.notEqual(learnedA.lesson.practicePrompt, learnedB.lesson.practicePrompt);
  assert.deepEqual(learnedA.lesson, (await generate(a, baseA.evidenceKey)).lesson);
  const answer = text => call('v3-answer', { cookie: a, body: { ...versionInput, evidenceKey: baseA.evidenceKey, answer: text } });
  const failed = await answer('Testing feedback failure');
  assert.match(failed.feedbackError, /temporarily unavailable/);
  assert.equal((await lesson(a)).answer, 'Testing feedback failure');
  const gotFeedback = await answer('An empty input must return numeric zero.');
  assert.ok(gotFeedback.feedback);
  assert.equal((await lesson(b)).answer, null);
  await call('journey', { cookie: a, query: { ...query, stage: 'repair' }, status: 409 });
  draft = await write('save', { content: { ...pristine, notes: pristine.notes.map((note, i) =>
    i === 0 ? { ...note, heading: 'Empty checkout boundary' } : note) } });
  await write('publish', { confirm: true }, 409);
  draft = await write('match');
  draft = await write('select', { selection: 0, confirm: true });
  await write('review', { confirm: true });
  // Induce a failure after the official version insert to prove it rolls back with the v3 snapshot.
  await stack.admin.query('alter table skillloop_courses.v3_publication_paths add constraint test_rollback check (version < 2)');
  try {
    await write('publish', { confirm: true }, 503);
    await call('published', { query: { ...query, version: 2 }, status: 404 });
  } finally {
    await stack.admin.query('alter table skillloop_courses.v3_publication_paths drop constraint test_rollback');
  }
  await stack.restartApp({ publishNative: true });
  const v2 = await write('publish', { confirm: true });
  assert.equal(v2.mode, 'native');
  await assert.rejects(stack.admin.query('update skillloop_courses.v3_publication_paths set mode = mode'), { code: '55000' });
  await assert.rejects(stack.admin.query('update skillloop_courses.v3_publications set snapshot = snapshot'),
    { code: '55000' });
  assert.equal(v2.courseId, v1.courseId);
  assert.equal(v2.version, 2);
  assert.deepEqual(await call('v3-overview', { query }), publicV1);
  assert.equal((await call('v3-catalog')).courses[0].version, 2);
  const personal = await call('v3-learning', { cookie: a });
  assert.deepEqual(personal.courses.map(item => [item.version, item.stage]), [[1, 'learning']]);
  await call('v3-learning', { status: 401 });
  await stack.restartApp();
  assert.deepEqual((await lesson(a)).lesson, learnedA.lesson);
  assert.deepEqual((await lesson(a)).feedback, gotFeedback.feedback);
});
