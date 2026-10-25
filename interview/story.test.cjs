const test = require('node:test');
const assert = require('node:assert/strict');
const story = require('./story.js');
const service = require('./server.cjs');
function complete(topicId = 'testing') {
  const session = story.create(topicId, 'demo', {
    courseId: 'course-1',
    graphId: 'graph-2',
    publicationVersion: 'v3',
  });
  while (session.status === 'active') {
    story.accept(session, story.demoTurn(session));
    if (session.status === 'active') story.answer(session, session.current.choices[0], 0);
  }
  return session;
}
test('a reply is committed once before the next request, and a different decision changes the follow-up', () => {
  const one = story.create('testing', 'demo');
  const two = story.create('testing', 'demo');
  for (const s of [one, two]) story.accept(s, story.demoTurn(s));
  story.answer(one, one.current.choices[0], 0);
  story.answer(two, two.current.choices[1], 1);
  assert.notEqual(story.demoTurn(one).question, story.demoTurn(two).question);
  assert.throws(() => story.answer(one, 'A duplicate answer.'));
  const restored = story.restore({ sessions: [one] }).sessions[0];
  assert.equal(restored.turns.length, 1);
  assert.equal(restored.current, null);
  story.accept(restored, story.demoTurn(restored));
  assert.equal(restored.turns.length, 1);
});
test('demo conversations finish, keep source context, and preserve original answers during revision', () => {
  const session = complete();
  const original = session.turns[0].answer;
  assert.equal(session.turns.length, 4);
  assert.equal(session.status, 'completed');
  assert.throws(() => story.answer(session, 'Too late.'));
  assert.equal(
    story.revise(session, 0, 'I would clarify the expected output before testing.'),
    true
  );
  assert.equal(
    story.revise(session, 0, 'I would clarify the expected output before testing.'),
    false
  );
  session.comparisons[0] = { improved: 'A stale comparison.', nextStep: 'Old step.' };
  story.revise(session, 0, 'I would agree on expected behaviour, then test boundary inputs.');
  assert.equal(session.comparisons[0], undefined);
  assert.equal(session.turns[0].answer, original);
  assert.equal(story.restore({ sessions: [session] }).sessions[0].context.publicationVersion, 'v3');
});
test('feedback must quote a real answer and cannot finish before three replies', () => {
  const session = complete('requirements');
  const review = story.demoReview(session);
  assert.equal(story.validReview(review, session.turns), true);
  review.highlights[0].quote = 'A fabricated quote.';
  assert.equal(story.validReview(review, session.turns), false);
  assert.throws(() =>
    story.accept(story.create('testing', 'demo'), {
      done: true,
      acknowledgement: 'Done',
      question: '',
      choices: [],
    })
  );
  assert.equal(
    story.restore({ sessions: [null, {}, { ...session, turns: 'bad' }] }).sessions.length,
    0
  );
});
test('each reply keeps its own note and inserting an idea does not submit an answer', () => {
  const session = story.create('testing', 'demo');
  story.accept(session, story.demoTurn(session));
  session.draft = session.current.choices[0];
  session.draftIdea = { index: 0, text: session.draft };
  assert.equal(session.turns.length, 0);
  story.answer(session, session.draft + ' I would agree on the empty-list behaviour.', null);
  const next = story.demoTurn(session);
  story.accept(session, next);
  assert.equal(session.turns[0].usedIdea, true);
  assert.equal(story.validFeedback(session.turns[0].feedback, session.turns[0].answer), true);
  const wrong = { ...next.feedback, quote: 'Something never said.' };
  assert.equal(story.validFeedback(wrong, session.turns[0].answer), false);
  assert.equal(story.validFeedback(next.feedback, ''), false);
  const restored = story.restore({
    sessions: [session],
    lastSessionId: session.id,
    lastView: 'review',
  });
  assert.equal(restored.lastSessionId, session.id);
});
test('AI tasks stay tied to the course topic and bound original transcript data', () => {
  const session = complete('ai-review');
  const task = service.input({ action: 'review', session });
  assert.match(task.system, /Challenge assumptions/);
  assert.match(task.system, /untrusted student data/);
  assert.equal(task.validate(story.demoReview(session)), true);
  assert.throws(() => service.input({ action: 'compare', session, index: 0 }));
  assert.throws(() => service.input({ action: 'turn', session }));
  assert.equal(service.configured({}), false);
  assert.equal(
    service.configured({ AI_GATEWAY_MODEL: 'configured/model', AI_GATEWAY_API_KEY: 'test-only' }),
    true
  );
});
test('the installed AI SDK validates structured output through its mock model, without live credentials', async () => {
  const sdk = await import('ai');
  const { MockLanguageModelV4 } = await import('ai/test');
  const session = story.create('testing', 'ai');
  const reply = story.demoTurn(session);
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: JSON.stringify(reply) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      warnings: [],
      usage: { inputTokens: { total: 10, noCache: 10 }, outputTokens: { total: 20, text: 20 } },
    },
  });
  const dependency = {
    sdk: { ...sdk, generateText: (options) => sdk.generateText({ ...options, model }) },
  };
  const result = await service.generate({ action: 'turn', session }, dependency);
  assert.deepEqual(result, reply);
  assert.match(model.doGenerateCalls[0].prompt[0].content, /Maya/);
  model.doGenerate = async () => ({
    content: [{ type: 'text', text: '{"done":true}' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    warnings: [],
    usage: { inputTokens: {}, outputTokens: {} },
  });
  await assert.rejects(() => service.generate({ action: 'turn', session }, dependency));
});
test('the HTTP boundary reports missing configuration without leaking server details', async () => {
  const handler = require('../api/interview.js');
  const oldModel = process.env.AI_GATEWAY_MODEL;
  delete process.env.AI_GATEWAY_MODEL;
  const response = () => ({
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  });
  try {
    const get = response();
    await handler({ method: 'GET', headers: {} }, get);
    assert.deepEqual(get.body, { available: false });
    const post = response();
    await handler({ method: 'POST', headers: {}, body: {} }, post);
    assert.equal(post.code, 503);
    const other = response();
    await handler({ method: 'DELETE', headers: {} }, other);
    assert.equal(other.code, 405);
  } finally {
    if (oldModel === undefined) delete process.env.AI_GATEWAY_MODEL;
    else process.env.AI_GATEWAY_MODEL = oldModel;
  }
});
