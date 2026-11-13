/** Part 3 state and handoff rules, shared by browser and server. */
(function (root) {
  const text = (v, max = 3000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const clone = v => JSON.parse(JSON.stringify(v));
  function input(raw, catalog) {
    const c = catalog.cases[raw?.case?.caseId];
    const topics = catalog.topics.map(t => t.topicId);
    const ids = a => Array.isArray(a) && a.length <= 12 && a.every(t => topics.includes(t));
    if (!c || !text(raw.assessment?.summary) || !ids(raw.assessment.weakTopics) ||
      !['detect','explain','instruct','verify'].every(k => ['shown','needs_practice','not_observed'].includes(raw.assessment.skills?.[k])) ||
      !ids(raw.learning?.studiedTopics) || !ids(raw.learning.needsPractice) || !Array.isArray(raw.learning.practiceFocus) ||
      raw.learning.practiceFocus.length > 12 || !raw.learning.practiceFocus.every(t => text(t,500))) throw Error('Use the agreed part 3 input: case, assessment and learning.');
    // Never trust a client-supplied replacement for the case requirements or code.
    return {case: clone(c), assessment: clone(raw.assessment), learning: clone(raw.learning)};
  }
  function create(raw, catalog, mode, sampleInput = true) {
    const context = input(raw,catalog);
    if (!['sample','api'].includes(mode)) throw Error('Choose Sample or Live AI.');
    return {id: globalThis.crypto.randomUUID(), mode, sampleInput, context, draft:'', messages:[{role:'assistant',text:context.case.aiClaim, opening:true}],
      requests:{}, rejected:[], proposal:'', proposalCode:'', feedback:'', pending:false, confirmed:false, output:null, revisions:[]};
  }
  function validTurn(r, session) {
    const last = session.messages.at(-1);
    const validIssue = id => session.context.case.issues.some(i=>i.issueId===id);
    return last?.role==='user' && text(r?.reply,2200) && typeof r.coach==='string' && r.coach.length<=800 &&
      typeof r.proposal==='string' && r.proposal.length<=1800 && typeof r.proposalCode==='string' && r.proposalCode.length<=10000 &&
      Array.isArray(r.updates) && r.updates.length<=session.context.case.issues.length &&
      new Set(r.updates.map(u=>u.issueId)).size===r.updates.length &&
      r.updates.every(u=>validIssue(u.issueId) && text(u.request,1800) && text(u.quote,500) && last.text.includes(u.quote)) &&
      Array.isArray(r.rejected) && r.rejected.length<=6 && r.rejected.every(x=>text(x,400));
  }
  function apply(session, result) {
    if (!validTurn(result,session)) throw Error('The reply did not match the current conversation.');
    for (const u of result.updates) session.requests[u.issueId] = {request:u.request,quote:u.quote};
    session.rejected=[...new Set([...session.rejected,...result.rejected])].slice(-30);
    if(result.proposal) session.proposal=result.proposal;
    if(result.proposalCode) session.proposalCode=result.proposalCode;
    session.feedback=result.coach;
    session.messages.push({role:'assistant',text:result.reply,coach:result.coach,proposal:result.proposal,code:result.proposalCode});
    session.pending=false; session.confirmed=false; session.output=null;
  }
  function handoff(session) {
    if (session.pending || !session.messages.some(m=>m.role==='user')) throw Error('Finish a conversation turn first.');
    const c=session.context.case;
    if (c.issues.some(i=>!text(session.requests[i.issueId]?.request,1800))) throw Error('Discuss or write a request for each issue before confirming.');
    return {caseId:c.caseId,aiSource:session.mode,dialogue:{
      plan:c.issues.map(i=>({issueId:i.issueId,problem:i.observed,changeRequest:session.requests[i.issueId].request,
        checks:i.suggestedChecks.map(id=>{const t=c.tests.find(t=>t.testId===id); return {testId:id,input:t.action,expected:t.expected};})})),
      feedback:session.feedback || 'Review the conversation and the requests you confirmed. No tests have run in this dialogue.',confirmed:true}};
  }
  function restore(value,catalog) {
    const records=[];
    for(const s of Array.isArray(value)?value:[]) {
      try {
        if (!s || !text(s.id,100) || !['sample','api'].includes(s.mode) || !Array.isArray(s.messages) || s.messages.length>600 ||
          !s.messages.every(m=>['user','assistant'].includes(m.role)&&text(m.text,5000)) || !s.requests || typeof s.requests!=='object') continue;
        s.context=input(s.context,catalog);
        for(const key of Object.keys(s.requests)) if(!s.context.case.issues.some(i=>i.issueId===key)||!text(s.requests[key]?.request,1800)) delete s.requests[key];
        s.rejected=Array.isArray(s.rejected)?s.rejected.filter(x=>text(x,400)).slice(-30):[];
        s.draft=typeof s.draft==='string'?s.draft.slice(0,2000):'';
        s.revisions=Array.isArray(s.revisions)?s.revisions.slice(-20):[];
        s.pending=s.messages.at(-1)?.role==='user';
        if(s.confirmed&&!s.pending) s.output=handoff(s); else {s.confirmed=false;s.output=null;}
        records.push(s);
      } catch { /* Preserve other readable sessions; never fabricate a completed record. */ }
    }
    return records.slice(-20);
  }
  const api={input,create,validTurn,apply,handoff,restore};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.SkillLoopDialogue=api;
})(globalThis);
