import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIClient } from '../server/ai.mjs';

test('loading correction API does not block shared server AI calls', async () => {
  assert.equal(typeof globalThis.window, 'undefined');
  await import('../api/correction.js');
  assert.equal(typeof globalThis.window, 'undefined');
  const ai = createAIClient({
    env: { AI_API_KEY: 'test', AI_BASE_URL: 'https://example.invalid/v1', AI_MODEL: 'test' },
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] })),
  });
  const result = await ai.callAI({ system: 'Test', messages: [{ role: 'user', content: 'Hello' }] });
  assert.equal(result.text, 'OK');
});
