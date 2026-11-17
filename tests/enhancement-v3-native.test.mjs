import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startM4Stack } from './m4-local-stack.mjs';
import { client } from './m5-test-support.mjs';
import { nativeCase } from '../enhancement-v3/native/cases.mjs';
import runner from '../correction-lab/break-runner.js';

const cases = [
  { id: 'cart-checkout', file: 'cart-checkout-source.txt', weak: 'code-reading',
    choices: { 'empty-cart': 2, 'discount-range': 0, 'negative-quantity': 1 }, passing: 8 },
  { id: 'retry-queue', file: 'retry-queue-source.txt', weak: 'edge-cases',
    choices: { 'delay-cap': 0, 'invalid-attempt': 1 }, passing: 3 },
];

async function publish(stack, call, cookie, demo, saved) {
  let draft = saved;
  if (!draft) {
    const source = await readFile(new URL('../docs/enhancement-v3/' + demo.file, import.meta.url));
    const response = await fetch(stack.base + '/api/courses/?op=v3-import-file', {
      method: 'POST', body: source, headers: { Cookie: cookie, Origin: stack.base,
        'Content-Type': 'application/octet-stream', 'X-SkillLoop-Filename': demo.file, 'X-SkillLoop-Course': '1' },
    });
    assert.equal(response.status, 200);
    draft = await response.json();
  }
  const step = (op, fields = {}) => call('v3-' + op, { cookie, body: { id: draft.id, revision: draft.revision, ...fields } });
  if (!saved) draft = await step('generate');
  draft = await step('match');
  const selection = draft.choices.findIndex(choice => choice.caseId === demo.id);
  assert.ok(selection >= 0);
  draft = await step('select', { selection, confirm: true });
  await step('review', { confirm: true });
  return { ...await step('publish', { confirm: true }), draft };
}

