const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('./dialogue-model.js');
const service=require('./dialogue-server.cjs');
const catalog=require('../shared/cases.json');
const flow=require('../shared/flow.js');
const handler=require('../api/dialogue.js');
function completed(){
  const s=M.create(catalog.samples['quiz-permissions'].part3.input,catalog,'api',false);
  M.applyOpening(s,{reply:'Review the delete operation.',code:''});
  s.messages.push({role:'user',text:'Allow admins only and preserve quizzes when denied.'});
  M.apply(s,{reply:'Your request is recorded.',coach:'Check all roles.',proposal:'',proposalCode:'',updates:[{issueId:'hidden-button-only',request:'Allow admins only and preserve quizzes when denied.',quote:'Allow admins only'}],rejected:[]});
  return s;
}
const summary={feedback:'You requested an admin check and preservation of quiz data on denial. Verify each role in Correction lab.'};
test('summary includes the entire conversation and manual requests without changing the plan',async()=>{
  const s=completed();
  for(let i=0;i<20;i++)s.messages.push({role:'user',text:'Review detail '+i},{role:'assistant',text:'Explanation '+i});
  s.requests['hidden-button-only'].request='Manual request: preserve the list.';
  const before=JSON.stringify(s.requests);
  const result=await service.summarize(service.read({action:'summary',session:s}),{callAIJson:async p=>{
    const input=JSON.parse(p.messages[0].content);
    assert.equal(input.conversation.length,s.messages.length);
    assert.equal(input.conversation[1].text,s.messages[1].text);
    assert.equal(input.requests['hidden-button-only'].request,'Manual request: preserve the list.');
    assert(!('referenceCode' in input.case));
    assert(p.validate(summary));assert(!p.validate({feedback:''}));assert(!p.validate({...summary,updates:[]}));
    return {data:summary};
  }});
  M.applyReview(s,result);assert.equal(JSON.stringify(s.requests),before);
  assert.equal(M.confirm(s).dialogue.feedback,summary.feedback);
  const restored=M.restore(JSON.parse(JSON.stringify([s])),catalog)[0];
  assert(M.hasReview(restored));
});
test('editing a request invalidates the summary and rejects a late response',()=>{
  const s=completed(),key=M.reviewKey(s);M.applyReview(s,summary);
  s.requests['hidden-button-only'].request='A revised request';
  assert(!M.hasReview(s));assert.throws(()=>M.confirm(s),/summary/);
  assert.throws(()=>M.applyReview(s,summary,key),/changed/);
  M.applyReview(s,summary);assert(M.hasReview(s));
});
test('continued dialogue invalidates summary and empty advice preserves previous coaching',()=>{
  const s=completed();M.applyReview(s,summary);
  s.messages.push({role:'user',text:'Explain that check.'});
  M.apply(s,{reply:'It checks the role.',coach:'',proposal:'',proposalCode:'',updates:[],rejected:[]});
  assert.equal(s.feedback,'Check all roles.');assert(!M.hasReview(s));assert.throws(()=>M.confirm(s),/summary/);
});
test('summary rejects empty or pending conversations and confirmation still requires every issue',()=>{
  const s=completed();s.pending=true;assert.throws(()=>service.read({action:'summary',session:s}));
  s.pending=false;s.messages.pop();assert.throws(()=>service.read({action:'summary',session:s}));
  const fresh=M.create(M.freshInput('quiz-permissions',catalog),catalog,'api',false);
  M.applyOpening(fresh,{reply:'Hello.',code:''});assert.throws(()=>service.read({action:'summary',session:fresh}));
  const missing=completed();missing.requests={};M.applyReview(missing,summary);assert.throws(()=>M.confirm(missing),/each issue/);
});
test('oversized full histories are rejected explicitly rather than silently truncated',async()=>{
  const s=completed();for(let i=0;i<15;i++)s.messages.push({role:'assistant',text:'x'.repeat(4000)});
  await assert.rejects(service.summarize(s,{callAIJson(){throw Error('Must not call AI');}}),{code:'SUMMARY_TOO_LONG'});
});
test('HTTP summary action uses the summary service and keeps its validated shape',async()=>{
  const configured=service.configured,summarize=service.summarize;
  try{
    service.configured=()=>true;service.summarize=async s=>{assert.equal(s.messages.length,3);return summary;};
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await handler({method:'POST',headers:{},body:{action:'summary',session:completed()}},res);
    assert.equal(res.code,200);assert.deepEqual(res.body,{result:summary,aiSource:'api'});
    const pending=completed();pending.pending=true;
    await handler({method:'POST',headers:{},body:{action:'summary',session:pending}},res);assert.equal(res.code,400);
  }finally{service.configured=configured;service.summarize=summarize;}
});
// Exercise the actual page handlers with a small DOM fixture and mocked HTTP responses.
async function page(){
  class Element {
    constructor(){this.children=[];this.hidden=false;this.value='';this.disabled=false;this.dataset={};}
    append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
    addEventListener(type,fn){this[type]=fn;} setAttribute(){} closest(){return new Element();}
    scrollIntoView(){} focus(){} click(){return this.onclick?.();}
  }
  const elements={};const $=id=>elements[id]??=new Element();
  const values={codeReview:[completed()]};let fail=false;const calls=[];
  const app={read:(k,d)=>values[k]??d,write:(k,v)=>(values[k]=v,true)};
  const context={document:{getElementById:$,createElement:()=>new Element(),querySelectorAll:()=>Object.values(elements)},window:{SkillLoopDialogue:M,SkillLoop:app,SkillLoopFlow:flow},location:{search:''},URLSearchParams,AbortSignal,JSON,console,setTimeout,
    fetch:async(url,options)=>{
      if(!options)return {ok:true,json:async()=>({catalog,available:true})};
      const body=JSON.parse(options.body);calls.push(body);
      return {ok:!fail,json:async()=>fail?{error:'Test timeout'}:{result:summary,aiSource:'api'}};
    }};
  await vm.runInNewContext(fs.readFileSync(require.resolve('./dialogue.js'),'utf8'),context);
  return {$,values,calls,setFail:v=>fail=v};
}
test('finish generates summary, hides chat, confirms and passes summary to verification',async()=>{
  const p=await page();await p.$('finish-chat').onclick();
  assert.equal(p.calls[0].action,'summary');assert.equal(p.$('workspace').hidden,true);
  assert.equal(p.$('plan-feedback').textContent,summary.feedback);assert.equal(p.$('confirm-plan').disabled,false);
  p.$('confirm-plan').onclick();assert.equal(p.$('continue-verification').hidden,false);
  assert.equal(p.values.repairPlans['quiz-permissions'].output.dialogue.feedback,summary.feedback);
  p.$('back-chat').onclick();assert.equal(p.$('workspace').hidden,false);
});
test('summary failure preserves work, offers retry and cannot confirm before recovery',async()=>{
  const p=await page();p.setFail(true);await p.$('finish-chat').onclick();
  assert.equal(p.$('confirm-plan').disabled,true);assert.equal(p.$('refresh-summary').hidden,false);
  assert.equal(p.values.codeReview[0].messages.length,3);
  p.setFail(false);await p.$('refresh-summary').onclick();assert.equal(p.$('confirm-plan').disabled,false);
  const card=p.$('plan-items').children[0],box=card.children.find(c=>c.children.some(n=>'oninput' in n)).children[0];
  box.value='Edited request';box.oninput();assert.equal(p.$('confirm-plan').disabled,true);
  assert.equal(p.$('refresh-summary').hidden,false);assert.equal(p.$('continue-verification').hidden,true);
  await p.$('refresh-summary').onclick();assert.equal(p.$('confirm-plan').disabled,false);
});
test('finish keeps an unsent draft visible rather than excluding it silently',async()=>{
  const p=await page();p.$('reply').value='An unsent correction';await p.$('finish-chat').onclick();
  assert.equal(p.calls.length,0);assert.equal(p.$('workspace').hidden,false);
  assert.match(p.$('status').textContent,/Send or clear/);
});
