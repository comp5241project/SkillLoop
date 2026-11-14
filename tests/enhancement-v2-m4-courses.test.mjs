import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startM4Stack } from './m4-local-stack.mjs';

const privateAnswer = 'Private marker: assert the empty cart returns numeric zero before division.';
const studioPath = '/enhancement-v2/studio/';

function api(stack) {
  return (op, { body, query, cookie, origin, headers } = {}) => fetch(
    `${stack.base}/api/courses?${new URLSearchParams({ op, ...query })}`,
    { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json',
        Origin: origin || stack.base, 'X-SkillLoop-Course': '1' }),
      ...(cookie ? { Cookie: cookie } : {}), ...headers } });
}

async function expect(response, status = 200) {
  const result = await response;
  const data = await result.json();
  assert.equal(result.status, status, JSON.stringify(data));
  return data;
}

async function login(call, account, role) {
  const response = await call('login', { body: { email: account.email, password: account.password } });
  assert.deepEqual(await expect(response), { role, accountId: account.id });
  const header = response.headers.get('set-cookie');
  assert.match(header, /HttpOnly; SameSite=Lax/);
  assert.match(header, /Path=\/api\/courses/);
  return header.split(';')[0];
}

async function makeForm(call) {
  const { case: sample } = await expect(call('case'));
  const excerpt = sample.starterCode.split('\n').find((line) => line.includes('averagePrice')).trim();
  const refs = ['empty-cart'];
  return { brief: { topic: 'Investigate an empty cart', learnerLevel: 'beginner', constraints: '',
    objectives: [{ objectiveId: 'obj-empty', text: 'Trace the empty checkout.', requirementIds: refs }] },
  content: { title: 'Empty cart returns zero', explanation: 'Trace the computation before the average is returned. <b>Read carefully.</b>',
    objectives: [{ objectiveId: 'obj-empty', text: 'Predict the empty-cart result.', requirementIds: refs }],
    codeExample: { kind: 'trace', excerpt, prompt: 'Trace the function with no checkout items.' },
    exercises: [{ exerciseId: 'ex-empty', kind: 'short-answer', prompt: 'What should the cart return with no items?',
      requirementIds: refs, publicHints: ['Compare the empty cart requirement.'], teacherAnswerGuidance: [privateAnswer] }] } };
}

async function withRole(client, actor, operation, role = 'skillloop_course_server') {
  await client.query('begin');
  try {
    await client.query('set local role ' + role);
    await client.query("select set_config('skillloop.course_actor', $1, true)", [actor || '']);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor || '']);
    return await operation();
  } finally {
    await client.query('rollback');
  }
}

