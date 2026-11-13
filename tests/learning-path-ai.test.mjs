import test from 'node:test';
import assert from 'node:assert/strict';
import {
  API_URL,
  DEFAULT_MAX_OUTPUT_TOKENS,
  PROVIDER,
  apiKey,
  configured,
  generateStructured,
  modelName,
} from '../server/ai.mjs';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['value'],
  properties: { value: { type: 'string' } },
};

function fakeResponse(content, { status = 200, payload } = {}) {
  const body = payload || {
    choices: [{ message: { content }, finish_reason: 'stop' }],
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('the shared AI service uses direct DeepSeek configuration', () => {
  assert.equal(PROVIDER, 'DeepSeek');
  assert.equal(apiKey({}), '');
  assert.equal(configured({}), false);
  assert.equal(configured({ DEEPSEEK_API_KEY: 'test-only' }), true);
  assert.equal(configured({ AI_GATEWAY_API_KEY: 'legacy-test-only' }), true);
  assert.equal(modelName({}), 'deepseek-flash');
  assert.equal(modelName({ DEEPSEEK_MODEL: 'deepseek-v4-pro' }), 'deepseek-v4-pro');
  assert.equal(
    modelName({ DEEPSEEK_MODEL: 'deepseek-v4-pro', LEARNING_PATH_AI_MODEL: 'learning-path/model' }),
    'learning-path/model'
  );
});

test('generateStructured posts to DeepSeek and returns only validated output', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return fakeResponse('{"value":"ok"}');
  };

  const result = await generateStructured(
    {
      system: 'system',
      prompt: 'prompt',
      schema,
      validate: (value) => value.value === 'ok',
    },
    { fetch: fetchImpl, apiKey: 'test-only', model: 'deepseek-flash' }
  );

  assert.deepEqual(result, { value: 'ok' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, API_URL);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-only');

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, DEFAULT_MAX_OUTPUT_TOKENS);
  assert.match(body.messages[0].content, /JSON Schema/);
  assert.match(body.messages[0].content, /"value"/);
  assert.equal(body.messages[1].content, 'prompt');
});

test('generateStructured tolerates fenced JSON and respects output overrides', async () => {
  let request;
  const result = await generateStructured(
    {
      system: 'system',
      prompt: 'prompt',
      schema,
      validate: (value) => value.value === 'ok',
      maxOutputTokens: 1234,
      timeoutMs: 5000,
      temperature: 1.15,
    },
    {
      fetch: async (url, options) => {
        request = JSON.parse(options.body);
        return fakeResponse('```json\n{"value":"ok"}\n```');
      },
      apiKey: 'test-only',
      model: 'deepseek-v4-pro',
    }
  );

  assert.deepEqual(result, { value: 'ok' });
  assert.equal(request.max_tokens, 1234);
  assert.equal(request.model, 'deepseek-v4-pro');
  assert.equal(request.temperature, 1.15);
});

test('generateStructured rejects missing content, invalid JSON and schema failures', async () => {
  await assert.rejects(
    () =>
      generateStructured(
        {
          system: 'system',
          prompt: 'prompt',
          schema,
          validate: () => true,
        },
        { fetch: async () => fakeResponse(''), apiKey: 'test-only' }
      ),
    /no diagnosis content/
  );

  await assert.rejects(
    () =>
      generateStructured(
        {
          system: 'system',
          prompt: 'prompt',
          schema,
          validate: () => true,
        },
        { fetch: async () => fakeResponse('not json'), apiKey: 'test-only' }
      ),
    /invalid JSON/
  );

  await assert.rejects(
    () =>
      generateStructured(
        {
          system: 'system',
          prompt: 'prompt',
          schema,
          validate: () => false,
        },
        { fetch: async () => fakeResponse('{"value":"wrong"}'), apiKey: 'test-only' }
      ),
    /Invalid learning-path AI output/
  );
});

test('generateStructured reports DeepSeek errors without exposing the key', async () => {
  await assert.rejects(
    () =>
      generateStructured(
        {
          system: 'system',
          prompt: 'prompt',
          schema,
          validate: () => true,
        },
        {
          fetch: async () => fakeResponse('Unauthenticated request', { status: 401 }),
          apiKey: 'super-secret-key',
        }
      ),
    (error) => {
      assert.match(error.message, /DeepSeek request failed \(401\)/);
      assert.equal(error.message.includes('super-secret-key'), false);
      return true;
    }
  );
});

test('generateStructured requires a DeepSeek API key', async () => {
  await assert.rejects(
    () =>
      generateStructured(
        {
          system: 'system',
          prompt: 'prompt',
          schema,
          validate: () => true,
        },
        { fetch: async () => fakeResponse('{"value":"ok"}'), apiKey: '' }
      ),
    /No DeepSeek API key is configured/
  );
});
