import diagnosis from '../learning-path/server/diagnosis.cjs';
import questions from '../learning-path/server/questions.cjs';
import {
  createAIClient,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MODEL,
  PROVIDER,
  apiKey,
  generateStructured,
} from '../server/ai.mjs';

const PROVIDER_DEFINITIONS = [
  {
    id: 'deepseek',
    label: 'DeepSeek (Part 1 direct)',
    description: 'Uses DEEPSEEK_API_KEY, or AI_GATEWAY_API_KEY as the legacy fallback.',
  },
  {
    id: 'shared',
    label: 'Team shared AI',
    description: 'Uses the same AI_BASE_URL, AI_API_KEY and AI_MODEL configuration as Parts 2-4.',
  },
];

function directModel(env = process.env) {
  return (
    (env.LEARNING_PATH_AI_MODEL && env.LEARNING_PATH_AI_MODEL.trim()) ||
    (env.DEEPSEEK_MODEL && env.DEEPSEEK_MODEL.trim()) ||
    DEFAULT_MODEL
  );
}

function directKey(env = process.env) {
  return String(apiKey(env) || '').trim();
}

function sharedSettings(env = process.env) {
  const key = env.AI_API_KEY && env.AI_API_KEY.trim();
  const model = env.AI_MODEL && env.AI_MODEL.trim();
  let base;
  try {
    base = new URL(env.AI_BASE_URL);
  } catch {
    /* The provider is unavailable until all three settings are valid. */
  }
  const available = Boolean(
    key &&
      model &&
      base &&
      base.protocol === 'https:' &&
      !base.username &&
      !base.password &&
      !base.search &&
      !base.hash &&
      !/[{}]/.test(env.AI_BASE_URL)
  );
  return { available, model: available ? model : null };
}

function providerCatalog(env = process.env) {
  const shared = sharedSettings(env);
  const deepseekAvailable = Boolean(directKey(env));
  return PROVIDER_DEFINITIONS.map((provider) => {
    if (provider.id === 'shared') {
      return { ...provider, available: shared.available, model: shared.model };
    }
    return {
      ...provider,
      available: deepseekAvailable,
      model: deepseekAvailable ? directModel(env) : null,
    };
  });
}

function configuredProviders(env = process.env) {
  return providerCatalog(env).filter((provider) => provider.available);
}

function selectedProvider(body, env = process.env) {
  const fallback = directKey(env)
    ? 'deepseek'
    : sharedSettings(env).available
      ? 'shared'
      : 'deepseek';
  const requested = body && body.aiProvider != null ? body.aiProvider : fallback;
  if (!PROVIDER_DEFINITIONS.some((provider) => provider.id === requested)) {
    throw Object.assign(new Error('aiProvider must be "deepseek" or "shared".'), {
      status: 400,
    });
  }
  const providers = providerCatalog(env);
  const provider = providers.find((item) => item.id === requested);
  if (!provider || !provider.available) {
    const anyAvailable = providers.some((item) => item.available);
    throw Object.assign(
      new Error(
        anyAvailable
          ? requested === 'shared'
            ? 'The team shared AI is not configured in this environment.'
            : 'Direct DeepSeek is not configured in this environment.'
          : 'Live AI is not configured in this environment.'
      ),
      { status: 503, code: 'ai-not-configured' }
    );
  }
  return provider;
}

async function generateForProvider(task, provider) {
  if (provider.id === 'shared') {
    const result = await createAIClient({
      timeoutMs: task.timeoutMs || 45000,
    }).callAIJson({
      system: [
        task.system,
        'Required JSON schema:',
        JSON.stringify(task.schema),
      ].join('\n'),
      messages: [{ role: 'user', content: task.prompt }],
      validate: task.validate,
      maxTokens: task.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: task.temperature,
    });
    return result.data;
  }
  return generateStructured(task, {
    // Passing apiKey explicitly keeps the legacy DeepSeek path selected even
    // when the shared AI_* settings are present.
    apiKey: directKey(),
    model: directModel(),
  });
}

function send(res, status, payload) {
  if (typeof res.status === 'function') {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (res.setHeader) res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const providers = providerCatalog();
    const availableProviders = configuredProviders();
    const primary =
      availableProviders.find((provider) => provider.id === 'deepseek') ||
      availableProviders[0] ||
      null;
    return send(res, 200, {
      available: Boolean(primary),
      // Legacy fields keep older Part 1 clients working.
      provider: PROVIDER,
      model: primary ? primary.model : null,
      contractVersion: 1,
      aiProviders: providers,
      defaultAiProvider: primary ? primary.id : 'deepseek',
    });
  }

  if (req.method !== 'POST') {
    if (res.setHeader) res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }

  let body;
  try {
    body = parseBody(req);
  } catch (error) {
    return send(res, error.status || 400, { error: error.message });
  }
  if (body == null) {
    return send(res, 400, { error: 'Request body must be valid JSON.' });
  }

  let serialized;
  try {
    serialized = JSON.stringify(body);
  } catch {
    return send(res, 400, { error: 'Request body must be valid JSON.' });
  }
  if (!serialized || serialized.length > diagnosis.MAX_BODY) {
    return send(res, 413, { error: 'Diagnosis request is too large.' });
  }

  try {
    if (body.action === 'questions') questions.readRequest(body);
    else diagnosis.readRequest(body);
  } catch (error) {
    return send(res, error.status || 400, { error: error.message });
  }

  let provider;
  try {
    provider = selectedProvider(body);
  } catch (error) {
    return send(res, error.status || 400, {
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  }

  try {
    if (body.action === 'questions') {
      const prepared = questions.prepare(body);
      const generated = await generateForProvider(prepared, provider);
      const questionSet = questions.normalize(generated, prepared.caseData);
      return send(res, 200, {
        source: 'ai',
        caseId: prepared.caseData.id,
        questions: questionSet,
        aiProvider: provider.id,
        model: provider.model,
      });
    }

    const prepared = diagnosis.prepare(body);
    const result = await generateForProvider(prepared, provider);
    return send(res, 200, {
      result,
      source: 'ai',
      aiProvider: provider.id,
      model: provider.model,
    });
  } catch (error) {
    if (error && Number.isInteger(error.status) && error.status < 500) {
      return send(res, error.status, { error: error.message });
    }
    const task = body.action === 'questions' ? 'question generation' : 'diagnosis';
    console.error('Learning-path ' + task + ' failed:', error && error.message);
    return send(res, 502, {
      error: 'The AI ' + task + ' could not be completed. Please retry.',
      code: 'ai-failed',
    });
  }
}

export const config = { maxDuration: 60 };
