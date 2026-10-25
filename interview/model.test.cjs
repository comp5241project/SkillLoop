const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const model = require('./model.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'), sandbox);
const activities = JSON.parse(JSON.stringify(sandbox.window.SkillLoopInterviewActivities));

test('a strategy selection changes the next prompt and remains in the record', () => {
  const session = model.createSession(activities[0], { courseId: 'se-101' });
  model.chooseMove(session, 'counterexample');
  assert.match(session.activity.prompts[1], /empty-list test fails/);
  assert.equal(session.decisions[0].choiceId, 'counterexample');
  model.submitAnswer(session, 'I would clarify the requirement and test an empty list.');
  assert.equal(session.answers[0].question, activities[0].prompts[0]);
  assert.equal(session.status, 'active');
  assert.throws(() => model.submitAnswer(session, ' '));
  model.submitAnswer(session, 'Ask the owner to define empty-input behaviour.');
  model.submitAnswer(session, 'Share the failure, reproduction steps and remaining uncertainty.');
  assert.equal(session.status, 'completed');
  assert.throws(() => model.submitAnswer(session, 'An extra answer.'));
});

test('saved revisions preserve the original, and repeat text does not add a revision', () => {
  const session = model.createSession(activities[0]);
  model.submitAnswer(session, 'Initial answer.');
  assert.equal(model.reviseAnswer(session, 0, 'A clearer answer.'), true);
  assert.equal(model.reviseAnswer(session, 0, 'A clearer answer.'), false);
  assert.equal(session.answers[0].original, 'Initial answer.');
  assert.equal(session.answers[0].revisions.length, 1);
});

test('a session owns an activity snapshot so later edits do not change its history', () => {
  const activity = JSON.parse(JSON.stringify(activities[1]));
  const session = model.createSession(activity);
  activity.prompts[0] = 'Edited after starting.';
  activity.criteria[0] = 'New criterion.';
  assert.notEqual(session.activity.prompts[0], activity.prompts[0]);
  assert.notEqual(session.activity.criteria[0], activity.criteria[0]);
});

test('course context survives a JSON round trip without replacing the source concept', () => {
  const context = model.contextFromSearch('?courseId=se-101&activityId=act-4&graph=g-2&conceptId=teacher-topic&version=v3&returnTo=%2Fknowledge-map%2Fgraph.html%3Fgraph%3Dg-2');
  const session = model.createSession(activities[0], context, 'independent');
  session.draft = '<img src=x onerror=alert(1)> is treated as plain text.';
  const restored = model.restore(JSON.parse(JSON.stringify({ sessions: [session] })));
  assert.equal(restored.sessions[0].context.conceptId, 'teacher-topic');
  assert.equal(restored.sessions[0].context.graphId, 'g-2');
  assert.equal(restored.sessions[0].context.publicationVersion, 'v3');
  assert.equal(restored.sessions[0].draft, session.draft);
  assert.equal(restored.sessions[0].activity.prompts[0], activities[0].advancedPrompt);
});

test('return links stay inside the two supported modules', () => {
  assert.equal(model.safeReturnPath('../knowledge-map/?topic=testing'), '/knowledge-map/?topic=testing');
  assert.equal(model.safeReturnPath('/learning-path/'), '/learning-path/');
  for (const value of ['https://evil.test/knowledge-map/', '//evil.test/', 'javascript:alert(1)', '/interview/', '/knowledge-map-other/', '\\evil.test']) {
    assert.equal(model.safeReturnPath(value), '');
  }
});

test('malformed storage is discarded while valid sessions are retained and bounded', () => {
  const session = model.createSession(activities[2]);
  for (const value of [null, [], { sessions: [null, {}, { ...session, answers: 'broken' }] }]) {
    assert.equal(model.restore(value).sessions.length, 0);
  }
  const state = model.restore({ sessions: [null, session], custom: { testing: {} } });
  assert.equal(state.sessions.length, 1);
  assert.deepEqual(state.custom, {});
  assert.equal(model.restore({ sessions: Array(15).fill(session) }).sessions.length, 12);
});