test('M4 publication runs through HTTP, migrated PostgreSQL and a fresh application process', { timeout: 120000 }, async (t) => {
  const stack = await startM4Stack(t);
  const call = api(stack);
  const teacher = await login(call, stack.accounts.teacher, 'teacher');
  const otherTeacher = await login(call, stack.accounts['other-teacher'], 'teacher');
  const student = await login(call, stack.accounts.student, 'student');
  const otherStudent = await login(call, stack.accounts['other-student'], 'student');
  const form = await makeForm(call);

  for (const path of ['/', '/learning-path/', '/knowledge-map/', '/interview/', '/correction-lab/',
    studioPath + 'course.html', studioPath + 'course/', studioPath + 'learner.html', studioPath + 'learner/', studioPath + 'course.js']) {
    assert.equal((await fetch(stack.base + path)).status, 200, path);
  }
  for (const path of ['/enhancement-v2/m4-courses.mjs', '/enhancement-v2/m3-teacher-draft.cjs',
    '/supabase/migrations/20261114181729_m4_course_publication.sql']) {
    assert.equal((await fetch(stack.base + path)).status, 404, path);
  }
  await expect(call('login', { body: { email: stack.accounts.teacher.email, password: 'wrong' } }), 401);
  await expect(call('save', { body: { courseId: null, form } }), 401);
  await expect(call('save', { cookie: student, body: { courseId: null, form } }), 403);
  await expect(call('save', { cookie: teacher, origin: 'http://evil.test', body: { courseId: null, form } }), 403);
  await expect(call('save', { cookie: teacher, body: { courseId: null, form: {} } }), 422);
  assert.deepEqual(await expect(call('list', { cookie: teacher })), { courses: [] });

  const saved = await expect(call('save', { cookie: teacher, body: { courseId: null, form } }), 201);
  const courseId = saved.id;
  const query = { course: courseId, version: 1 };
  const first = { courseId, revision: 1, confirm: true };
  const check = (op, cookie, body = first) => call(op, { cookie, body });
  const open = (cookie) => call('open', { query, cookie });
  assert.equal(saved.draft.revision, 1);
  await expect(open(), 401);
  await expect(open(student), 403);
  await expect(open(otherTeacher), 404);
  await expect(call('published', { query }), 404);
  await expect(check('save', otherTeacher, { ...first, form }), 404);
  await expect(check('review', student), 403);
  await expect(check('review', otherTeacher), 404);
  await expect(check('publish', student), 403);
  await expect(check('publish', otherTeacher), 404);
  await expect(check('publish', teacher), 409);
  await expect(check('review', teacher, { ...first, confirm: false }), 400);
  await expect(check('review', teacher));
  const tooShort = { ...form, content: { ...form.content, explanation: 'Missing' } };
  await expect(check('save', teacher, { ...first, form: tooShort }), 422);
  assert.equal((await expect(open(teacher))).reviewed, true);

  await stack.restartApp();
  const reLogged = await login(call, stack.accounts.teacher, 'teacher');
  const reopened = await expect(open(reLogged));
  assert.deepEqual(reopened.draft, saved.draft);
  assert.equal(reopened.reviewed, true);
  const duplicates = await Promise.all([check('publish', reLogged), check('publish', reLogged)].map((r) => expect(r)));
  assert.deepEqual(duplicates[0], duplicates[1]);
  const publicVersion = await expect(call('published', { query }));
  assert.equal(publicVersion.version, 1);
  assert.deepEqual(publicVersion.lesson.caseRef, { kind: 'case-bound', caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases' });
  assert.match(publicVersion.lesson.context.title, /checkout/i);
  assert.doesNotMatch(JSON.stringify(publicVersion), /Private marker|teacherAnswerGuidance|provenance|referenceCode|publicFactsDigest/);
  assert.deepEqual(await expect(call('published', { query, cookie: student })), publicVersion);

  const next = structuredClone(form);
  next.content.title = 'A clearer empty-cart lesson';
  const concurrent = await Promise.all([next, { ...next, content: { ...next.content, title: 'Another lesson title' } }]
    .map((edit) => check('save', reLogged, { ...first, form: edit })));
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  const second = { ...first, revision: 2 };
  await expect(check('publish', reLogged), 409);
  await expect(check('publish', reLogged, second), 409);
  assert.equal((await expect(open(reLogged))).reviewed, false);
  assert.deepEqual(await expect(call('published', { query })), publicVersion);
  await expect(check('review', reLogged, second));
  assert.equal((await expect(check('publish', reLogged, second))).version, 2);

  const practice = { courseId, version: 1 };
  const responses = { 'ex-empty': 'An empty cart should return 0.' };
  await expect(check('start', reLogged, practice), 403);
  await expect(check('start', null, practice), 401);
  await expect(check('start', student, { ...practice, version: 999 }), 404);
  await expect(check('submit', student, { ...practice, responses }), 409);
  const started = await expect(check('start', student, practice));
  assert.deepEqual(await expect(check('start', student, practice)), started);
  await expect(check('submit', student, { ...practice, responses: { extra: 'wrong exercise' } }), 422);
  const submitted = await expect(check('submit', student, { ...practice, responses }));
  assert.deepEqual(await expect(check('submit', student, { ...practice, responses })), submitted);
  await expect(check('submit', student, { ...practice, responses: { 'ex-empty': 'A replacement' } }), 409);
  assert.deepEqual(await expect(call('attempt', { query, cookie: otherStudent })), { attempt: null });
  assert.deepEqual((await expect(open(reLogged))).engagement, [
    { version: 2, started: 0, submitted: 0 }, { version: 1, started: 1, submitted: 1 },
  ]);

  await stack.restartApp();
  const studentAgain = await login(call, stack.accounts.student, 'student');
  assert.deepEqual(await expect(call('attempt', { query, cookie: studentAgain })), submitted);
  assert.deepEqual(await expect(call('published', { query })), publicVersion);

  const { admin, runtime } = stack;
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await assert.rejects(withRole(admin, stack.accounts.teacher.id, () =>
      admin.query('select draft from skillloop_courses.courses'), role), { code: '42501' });
  }
  const roleChange = await withRole(admin, stack.accounts.student.id, () =>
    admin.query("update public.skillloop_roles set role = 'teacher' where user_id = auth.uid()"), 'authenticated');
  assert.equal(roleChange.rowCount, 0);
  await admin.query("update skillloop_roles set role = 'student' where user_id = $1", [stack.accounts.teacher.id]);
  await expect(open(reLogged), 403);
  await admin.query("update skillloop_roles set role = 'teacher' where user_id = $1", [stack.accounts.teacher.id]);
  const client = await runtime.connect();
  try {
    for (const actor of [null, stack.accounts.student.id, stack.accounts['other-teacher'].id]) {
      const read = await withRole(client, actor, () => client.query('select draft from skillloop_courses.courses'));
      assert.equal(read.rowCount, 0);
      const write = await withRole(client, actor, () => client.query("update skillloop_courses.courses set updated_at = now()"));
      assert.equal(write.rowCount, 0);
      await assert.rejects(withRole(client, actor, () => client.query(`insert into skillloop_courses.versions
        (course_id,version,draft_revision,snapshot,reviewed_at,published_by) values ($1,9,2,'{}',now(),$2)`,
      [courseId, actor])), { code: '42501' });
    }
    const privateRows = await withRole(client, stack.accounts.teacher.id, () =>
      client.query('select responses from skillloop_courses.attempts'));
    assert.equal(privateRows.rowCount, 0);
    await assert.rejects(withRole(client, stack.accounts.teacher.id, () =>
      client.query("update skillloop_courses.versions set snapshot = '{}'")), { code: '42501' });
    await assert.rejects(admin.query("update skillloop_courses.versions set snapshot = '{}'"), { code: '55000' });
    await assert.rejects(admin.query('delete from skillloop_courses.versions'), { code: '55000' });
    const audit = await admin.query('select published_by, reviewed_at, published_at from skillloop_courses.versions');
    assert.equal(audit.rowCount, 2);
    assert.ok(audit.rows.every((row) => row.published_by === stack.accounts.teacher.id && row.reviewed_at <= row.published_at));
  } finally { client.release(); }
});
