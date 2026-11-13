/** Vercel endpoint for the correction lab. All logic lives in correction-lab/server.cjs. */
const service = require('../correction-lab/server.cjs');

// cases.js attaches to window in the browser and to globalThis here. Never create a global
// window on the server: the shared AI helper refuses to run when one exists.
require('../correction-lab/cases.js');
const example = (globalThis.SkillLoopCases || globalThis.window.SkillLoopCases)[0];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Vercel sends a short-lived OIDC token that AI Gateway accepts instead of an API key.
  const oidcToken = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (req.method === 'GET') {
    const available = service.configured(process.env, oidcToken);
    const ai = available ? service.provider(process.env, oidcToken) : null;
    return res.status(200).json({ available, provider: ai ? ai.name : null, review: service.reviewConfigured() });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(body).length > 10000) {
      return res.status(413).json({ error: 'The lecture notes are too long.' });
    }
    if (body && body.action === 'review') service.readReview(body);
    else service.readRequest(body);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'The request could not be read.' });
  }
  // Part 4: review real test results with the team's shared AI helper.
  if (body.action === 'review') {
    const { callAI, AIError } = await import('../server/ai.mjs');
    try {
      return res.status(200).json(await service.review(body, { callAI, AIError }));
    } catch (error) {
      if (!(error instanceof AIError)) console.error(`Correction review failed: ${error.name}`);
      const code = error instanceof AIError ? error.code : 'PROVIDER_ERROR';
      return res.status(code === 'NOT_CONFIGURED' ? 503 : 502).json({
        code,
        error: error instanceof AIError ? error.message : 'The AI review failed. Try again.',
      });
    }
  }
  try {
    return res.status(200).json(await service.draft(body, { example, oidcToken }));
  } catch (error) {
    if (!error.status) console.error(`Correction draft failed: ${error.name}`);
    return res
      .status(error.status || 502)
      .json({ error: error.status ? error.message : 'The AI draft failed. Try again.' });
  }
};

// Free models are slow; Hobby allows up to 300 seconds.
module.exports.config = { maxDuration: 180 };
