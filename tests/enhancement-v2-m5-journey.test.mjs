import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startM4Stack } from './m4-local-stack.mjs';
import { checkout, retryQueue, client, publishCourse } from './m5-test-support.mjs';
import journey from '../enhancement-v2/m5-journey.cjs';

test('a failed or invalid local proposal falls back to public authored teaching', async () => {
  const publication = { courseId: 'test-course', version: 1, lesson: {
    caseRef: checkout, title: 'Published companion', explanation: 'Read the published material.',
    objectives: [], exercises: [],
  } };
  const item = journey.context(publication);
  const input = { answers: Object.fromEntries(item.diagnosis.questions.map(({ id }) => [id, {
    optionId: id === 'cart-checkout-edge-cases' ? 'off' : 'best', explanation: '',
  }])) };
  const state = await journey.advance(item, {}, 'diagnosis', input);
  const instance = { journey: state, attempt_id: 'test-attempt' };
  for (const generate of [async () => { throw Error('unavailable'); },
    async () => ({ publicCard: { explanation: 'Tests have passed.' }, internalAssessment: {} })]) {
    const result = await journey.journeyView(publication, {
      ...item, teaching: { ...item.teaching, templateProvider: { generate } },
    }, instance, 'learning');
    assert.equal(result.teaching.source, 'authored-fallback');
    assert.equal(result.teaching.aiState, 'validation-fallback');
    assert.match(result.teaching.card.explanation, /inclusive interval/);
    assert.doesNotMatch(JSON.stringify(result), /Tests have passed|internalAssessment/);
  }
});

