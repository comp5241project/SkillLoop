const service=require('../interview/dialogue-server.cjs');
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET') return res.status(200).json({available:service.configured(),catalog:service.catalog});
  if(req.method!=='POST') return res.status(405).json({error:'Use GET or POST.'});
  let body,session;
  try {
    if(Number(req.headers?.['content-length'])>250000) return res.status(413).json({error:'Conversation too large. Export it and start a new review.'});
    body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(JSON.stringify(body).length>250000) return res.status(413).json({error:'Conversation too large. Export it and start a new review.'});
    session=service.read(body);
  } catch {return res.status(400).json({error:'The conversation input could not be read. Keep your draft and reload the task.'});}
  if(body.action==='reply'&&!service.configured()) return res.status(503).json({error:'Live AI is not configured. Your reply is saved; retry after configuration.'});
  try {
    const result=body.action==='sample'?service.sample(session):await service.generate(session);
    return res.status(200).json({result,aiSource:body.action==='sample'?'sample':'api'});
  } catch(error) {
    return res.status(502).json({error: error.code==='TIMEOUT'?'AI timed out. Your reply is saved; retry without resending it.':'AI could not produce a valid reply. Your conversation is saved; please retry.'});
  }
};
