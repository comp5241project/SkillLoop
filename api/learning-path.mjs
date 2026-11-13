import diagnosis from '../learning-path/server/diagnosis.cjs';
import questions from '../learning-path/server/questions.cjs';
import { configured, generateStructured, modelName, PROVIDER } from '../server/ai.mjs';

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
    const available = configured();
    return send(res, 200, {
      available,
      provider: process.env.AI_API_KEY ? 'Shared AI' : PROVIDER,
      model: available ? modelName() : null,
      contractVersion: 1,
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

  if (!configured()) {
    return send(res, 503, {
      error: 'Live AI is not configured in this environment.',
      code: 'ai-not-configured',
    });
  }

  try {
    if (body.action === 'questions') {
      const prepared = questions.prepare(body);
      const generated = await generateStructured(prepared);
      const questionSet = questions.normalize(generated, prepared.caseData);
      return send(res, 200, {
        source: 'ai',
        caseId: prepared.caseData.id,
        questions: questionSet,
      });
    }

    const prepared = diagnosis.prepare(body);
    const result = await generateStructured(prepared);
    return send(res, 200, { result, source: 'ai' });
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