test('published v3 courses resume the original four-stage records and verify submitted code', { timeout: 150000 }, async t => {
  const authBinary = process.env.SKILLLOOP_AUTH_BINARY;
  const stack = await startM4Stack(t, { native: true, authBinary,
    authMigrations: process.env.SKILLLOOP_AUTH_MIGRATIONS,
    appImports: [new URL('./native-ai-fixture.mjs', import.meta.url).href] });
  const call = client(stack);
  const login = name => call('login', { body: stack.accounts[name] });
  const teacher = await login('teacher');
  for (const demo of cases) {
    const learner = demo.id === 'cart-checkout' ? 'student' : 'other-student';
    const student = await login(learner);
    const other = await login(learner === 'student' ? 'other-student' : 'student');
    const release = await publish(stack, call, teacher, demo);
    const versionInput = { courseId: release.courseId, version: release.version };
    const query = { course: release.courseId, version: release.version };
    assert.equal((await call('v3-overview', { query })).native, true);
    let progress = await call('native-start', { cookie: student, body: versionInput });
    await call('native-open', { cookie: other, query, status: 404 });
    const open = async (cookie = student) => call('native-open', { cookie, query });
    const write = async (action, input, status = 200, overrides = {}) => {
      const result = await call('native-save', { cookie: student, status, body: { ...versionInput,
        attemptId: progress.attemptId, revision: progress.revision, action, input, ...overrides } });
      progress = result.progress ?? progress;
      return result.data;
    };
    await write('verify', { mode: 'code', code: 'return true', tests: [] }, 409);
    const issued = await write('questions', { aiProvider: 'shared' });
    assert.equal(issued.questions.length, 4);
    assert.deepEqual((await open()).issued, issued.questions);
    if (demo.id === 'cart-checkout') {
      const saved = await call('v3-save', { cookie: teacher, body: { id: release.draft.id, revision: release.draft.revision,
        content: { ...release.draft.content, title: 'Updated cart checkout course' } } });
      const next = await publish(stack, call, teacher, demo, saved);
      assert.equal(next.courseId, release.courseId);
      assert.equal(next.version, release.version + 1);
      assert.equal((await call('v3-overview', { query: { course: next.courseId, version: next.version } })).title,
        'Updated cart checkout course');
      const original = await open(await login(learner));
      assert.equal(original.attemptId, progress.attemptId);
      assert.deepEqual(original.issued, issued.questions);
      await call('native-open', { cookie: student, query: { course: next.courseId, version: next.version }, status: 404 });
    }
    const responses = issued.questions.map(q => ({ questionId: q.id, optionId: q.options.find(o =>
      o.score === (q.conceptId === demo.weak ? 0 : 2)).id, explanation: '' }));
    await write('diagnose', { questionSource: 'ai', responses: [], aiProvider: 'shared' }, 400);
    await write('diagnose', { questionSource: 'ai', responses, aiProvider: 'shared' });
    const lesson = await call('v3-lesson', { cookie: student, query });
    assert.equal(lesson.context.requirement.id, demo.id === 'cart-checkout' ? 'empty-cart' : 'backoff-cap');
    assert.ok(lesson.context.notes.length);
    assert.ok(progress.sourceNotes.every(group => group.notes.length));
    let deck = await write('generate-lessons');
    assert.ok(deck.lessons.length >= 2);
    if (demo.id === 'retry-queue') {
      const broken = deck.lessons.map(({ topicId }) => ({ topicId, explanation: 'ok', example: 'ok', prompt: 'ok' }));
      const attemptId = progress.attemptId;
      const originalFeedback = { [broken[0].topicId]: { answer: 'Prior answer kept with the original card.', result: null } };
      const originalDraft = { deckId: deck.id, activeTopic: broken[0].topicId, answers: { [broken[0].topicId]: 'Original draft' } };
      await stack.admin.query(`update skillloop_courses.native_progress
        set state = state || $2::jsonb, revision = revision + 1 where attempt_id = $1`,
      [attemptId, { deck: { ...deck, lessons: broken }, feedback: originalFeedback, learningDrafts: originalDraft }]);
      progress = await open();
      assert.equal(progress.deck, null);
      assert.deepEqual(progress.feedback, {});
      const replacement = await write('generate-lessons');
      assert.notEqual(replacement.id, deck.id);
      const { rows: [stored] } = await stack.admin.query(
        "select state->'practiceArchive'->($2::text) as old from skillloop_courses.native_progress where attempt_id = $1", [attemptId, deck.id]);
      assert.deepEqual(stored.old.feedback, originalFeedback);
      assert.deepEqual(stored.old.learningDrafts, originalDraft);
      deck = replacement;
    }
    const topic = deck.lessons[0].topicId;
    const lastTopic = deck.lessons.at(-1).topicId;
    const patch = { deckId: deck.id, activeTopic: lastTopic, answers: { [topic]: 'Saved before checking.' } };
    await write('learning-draft', { ...patch, deckId: randomUUID() }, 409);
    await write('learning-draft', { ...patch, answers: { 'wrong-topic': 'Invalid' } }, 422);
    await write('learning-draft', patch);
    assert.deepEqual((await open(await login(learner))).learningDrafts, patch);
    await write('learning-draft', { ...patch, answers: { [topic]: 'Outdated write' } }, 409,
      { revision: progress.revision - 1 });
    assert.deepEqual((await open()).learningDrafts, patch);
    await write('feedback', { topicId: topic, answer: 'Force model failure' }, 502);
    progress = await open();
    assert.equal(progress.feedback[topic].answer, 'Force model failure');
    for (const { topicId } of deck.lessons)
      await write('feedback', { topicId, answer: 'Compare the boundary with the teacher notes and requirement.' });
    const reflection = await write('reflection');
    assert.ok(reflection.reflection.length >= 20);
    assert.deepEqual(reflection.needsPractice, []);
    assert.deepEqual((await open()).reflection, reflection);
    await write('learning-draft', { deckId: deck.id, answers: { [topic]: 'New draft after feedback.' } });
    const restoredLearning = await open(await login(learner));
    assert.ok(restoredLearning.feedback[topic].result);
    assert.deepEqual(restoredLearning.reflection, reflection);
    assert.equal(restoredLearning.learningDrafts.answers[topic], 'New draft after feedback.');
    await write('dialogue', { action: 'open', id: randomUUID() }, 409);
    await write('case-check', { option: 1, explanation: 'Check the expected result at the boundary.' });
    assert.equal((await open(await login(learner))).stage, 'repair');
    const id = randomUUID();
    await write('dialogue', { id, action: 'open' });
    await write('dialogue', { id, action: 'reply', message: 'Walk me through the current boundary handling.' });
    const trusted = nativeCase({ caseId: demo.id, caseVersion: 1, conceptId: 'edge-cases' });
    await write('dialogue', { id, action: 'summary', requests: Object.fromEntries(trusted.display.issues.map(issue =>
      [issue.issueId, { request: 'Implement and test: ' + issue.suggestedChange }])) });
    await write('confirm-plan', { id });
    assert.equal((await open()).stage, 'verification');
    await write('verify', { mode: 'code', code: 'function retryDelay(){return 5}', tests: [],
      outcome: 'passed' }, 409, { revision: progress.revision - 1 });
    const broken = await write('verify', { mode: 'code', code: trusted.display.starterCode, outcome: 'passed',
      tests: trusted.level.checks.map(check => ({ testId: check.testId, status: 'pass' })) });
    assert.equal(broken.outcome, 'needs_revision');
    const passingCode = runner.assemble(trusted.level, demo.choices);
    const passed = await write('verify', { mode: 'code', code: passingCode });
    assert.equal(passed.tests.filter(test => test.status === 'pass').length, demo.passing);
    assert.equal(passed.outcome, 'passed');
    assert.equal(passed.testSource, 'server-runner');
    const reopened = await open(await login(learner));
    assert.equal(reopened.correction.verify[demo.id].code, passingCode);
    assert.equal(reopened.verification.codeHash, passed.codeHash);
    const summary = await call('v3-learning', { cookie: student });
    assert.equal(summary.courses.find(course => course.courseId === release.courseId).outcome, 'passed');
    const timeout = await write('verify', { mode: 'code', code: 'while (true) {}' });
    assert.equal(timeout.outcome, 'inconclusive');
    assert.ok(timeout.tests.every(test => test.status === 'error'));
    const spoof = await write('verify', { mode: 'code', code: "globalThis.process?.stdout.write('passed'); function retryDelay(){return 0;}" });
    assert.notEqual(spoof.outcome, 'passed');
    if (demo.id === 'retry-queue') {
      const fakeNumber = await write('verify', { mode: 'code', code: `function retryDelay(attempt) {
        if (attempt < 0 || !Number.isInteger(attempt)) throw Error('Invalid retry count');
        return { toJSON: () => Math.min(1000, 100 * 2 ** attempt) };
      }` });
      assert.equal(fakeNumber.outcome, 'needs_revision');
      assert.ok(fakeNumber.tests.filter(test => test.testId !== 'invalid-retry').every(test => test.status === 'fail'));
    }
    await write('correction-draft', { mode: 'code', code: 'function example() {}' });
    assert.equal((await open()).verification, null);
  }
});
