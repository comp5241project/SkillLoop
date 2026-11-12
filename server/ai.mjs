/** Server-only OpenAI-compatible Chat Completions client. No public proxy route. */
export class AIError extends Error {
  constructor(code, message) { super(message); this.name = 'AIError'; this.code = code; }
}
const fail = (code, message) => { throw new AIError(code, message); };

export function createAIClient({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 45000 } = {}) {
  async function callAI({ system, messages, maxTokens = 1500 } = {}) {
    if (typeof window !== 'undefined') fail('SERVER_ONLY', 'AI calls belong on the server.');
    const key = env.AI_API_KEY?.trim();
    const model = env.AI_MODEL?.trim();
    let base;
    try { base = new URL(env.AI_BASE_URL); } catch { /* Handled below. */ }
    if (!key || !model || !base || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || /[{}]/.test(env.AI_BASE_URL)) {
      fail('NOT_CONFIGURED', 'Configure AI_API_KEY, AI_BASE_URL and AI_MODEL on the server.');
    }
    if (typeof system !== 'string' || !system.trim() || !Array.isArray(messages) || !messages.length || messages.length > 40 ||
        messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim()) ||
        system.length + messages.reduce((n, m) => n + m.content.length, 0) > 50000 ||
        !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
      fail('INVALID_INPUT', 'Provide a server-owned system prompt and bounded user/assistant messages.');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 55000) fail('INVALID_INPUT', 'Invalid AI timeout.');
    const body = { model, messages: [{ role: 'system', content: system }, ...messages.map(({role, content}) => ({role, content}))], stream: false, max_tokens: maxTokens };
    if (env.AI_ENABLE_THINKING !== undefined && env.AI_ENABLE_THINKING !== '') {
      if (!['true', 'false'].includes(env.AI_ENABLE_THINKING)) fail('NOT_CONFIGURED', 'AI_ENABLE_THINKING must be true or false.');
      body.enable_thinking = env.AI_ENABLE_THINKING === 'true';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(base.href.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        if ([401, 403].includes(response.status)) fail('AUTH_FAILED', 'Check the AI key, endpoint region and model access.');
        if (response.status === 429) fail('RATE_LIMITED', 'The shared AI service is busy or its quota is exhausted. Retry later.');
        fail('PROVIDER_ERROR', 'The AI service could not complete the request.');
      }
      let payload;
      try { payload = await response.json(); } catch {
        if (controller.signal.aborted) fail('TIMEOUT', 'The AI request timed out.');
        fail('INVALID_RESPONSE', 'The AI service returned an unreadable response.');
      }
      const choice = payload?.choices?.[0];
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || !choice.message.content.trim()) {
        fail('INVALID_RESPONSE', 'The AI response was empty, incomplete or not a text answer.');
      }
      return { text: choice.message.content, model, aiSource: 'api' };
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (controller.signal.aborted) fail('TIMEOUT', 'The AI request timed out.');
      fail('NETWORK_ERROR', 'The AI service could not be reached.');
    } finally { clearTimeout(timer); }
  }

  async function callAIJson({ validate, system, ...options } = {}) {
    if (typeof validate !== 'function' || typeof system !== 'string') fail('INVALID_INPUT', 'JSON output requires a module-owned validator and system prompt.');
    const result = await callAI({ ...options, system: system + '\nReturn one valid JSON object only. Do not include Markdown fences or commentary.' });
    let data;
    try { data = JSON.parse(result.text); } catch { fail('INVALID_OUTPUT', 'The AI did not return valid JSON.'); }
    let valid = false;
    try { valid = data !== null && typeof data === 'object' && !Array.isArray(data) && validate(data) === true; } catch { /* Safe error below. */ }
    if (!valid) fail('INVALID_OUTPUT', 'The AI output did not match this module\'s required fields.');
    return { data, model: result.model, aiSource: 'api' };
  }
  return { callAI, callAIJson };
}

export const callAI = (options) => createAIClient().callAI(options);
export const callAIJson = (options) => createAIClient().callAIJson(options);
