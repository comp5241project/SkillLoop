/**
 * Shared AI service for every learning-path part.
 *
 * Part 1 talks directly to DeepSeek's OpenAI-compatible Chat Completions API.
 * All four parts must call this module instead of creating their own provider
 * configuration.
 *
 * Configuration:
 * - DEEPSEEK_API_KEY (preferred), with AI_GATEWAY_API_KEY kept as a migration
 *   fallback for the existing local environment.
 * - DEEPSEEK_MODEL, defaulting to the DeepSeek V4.1 Flash model id.
 * - Optional per-module LEARNING_PATH_AI_MODEL override.
 */
export const PROVIDER = 'DeepSeek';
export const DEFAULT_MODEL = 'deepseek-flash';
export const DEFAULT_MAX_OUTPUT_TOKENS = 8000;
export const API_URL = 'https://api.deepseek.com/chat/completions';

export function modelName(env = process.env) {
  return env.LEARNING_PATH_AI_MODEL || env.DEEPSEEK_MODEL || DEFAULT_MODEL;
}

export function apiKey(env = process.env) {
  return env.DEEPSEEK_API_KEY || env.AI_GATEWAY_API_KEY || '';
}

export function configured(env = process.env) {
  return Boolean(apiKey(env));
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
