const service=require('../interview/dialogue-server.cjs');
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET') return res.status(200).json({available:service.configured(),catalog:{cases:service.catalog.cases,topics:service.catalog.topics}});
  if(req.method!=='POST') return res.status(405).json({error:'Use GET or POST.'});
  let body,session;
  try {
    if(Number(req.headers?.['content-length'])>250000) return res.status(413).json({error:'Conversation too large. Export it and start a new review.'});
    body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(JSON.stringify(body).length>250000) return res.status(413).json({error:'Conversation too large. Export it and start a new review.'});
    if(!['open','reply','summary'].includes(body?.action)) throw Error('Unsupported action.');
    session=service.read(body);
  } catch {return res.status(400).json({error:'The conversation input could not be read. Keep your draft and reload the task.'});}
  if(!service.configured()) return res.status(503).json({error:'Live AI is not configured. Your reply is saved; retry after configuration.'});
  try {
    const result=body.action==='open'?await service.opening(session):body.action==='summary'?await service.summarize(session):await service.generate(session);
    return res.status(200).json({result,aiSource:'api'});
  } catch(error) {
    console.error('[dialogue] request failed:', error.code || error.name || 'UNKNOWN');
    const messages = {
      SUMMARY_TOO_LONG: 'This conversation is too long to summarize. Export it and start a shorter review.',
      AUTH_FAILED: 'AI authentication failed. Check the API key, endpoint region and model access on the server. Your message is saved.',
      RATE_LIMITED: 'AI is busy or its quota is exhausted. Your message is saved; retry later.',
      NETWORK_ERROR: 'The AI service could not be reached. Your message is saved; please retry.',
      TIMEOUT: 'AI timed out. Your reply is saved; retry without resending it.',
    };
    return res.status(502).json({error: messages[error.code] || (body.action==='summary'?'AI could not produce a valid summary. Your conversation and requests are saved; please retry.':'AI could not produce a valid reply. Your conversation is saved; please retry.')});
  }
};
