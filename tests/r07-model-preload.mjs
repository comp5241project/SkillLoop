import { completion, fixtureContent } from './r07-model-fixture.mjs';

process.env.AI_BASE_URL = 'https://r07-fixture.invalid/v1';
process.env.AI_API_KEY = 'r07-fixture-key';
process.env.AI_MODEL = 'r07-deterministic-test-model';
delete process.env.AI_ENABLE_THINKING;

const actualFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (url !== process.env.AI_BASE_URL + '/chat/completions') return actualFetch(url, init);
  const { messages } = JSON.parse(init.body);
  const payload = JSON.parse(messages[1].content);
  if (payload.brief.constraints === 'Fixture: provider failure') return new Response('fixture failure', { status: 500 });
  return completion(payload.proposal ? { approved: true } : fixtureContent(payload));
};
