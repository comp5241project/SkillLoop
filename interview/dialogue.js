(async function () {
  const $=id=>document.getElementById(id), M=window.SkillLoopDialogue, app=window.SkillLoop;
  let catalog,available=false,session=null,busy=false,records=[], imported=null;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const say=text=>{$('status').textContent=text;};
  function save(){if(session && !session.confirmed){window.SkillLoopFlow.invalidatePlan(app,session.context.case.caseId);$('continue-verification').hidden=true;}const ok=app.write('codeReview',records);$('storage-note').hidden=ok;if(!ok)say('Storage is unavailable. Export your record before leaving.');return ok;}
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function lock(value){busy=value;document.querySelectorAll('button,select,input,textarea').forEach(n=>n.disabled=value);$('reply').disabled=value||session?.pending;$('send').disabled=value||session?.pending;$('start-live').disabled=value||!available;$('case-select').disabled=value||Boolean(imported);$('retry').hidden=!session?.pending;$('retry').textContent=session?.messages.length===0?'Retry opening':'Retry reply';$('review-plan').disabled=value||session?.pending;}
  function persistEdit(){if(!session)return;session.draft=$('reply').value;save();}
  function render(scroll=true){
    if(!session)return;
    $('start').hidden=true;$('workspace').hidden=false;$('plan').hidden=true;
    $('task-title').textContent=session.context.case.title;
    $('focus').textContent=session.context.learning.practiceFocus.join(' ');$('focus').closest('details').hidden=!session.context.learning.practiceFocus.length;
    $('requirements').replaceChildren(...session.context.case.requirements.map(t=>el('li',t)));
    $('code').textContent=session.context.case.starterCode;
    $('chat').replaceChildren();
    for(const message of session.messages){
      const item=el('article',undefined,'rd-message '+(message.role==='user'?'user':''));
      item.append(el('div',message.role==='user'?'You':'Maya','speaker'),el('p',message.text));
      if(message.sourceCode)item.append(el('pre',message.sourceCode,'rd-code'));
      if(message.coach){const d=el('details',undefined,'rd-coach');d.append(el('summary','✧ AI Coach'),el('p',message.coach));item.append(d);}
      if(message.proposal||message.code){const d=el('details');d.append(el('summary','Proposed change · untested'),el('p',message.proposal||''));if(message.code)d.append(el('pre',message.code,'rd-code'));item.append(d);}
      $('chat').append(item);
    }
    $('reply').value=session.draft||'';
    const recorded=session.context.case.issues.filter(i=>session.requests[i.issueId]).length;
    $('progress').textContent=recorded+' of '+session.context.case.issues.length+' requests recorded';
    $('memory').replaceChildren(...Object.values(session.requests).map(r=>el('li',r.request)),...session.rejected.map(r=>el('li','Rejected: '+r)));
    $('confirmed-note').hidden=!session.confirmed;
    lock(busy);
    if(scroll)$('chat').scrollTop=session.messages.length<=1?0:$('chat').scrollHeight;
  }
  async function getReply(){
    if(busy||!session?.pending)return;
    const opening=session.mode==='api'&&session.messages.length===0;
    lock(true);say(opening?'Maya is preparing your review…':'Maya is reviewing your message…');
    try {
      const response=await fetch('/api/dialogue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:opening?'open':'reply',session}),signal:AbortSignal.timeout(60000)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'The request failed.');
      if(data.aiSource!==session.mode)throw Error('Reply source mismatch.');
      if(opening)M.applyOpening(session,data.result);else M.apply(session,data.result);save();say('');
    }catch(error){say(error.name==='TimeoutError'?(opening?'Request timed out. Select Retry opening.':'Request timed out. Your message is saved. Select Retry reply.'):error.message);}
    finally{lock(false);render();}
  }
  $('compose').addEventListener('submit',event=>{
    event.preventDefault();if(busy||!session||session.pending)return;
    const text=$('reply').value.trim();if(!text)return;
    session.messages.push({role:'user',text,assisted:session.assisted||false});session.assisted=false;
    session.draft='';session.pending=true;session.confirmed=false;session.output=null;save();render();$('main-content').scrollIntoView({block:'start'});getReply();
  });
  $('reply').addEventListener('input',persistEdit);
  $('reply').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){$('compose').requestSubmit();}});
  $('retry').onclick=getReply;
  $('hints').onclick=()=>{$('hint-box').hidden=!$('hint-box').hidden;};
  for(const text of ['Show me how the delivered code handles…','The requirement says… but this change…','Please preserve… and verify it with…']){
    const b=el('button',text,'rd-btn');b.type='button';b.onclick=()=>{const box=$('reply');box.value+=(box.value?'\n':'')+text;session.assisted=true;persistEdit();box.focus();};$('hint-box').append(b);
  }
  function start(){
    const raw=imported||M.freshInput($('case-select').value,catalog);
    session=M.create(raw,catalog,'api',false);session.learningCompletedAt=imported ? window.SkillLoopFlow.learningRecord(app,raw.case.caseId)?.learned.completedAt || null : null;records.push(session);records=records.slice(-20);save();render();$('main-content').scrollIntoView({block:'start'});getReply();
  }
  $('start-live').onclick=()=>{if(!available){say('AI is unavailable. Please try again later.');return;}start();};
  $('new-task').onclick=()=>{if(busy)return;$('workspace').hidden=true;$('plan').hidden=true;$('start').hidden=false;session=null;say('');showHistory();};
  function showHistory(){
    $('history').replaceChildren();
    for(const s of [...records].reverse()) {const b=el('button',s.context.case.title+' · '+s.messages.filter(m=>m.role==='user').length+' replies','rd-btn');b.onclick=()=>{session=s;render();say(s.pending?'A response is pending. Select Retry to continue.':'');};$('history').append(b);}
  }
  $('history-toggle').onclick=()=>{$('history').hidden=!$('history').hidden;showHistory();};
  $('import-input').onchange=async e=>{
    try{const file=e.target.files[0];if(!file)return;if(file.size>100000)throw Error('Input file is too large.');const raw=JSON.parse(await file.text());M.input(raw,catalog);imported=raw;$('case-select').value=raw.case.caseId;$('case-select').disabled=true;$('input-label').hidden=false;$('input-label').textContent='Learning record imported';say('');}
    catch(error){say(error.message);e.target.value='';}
  };
  $('reset-input').onclick=()=>{imported=null;$('case-select').disabled=false;$('input-label').hidden=true;$('input-label').textContent='';$('import-input').value='';};
  $('export-record').onclick=()=>download(session,'skillloop-dialogue-record.json');
  $('review-plan').onclick=()=>{
    if(!session||busy||session.pending)return;
    $('plan').hidden=false;$('plan-items').replaceChildren();
    for(const i of session.context.case.issues){
      const card=el('article');card.append(el('h3',i.title));
      if(!session.requests[i.issueId])card.append(el('p','Not discussed yet. Add a request or ask Maya.','missing'));
      const label=el('label','Your repair request');const box=el('textarea');box.maxLength=1000;box.value=session.requests[i.issueId]?.request||'';box.setAttribute('aria-label',i.title+' repair request');
      box.oninput=()=>{session.requests[i.issueId]={request:box.value,quote:'',manual:true};session.confirmed=false;session.output=null;save();$('confirm-plan').disabled=false;$('download-output').hidden=true;say('Request changed. Confirm the updated plan before exporting.');};
      label.append(box);card.append(label);
      const checks=el('details');checks.append(el('summary','Acceptance checks'));
      const ul=el('ul');for(const id of i.suggestedChecks){const t=session.context.case.tests.find(t=>t.testId===id);ul.append(el('li',t.action+' → '+t.expected));}checks.append(ul);card.append(checks);$('plan-items').append(card);
    }
    $('plan-feedback').textContent=session.feedback||'No AI feedback yet.';
    $('download-output').hidden=!session.confirmed;$('continue-verification').hidden=!session.confirmed||!window.SkillLoopFlow.readPlan(app,session.context.case.caseId);$('continue-verification').href='/correction-lab/?case='+encodeURIComponent(session.context.case.caseId);$('confirm-plan').disabled=false;$('plan-title').focus();$('plan').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('back-chat').onclick=()=>{$('plan').hidden=true;$('reply').focus();$('compose').scrollIntoView({behavior:'smooth',block:'center'});};
  $('confirm-plan').onclick=()=>{try{const output=M.handoff(session);session.output=output;session.confirmed=true;const handed=window.SkillLoopFlow.savePlan(app,output,session.learningCompletedAt);$('continue-verification').hidden=!handed;$('continue-verification').href='/correction-lab/?case='+encodeURIComponent(output.caseId);session.revisions.push({at:new Date().toISOString(),output});session.revisions=session.revisions.slice(-20);const ok=save();$('download-output').hidden=false;$('confirm-plan').disabled=true;say(ok && handed?'Plan saved. Continue to verification.':'Plan confirmed for this visit. Download it before leaving.');}catch(error){say(error.message);}};
  $('download-output').onclick=()=>download(session.output,'skillloop-part3-output.json');
  try {
    const response=await fetch('/api/dialogue');if(!response.ok)throw Error('Could not load the cases.');const data=await response.json();catalog=data.catalog;available=data.available;
    for(const c of Object.values(catalog.cases)){const o=el('option',c.title);o.value=c.caseId;$('case-select').append(o);}
    const selected=new URLSearchParams(location.search).get('case');
    if(new URLSearchParams(location.search).get('flow')==='1'){
      imported=window.SkillLoopFlow.dialogueInput(app,catalog,selected);
      if(!imported)throw Error('Complete diagnosis and learning for this case first.');
      M.input(imported,catalog);$('input-label').hidden=false;$('input-label').textContent='Your diagnosis and learning focus are ready';$('case-select').disabled=true;
    }if(catalog.cases[selected])$('case-select').value=selected;
    records=M.restore(app.read('codeReview',[]),catalog);$('start-live').disabled=!available;
    $('connection').textContent=available?'':'AI is unavailable. Please try again later.';showHistory();say('');
    if(records.length&&!selected){session=records.at(-1);render();if(session.pending)say('A response is pending. Select Retry to continue.');}
  }catch(error){say(error.message+' Please reload to try again.');}
})();
