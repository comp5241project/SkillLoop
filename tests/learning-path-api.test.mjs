import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/learning-path.mjs';
import data from '../learning-path/data.js';

const AI_KEYS = ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'AI_GATEWAY_MODEL',
  'AI_GATEWAY_API_KEY',
  'LEARNING_PATH_AI_MODEL',
  'VERCEL_OIDC_TOKEN',
];

function withoutAiEnv() {
  const saved = {};
  for (const key of AI_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return () => {
    for (const key of AI_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
}

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(chunk) {
      this.raw = chunk == null ? '' : String(chunk);
      return this;
    },
  };
}

function request(method, body, headers = {}) {
  return { method, headers, body };
}

function validBody() {
  const caseData = data.findCase('cart-checkout');
  return {
    action: 'diagnose',
    caseId: caseData.id,
    learner: { background: 'student', goal: 'internship' },
    responses: caseData.questions.map((question) => {
      const best = question.options.find((option) => option.score === 2);
      return { questionId: question.id, optionId: best.id };
    }),
  };
}

function generatedAnswer(caseId) {
  const caseData = data.findCase(caseId);
  return {
    caseId,
    questions: caseData.knowledgePoints.map((conceptId, index) => ({
      conceptId,
      prompt: 'Fresh HTTP check ' + (index + 1) + ' for ' + conceptId + '.',
      strength: 'A strong answer connects the decision to the case evidence.',
      gap: 'Trace the relevant rule and name one testable next step.',
      options: [
        {
          quality: 'best',
          label: 'Best HTTP option ' + (index + 1) + ': trace the reported behaviour.',
          feedback: 'You connected the choice to the observed symptom.',
        },
        {
          quality: 'partial',
          label: 'Partial HTTP option ' + (index + 1) + ': notice the issue but wait.',
          feedback: 'You noticed the issue but did not make the next step testable.',
        },
        {
          quality: 'off',
          label: 'Off-target HTTP option ' + (index + 1) + ': edit an unrelated style.',
          feedback: 'You changed presentation rather than checking the behaviour.',
        },
      ],
    })),
  };
}

test('the HTTP boundary reports direct DeepSeek availability without exposing credentials', async () => {
  const restore = withoutAiEnv();
  try {
    const unavailable = fakeResponse();
    await handler(request('GET'), unavailable);
    assert.equal(unavailable.statusCode, 200);
    assert.equal(unavailable.headers['Cache-Control'], 'no-store');
    assert.equal(unavailable.body.provider, 'DeepSeek');
    assert.equal(unavailable.body.contractVersion, 1);
    assert.equal(unavailable.body.available, false);
    assert.equal(unavailable.body.model, null);
    assert.equal('apiKey' in unavailable.body, false);

    process.env.DEEPSEEK_API_KEY = 'test-only';
    process.env.DEEPSEEK_MODEL = 'deepseek-flash';
    const available = fakeResponse();
    await handler(request('GET'), available);
    assert.equal(available.body.available, true);
    assert.equal(available.body.model, 'deepseek-flash');
    assert.equal('apiKey' in available.body, false);
  } finally {
    restore();
  }
});

test('input validation runs before the AI configuration check', async () => {
  const missing = fakeResponse();
  await handler(request('POST', JSON.stringify({ action: 'diagnose', caseId: 'cart-checkout', responses: [] })), missing);
  assert.equal(missing.statusCode, 400);
  assert.match(missing.body.error, /Answer every question/);

  const malformed = fakeResponse();
  await handler(request('POST', '{not json'), malformed);
  assert.equal(malformed.statusCode, 400);
  assert.match(malformed.body.error, /valid JSON/);

  const empty = fakeResponse();
  await handler(request('POST', undefined), empty);
  assert.equal(empty.statusCode, 400);
  assert.match(empty.body.error, /valid JSON/);

  const tooLarge = fakeResponse();
  await handler(
    request('POST', JSON.stringify({ action: 'diagnose', caseId: 'x'.repeat(21000) })),
    tooLarge
  );
  assert.equal(tooLarge.statusCode, 413);

  const badQuestionCase = fakeResponse();
  await handler(
    request('POST', JSON.stringify({ action: 'questions', caseId: 'not-a-case' })),
    badQuestionCase
  );
  assert.equal(badQuestionCase.statusCode, 400);
  assert.match(badQuestionCase.body.error, /Unknown caseId/);
});

test('the questions action returns a normalized AI-written set', async () => {
  const restore = withoutAiEnv();
  const originalFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = 'test-only';
  let upstream;
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(generatedAnswer('cart-checkout')) } }],
      }),
      text: async () => '',
    };
  };
  try {
    const res = fakeResponse();
    await handler(
      request('POST', JSON.stringify({ action: 'questions', caseId: 'cart-checkout' })),
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.source, 'ai');
    assert.equal(res.body.caseId, 'cart-checkout');
    assert.equal(res.body.questions.length, 4);
    assert.deepEqual(
      res.body.questions.map((question) => question.conceptId),
      data.findCase('cart-checkout').knowledgePoints
    );
    for (const question of res.body.questions) {
      assert.deepEqual(
        question.options.map((option) => option.score).sort(),
        [0, 1, 2]
      );
      assert.deepEqual(
        question.options.map((option) => option.id),
        ['choice-1', 'choice-2', 'choice-3']
      );
    }
    assert.match(upstream.url, /api\.deepseek\.com/);
    assert.equal(upstream.body.temperature, 1.15);
    assert.match(upstream.body.messages[1].content, /fresh set/);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test('part 1 uses the shared provider even when legacy credentials exist', async () => {
  const restore = withoutAiEnv();
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { AI_API_KEY: 'test-shared-key', AI_BASE_URL: 'https://example.invalid/v1', AI_MODEL: 'shared-model', DEEPSEEK_API_KEY: 'legacy-test-key' });
  let upstream;
  globalThis.fetch = async (url, options) => {
    upstream = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(generatedAnswer('cart-checkout')) } }] }));
  };
  try {
    const status = fakeResponse();
    await handler(request('GET'), status);
    assert.equal(status.body.available, true);
    assert.equal(status.body.provider, 'Shared AI');
    const res = fakeResponse();
    await handler(request('POST', { action: 'questions', caseId: 'cart-checkout' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.questions.length, 4);
    assert.equal(upstream.url, 'https://example.invalid/v1/chat/completions');
    assert.equal(upstream.headers.Authorization, 'Bearer test-shared-key');
    assert.equal(upstream.body.model, 'shared-model');
    assert.equal(upstream.body.temperature, 1.15);
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('a valid request without AI configuration returns the documented 503', async () => {
  const restore = withoutAiEnv();
  try {
    const res = fakeResponse();
    await handler(request('POST', JSON.stringify(validBody())), res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
      error: 'Live AI is not configured in this environment.',
      code: 'ai-not-configured',
    });

    const questionRes = fakeResponse();
    await handler(
      request('POST', JSON.stringify({ action: 'questions', caseId: 'cart-checkout' })),
      questionRes
    );
    assert.equal(questionRes.statusCode, 503);
    assert.equal(questionRes.body.code, 'ai-not-configured');
  } finally {
    restore();
  }
});

test('unsupported methods are rejected', async () => {
  const res = fakeResponse();
  await handler(request('PUT'), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, POST');
});