test('published M5 journey binds diagnosis, teaching, repair and executed verification to each owned attempt', { timeout: 120000 }, async (t) => {
  const stack = await startM4Stack(t);
  const call = client(stack);
  const login = (name) => {
    const { email, password } = stack.accounts[name];
    return call('login', { body: { email, password } });
  };
  const teacher = await login('teacher'), a = await login('student'), b = await login('other-student');
  assert.deepEqual((await call('cases')).cases.map(({caseId}) => caseId), ['cart-checkout', 'retry-queue']);
  const course = await publishCourse(call, teacher, checkout, 'empty-cart', 'Checkout lesson v1');
  const identity = { courseId: course.id, version: course.version };
  const query = { course: course.id, version: course.version };
  const get = (cookie, stage, status = 200) => call('journey', { cookie, query: { ...query, stage }, status });
  const post = (cookie, view, stage, input, status = 200, overrides = {}) => call('journey', { cookie, status,
    body: { ...identity, stage, attemptId: view.attemptId, revision: view.revision, input, ...overrides } });
  const answers = (view, off) => ({ answers: Object.fromEntries(view.questions.map(({ id }) => [id, {
    optionId: id === off ? 'off' : 'best', explanation: id === off ? 'I expected the calculation to work directly.' : '',
  }])) });
  await get(undefined, 'diagnosis', 401);
  await get(teacher, 'diagnosis', 403);
  await call('start', { cookie: a, body: identity });
  await call('start', { cookie: b, body: identity });
  await get(a, 'verification', 409);
  const va = await get(a, 'diagnosis'), vb = await get(b, 'diagnosis');
  assert.notEqual(va.attemptId, vb.attemptId);
  assert.deepEqual(va.case.requirements.map(({ requirementId }) => requirementId),
    ['quantity', 'ui-zero', 'discount', 'empty-cart', 'valid-totals']);
  const before = (await stack.admin.query('select attempt_id, journey from skillloop_courses.attempts order by attempt_id')).rows;
  await post(b, va, 'diagnosis', answers(va, 'cart-checkout-code-reading'), 409);
  assert.deepEqual((await stack.admin.query('select attempt_id, journey from skillloop_courses.attempts order by attempt_id')).rows, before);
  await post(a, va, 'diagnosis', answers(va, 'cart-checkout-code-reading'));
  await post(a, va, 'diagnosis', answers(va, 'cart-checkout-edge-cases'), 409);
  await post(b, vb, 'diagnosis', answers(vb, 'cart-checkout-edge-cases'));
  const la = await get(a, 'learning'), lb = await get(b, 'learning');
  assert.equal(la.teaching.requirement.requirementId, 'empty-cart');
  assert.equal(la.teaching.source, 'teacher-published');
  assert.equal(lb.teaching.requirement.requirementId, 'discount');
  assert.equal(lb.teaching.source, 'deterministic-m2');
  assert.equal(lb.teaching.aiState, 'deterministic-validated');
  assert.notEqual(la.teaching.card.explanation, lb.teaching.card.explanation);
  assert.notEqual(la.teaching.practice.prompt, lb.teaching.practice.prompt);
  for (const payload of [va, la, lb]) assert.doesNotMatch(JSON.stringify(payload),
    /teacherAnswerGuidance|M5 teacher-private|referenceCode|internalAssessment|hiddenAssertions|publicFactsDigest/);
  await publishCourse(call, teacher, checkout, 'discount', 'Checkout lesson v2', course);
  assert.equal((await get(a, 'learning')).courseTitle, 'Checkout lesson v1');
  await post(a, la, 'learning', { option: 0, explanation: 'Trace the raw result again.' }, 409, { version: 2 });

  const first = await post(a, la, 'learning', { option: 0, explanation: 'Zero divided by zero gives NaN.' });
  const second = await post(a, first, 'learning', { option: 1, explanation: 'The contract explicitly requires zero.' });
  assert.notEqual(first.result.feedback, second.result.feedback);
  assert.equal(second.result.observation, 'correct-choice');
  await post(b, lb, 'learning', { option: 2, explanation: '101 exceeds the maximum.' });
  const r = await get(a, 'repair');
  assert.equal(r.issues[0].issueId, 'empty-cart');
  const discussion = await post(a, r, 'repair', { message: 'How can I verify the empty cart result?' });
  assert.match(discussion.result.dialogue[0].feedback, /observable result/);
  await get(a, 'verification', 409);
  const requests = Object.fromEntries(r.issues.map(({ issueId }) => [issueId, 'Apply the requirement and check the observed result.']));
  const correct = { 'negative-quantity': 1, 'discount-range': 0, 'empty-cart': 2 };
  await post(a, discussion, 'repair', { choices: { ...correct, 'empty-cart': 0 }, requests });
  const v = await get(a, 'verification');
  const failing = await post(a, v, 'verification', {});
  assert.equal(failing.result.outcome, 'needs_revision');
  assert.equal(failing.result.tests.find(({testId}) => testId === 'empty-average').status, 'fail');
  await post(a, await get(a, 'repair'), 'repair', { choices: correct, requests });
  const passed = await post(a, await get(a, 'verification'), 'verification', {});
  assert.equal(passed.result.outcome, 'passed');
  assert.equal(passed.result.tests.filter(({status}) => status === 'pass').length, 8);
  const teacherView = await call('open', { cookie: teacher, query });
  assert.deepEqual(teacherView.journeyEngagement,
    [{ version: 2, diagnosed: 0, learned: 0, verified: 0 }, { version: 1, diagnosed: 2, learned: 2, verified: 1 }]);
  assert.doesNotMatch(JSON.stringify(teacherView.journeyEngagement), /empty-cart|learnerId|responses/);
  await stack.restartApp();
  assert.deepEqual((await get(a, 'verification')).result, passed.result);

  const fourth = await publishCourse(call, teacher, retryQueue, 'backoff-cap', 'Retry backoff lesson');
  const fourthQuery = { course: fourth.id, version: fourth.version };
  const fourthIdentity = { courseId: fourth.id, version: fourth.version };
  await call('start', { cookie: b, body: fourthIdentity });
  const readFourth = (stage) => call('journey', { cookie: b, query: { ...fourthQuery, stage } });
  const writeFourth = (view, stage, input) => call('journey', { cookie: b,
    body: { ...fourthIdentity, stage, attemptId: view.attemptId, revision: view.revision, input } });
  const fd = await readFourth('diagnosis');
  assert.equal(fd.caseRef.caseId, 'retry-queue');
  await writeFourth(fd, 'diagnosis', answers(fd, 'retry-cap-check'));
  const fl = await readFourth('learning');
  assert.equal(fl.teaching.requirement.requirementId, 'backoff-cap');
  await writeFourth(fl, 'learning', { option: 1, explanation: 'The computed value exceeds the cap.' });
  const fr = await readFourth('repair');
  assert.deepEqual(fr.issues.map(({issueId}) => issueId), ['delay-cap', 'invalid-attempt']);
  await writeFourth(fr, 'repair', { choices: { 'delay-cap': 0, 'invalid-attempt': 1 },
    requests: { 'delay-cap': 'Cap valid delays at 1,000 ms.', 'invalid-attempt': 'Reject fractional and negative counts.' } });
  const fv = await writeFourth(await readFourth('verification'), 'verification', {});
  assert.equal(fv.result.outcome, 'passed');
  assert.equal(fv.result.tests.length, 3);
  const legacy = await (await fetch(stack.base + '/api/dialogue')).text();
  assert.doesNotMatch(legacy, /referenceCode|implementationNote/);
});
