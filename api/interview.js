const service = require('../interview/server.cjs');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ available: service.configured() });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!service.configured())
    return res
      .status(503)
      .json({ error: 'Live AI is not configured. Your interview is saved; you can retry later.' });
  if (Number(req.headers['content-length']) > 45000)
    return res.status(413).json({ error: 'Interview record is too large.' });
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(body).length > 45000)
      return res.status(413).json({ error: 'Interview record is too large.' });
    service.input(body);
  } catch (_) {
    return res
      .status(400)
      .json({ error: 'The interview record could not be read. Reopen it from History.' });
  }
  try {
    return res.status(200).json({ result: await service.generate(body), source: 'ai' });
  } catch (_) {
    return res
      .status(502)
      .json({ error: 'Maya could not connect just now. Your answer is saved. Please retry.' });
  }
};
