import { AIError } from '../server/ai.mjs';
import { generate, validateRequest } from './learning-server.mjs';

export async function handleLearningRequest(request, run = generate) {
  if (request.method !== 'POST') return Response.json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST for learning feedback.' }, { status: 405 });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 30000) return Response.json({ code: 'INVALID_INPUT', message: 'Learning request is too large.' }, { status: 413 });
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 30000) throw new Error();
    body = JSON.parse(raw);
  } catch { return Response.json({ code: 'INVALID_INPUT', message: 'Learning request could not be read.' }, { status: 400 }); }
  if (!validateRequest(body)) return Response.json({ code: 'INVALID_INPUT', message: 'Learning request is incomplete or invalid.' }, { status: 400 });
  try {
    const result = await run(body);
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = error instanceof AIError ? error : new AIError('PROVIDER_ERROR', 'The learning service could not complete the request.');
    const status = safe.code === 'NOT_CONFIGURED' ? 503 : safe.code === 'RATE_LIMITED' ? 429 :
      safe.code === 'INVALID_INPUT' ? 400 : safe.code === 'TIMEOUT' ? 504 : 502;
    return Response.json({ code: safe.code, message: safe.message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
