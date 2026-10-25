/** Vercel endpoint for the correction lab. All logic lives in correction-lab/server.cjs. */
const service = require('../correction-lab/server.cjs');

global.window = global.window || {};
require('../correction-lab/cases.js');
const example = global.window.SkillLoopCases[0];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Vercel sends a short-lived OIDC token that AI Gateway accepts instead of an API key.
  const oidcToken = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (req.method === 'GET') {
    const available = service.configured(process.env, oidcToken);
    const ai = available ? service.provider(process.env, oidcToken) : null;
    return res.status(200).json({ available, provider: ai ? ai.name : null });
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
    service.readRequest(body);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'The request could not be read.' });
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
