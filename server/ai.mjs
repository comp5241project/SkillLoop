/**
 * Shared server-only AI service. No public proxy route.
 *
 * `createAIClient()` is the four-part team interface configured with
 * AI_BASE_URL / AI_API_KEY / AI_MODEL.
 * `generateStructured()` is the Part 1 DeepSeek structured-output interface
 * uses the shared configuration first, with the legacy DeepSeek settings as fallback.
 */
export class AIError extends Error {
  constructor(code, message) { super(message); this.name = 'AIError'; this.code = code; }
}
const fail = (code, message) => { throw new AIError(code, message); };

export function createAIClient({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 45000 } = {}) {
  async function callAI({ system, messages, maxTokens = 1500, temperature } = {}) {
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
        !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) {
      fail('INVALID_INPUT', 'Provide a server-owned system prompt and bounded user/assistant messages.');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 55000) fail('INVALID_INPUT', 'Invalid AI timeout.');
    if (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) fail('INVALID_INPUT', 'Invalid temperature.');
    const body = { model, messages: [{ role: 'system', content: system }, ...messages.map(({role, content}) => ({role, content}))], stream: false, max_tokens: maxTokens };
    if (temperature !== undefined) body.temperature = temperature;
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

// Part 1: direct DeepSeek Chat Completions with validated JSON output.
export const PROVIDER = 'DeepSeek';
export const DEFAULT_MODEL = 'deepseek-flash';
export const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
export const API_URL = 'https://api.deepseek.com/chat/completions';

export function modelName(env = process.env) {
  return env.AI_MODEL || env.LEARNING_PATH_AI_MODEL || env.DEEPSEEK_MODEL || DEFAULT_MODEL;
}

export function apiKey(env = process.env) {
  return env.DEEPSEEK_API_KEY || env.AI_GATEWAY_API_KEY || '';
}

export function configured(env = process.env) {
  return Boolean(env.AI_API_KEY && env.AI_MODEL && /^https:\/\//.test(env.AI_BASE_URL || '')) || Boolean(apiKey(env));
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part === 'string' ? part : part && part.text) || '')
    .join('');
}

function parseJson(content) {
  const text = content.trim();
  if (!text) throw new Error('DeepSeek returned no diagnosis content.');
  try {
    return JSON.parse(text);
  } catch {
    /* JSON mode should return raw JSON, but tolerate a fenced fallback. */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* Fall through to the object boundary check. */
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* Use the shared error below. */
    }
  }
  throw new Error('DeepSeek returned invalid JSON.');
}

/**
 * Ask DeepSeek for one validated structured object.
 *
 * @param {object} task
 * @param {string} task.system
 * @param {string} task.prompt
 * @param {object} task.schema JSON schema for the expected object.
 * @param {(value: unknown) => boolean} task.validate Extra business validation.
 * @param {number} [task.maxOutputTokens]
 * @param {number} [task.timeoutMs]
 * @param {number} [task.temperature] Optional sampling temperature.
 * @param {object} [dependency] Test seam: optional { fetch, apiKey, model }.
 */
export async function generateStructured(task, dependency = {}) {
  if (dependency.apiKey === undefined && process.env.AI_API_KEY) {
    const result = await createAIClient({ fetchImpl: dependency.fetch || globalThis.fetch, timeoutMs: task.timeoutMs || 45000 }).callAIJson({
      system: task.system + '\nRequired JSON schema: ' + JSON.stringify(task.schema),
      messages: [{ role: 'user', content: task.prompt }],
      validate: task.validate,
      maxTokens: task.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: task.temperature,
    });
    return result.data;
  }
  const fetchImpl = dependency.fetch || globalThis.fetch;
  const key = dependency.apiKey ?? apiKey();
  const model = dependency.model ?? modelName();
  if (!key) throw new Error('No DeepSeek API key is configured.');
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation is available.');

  const system = [
    task.system,
    'Reply only with a single JSON object. Do not use Markdown fences or add prose outside the object.',
    'The object must match this JSON Schema exactly:',
    JSON.stringify(task.schema),
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), task.timeoutMs || 45000);
  timer.unref?.();

  let response;
  try {
    response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: task.prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: task.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
        ...(task.temperature == null ? {} : { temperature: task.temperature }),
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = '';
    if (typeof response.text === 'function') {
      try {
        detail = await response.text();
      } catch {
        /* The status is enough when the body cannot be read. */
      }
    }
    const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
    throw new Error(`DeepSeek request failed (${response.status})${suffix}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('DeepSeek returned an invalid JSON response.');
  }

  const choice = payload && payload.choices && payload.choices[0];
  const message = choice && choice.message;
  const value = parseJson(contentText(message && message.content));

  if (typeof task.validate !== 'function' || !task.validate(value)) {
    throw new Error('Invalid learning-path AI output.');
  }
  return value;
}
