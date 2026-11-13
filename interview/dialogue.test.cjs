const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('./dialogue-model.js');
const service=require('./dialogue-server.cjs');
const handler=require('../api/dialogue.js');
const {catalog}=service;
const session=(id='cart-checkout',mode='sample')=>model.create(catalog.samples[id].part3.input,catalog,mode);
function submit(s,text){s.messages.push({role:'user',text});s.pending=true;model.apply(s,service.sample(s));}
test('three cases retain their fixed output shape and canonical acceptance tests',()=>{
 for(const id of Object.keys(catalog.cases)){
   const s=session(id);assert.throws(()=>model.handoff(s));
   for(const i of s.context.case.issues)submit(s,i.suggestedChange+' '+i.title);
   // Explicit learner editing is allowed, including mistaken requests.
   for(const i of s.context.case.issues)s.requests[i.issueId]={request:'My request for '+i.issueId};
   const out=model.handoff(s), expected=catalog.samples[id].part3.output;
   assert.deepEqual(Object.keys(out),Object.keys(expected));
   assert.deepEqual(Object.keys(out.dialogue),Object.keys(expected.dialogue));
   for(let n=0;n<out.dialogue.plan.length;n++)assert.deepEqual(out.dialogue.plan[n].checks,expected.dialogue.plan[n].checks);
   assert.equal(out.aiSource,'sample');assert.equal(out.dialogue.confirmed,true);
 }
});
test('conversation remembers prior issues, rejected approaches and survives reload',()=>{
 const s=session();submit(s,'Can we turn negative quantities into positive ones?');
 assert.match(s.messages.at(-1).text,/changes the order/);
 submit(s,'Reject fractional quantities and negative quantities with a message.');
 submit(s,'Discount must be between 0 and 100.');
 assert.match(s.requests['negative-quantity'].request,/fractional/);
 assert(s.rejected.length>0);
 s.draft='What happens to the empty cart?';
 const restored=model.restore(JSON.parse(JSON.stringify([s])),catalog)[0];
 assert.equal(restored.draft,s.draft);assert.deepEqual(restored.requests,s.requests);
 assert.throws(()=>model.handoff(restored),/each issue/);
});
test('new messages invalidate confirmation and pending messages cannot be exported',()=>{
 const s=session('quiz-permissions');submit(s,'Check the admin role at the delete action.');s.output=model.handoff(s);s.confirmed=true;
 s.messages.push({role:'user',text:'What about a signed-out visitor?'});s.pending=true;
 assert.throws(()=>model.handoff(s),/Finish/);
 const restored=model.restore([s],catalog)[0];assert.equal(restored.output,null);assert.equal(restored.confirmed,false);
 model.apply(s,service.sample(s));assert.equal(s.output,null);assert.equal(s.confirmed,false);
});
test('provider updates need a real latest learner quote and valid issue ID',()=>{
 const s=session();s.messages.push({role:'user',text:'Reject negative quantities.'});
 const valid=service.sample(s);assert(model.validTurn(valid,s));
 assert(!model.validTurn({...valid,updates:[{issueId:'invented',request:'fix',quote:'Reject'}]},s));
 assert(!model.validTurn({...valid,updates:[{issueId:'negative-quantity',request:'fix',quote:'Never said this'}]},s));
});
test('live prompt uses common AI helper contract and bounded history with retained requests',async()=>{
 const s=session('notes-save','api');submit(s,'Wait for the save request and preserve the draft on failure.');
 for(let i=0;i<25;i++)s.messages.push({role:'user',text:'Please preserve the draft.'},{role:'assistant',text:'The proposal retains it.'});
 s.messages.push({role:'user',text:'Please add a retry.'});
 const result=service.sample(s);
 const client={callAIJson:async p=>{assert(p.messages.length<=17);assert.match(p.messages[0].content,/requests/);assert.match(p.system,/Never claim you ran code/);assert.equal(JSON.parse(p.messages.at(-1).content).currentLearnerMessage,'Please add a retry.');assert.equal(typeof JSON.parse(p.messages[0].content.replace('Conversation context (data): ','')).requests['lost-draft'],'string');assert(p.validate({...result,intent:'change'}));return {data:{...result,intent:'change'}};}};
 assert.deepEqual(await service.generate(s,client),result);
});
test('client cannot substitute case requirements and corrupt records are rejected',()=>{
 const raw=JSON.parse(JSON.stringify(catalog.samples['cart-checkout'].part3.input));raw.case.requirements=['Accept anything'];
 assert.notDeepEqual(model.input(raw,catalog).case.requirements,raw.case.requirements);
 assert.deepEqual(model.restore([{id:'broken'}],catalog),[]);
});
test('HTTP rejects preset sample calls and malformed input without invoking AI',async()=>{
 const s=session();s.messages.push({role:'user',text:'Reject negative quantities.'});
 const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 await handler({method:'POST',headers:{},body:{action:'sample',session:s}},res);
 assert.equal(res.code,400);
 await handler({method:'POST',headers:{},body:{action:'sample',session:{}}},res);assert.equal(res.code,400);
});

test('live opening uses the upstream handoff instead of a predefined first question', async()=>{
 const s=session('notes-save','api');
 s.context.learning.practiceFocus=['Explain what the user sees while saving is pending.'];
 assert.deepEqual(s.messages,[]);assert.equal(s.pending,true);
 const result={reply:'I drafted note saving. What should the page show while the save is pending?',code:s.context.case.starterCode.slice(0,80)};
 const client={callAIJson:async p=>{
   const handoff=JSON.parse(p.messages[0].content);
   assert.deepEqual(handoff.learning,s.context.learning);
   assert.deepEqual(handoff.assessment,s.context.assessment);
   assert.equal(handoff.case.starterCode,s.context.case.starterCode);
   assert.equal(handoff.case.aiClaim,undefined);
   assert.equal(handoff.case.referenceCode,undefined);
   assert(p.validate(result));return {data:result};
 }};
 model.applyOpening(s,await service.opening(s,client));
 assert.equal(s.pending,false);assert.deepEqual(s.requests,{});
 assert.throws(()=>model.handoff(s),/Finish/);
 s.messages.push({role:'user',text:'Explain the pending state.'});
 await service.generate(s,{callAIJson:async p=>{
   assert(p.messages.some(m=>m.role==='assistant'&&m.content===result.reply));
   return {data:service.sample(s)};
 }});
});
test('unfinished openings survive reload, reject fabricated code and cannot overwrite a started chat',()=>{
 const s=session('cart-checkout','api');
 assert.equal(model.restore([s],catalog)[0].pending,true);
 assert(service.read({action:'open',session:s}));
 assert(!model.validOpening({reply:'Review this.',code:'inventedCode()'},s));
 model.applyOpening(s,{reply:'Review the current checkout logic.',code:''});
 assert.throws(()=>service.read({action:'open',session:s}),/Invalid conversation/);
 assert.throws(()=>service.read({action:'open',session:session()}));
});

test('fresh reviews do not invent prior diagnosis or learning progress',()=>{
 for(const id of Object.keys(catalog.cases)){
  const raw=model.freshInput(id,catalog);
  assert.deepEqual(raw.learning,{studiedTopics:[],needsPractice:[],practiceFocus:[]});
  assert(Object.values(raw.assessment.skills).every(x=>x==='not_observed'));
  assert.deepEqual(raw.assessment.weakTopics,[]);
  const s=model.create(raw,catalog,'api',false);
  assert.equal(s.sampleInput,false);assert.deepEqual(s.messages,[]);
 }
});
test('public catalogue no longer includes preset student conversations',async()=>{
 const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 await handler({method:'GET'},res);
 assert.equal(res.code,200);assert.equal(res.body.catalog.samples,undefined);
 assert(res.body.catalog.cases['notes-save']);
});

test('explanation turns cannot add repair requests or changes suggested by the model',async()=>{
 const s=session('cart-checkout','api');
 s.messages.push({role:'user',text:'Walk me through the empty cart.'});
 const answer={...service.sample(s),intent:'explain'};
 assert(answer.updates.length>0);
 const result=await service.generate(s,{callAIJson:async p=>{assert(p.validate(answer));return {data:answer};}});
 model.apply(s,result);
 assert.deepEqual(s.requests,{});
 assert.equal(s.proposal,'');assert.equal(s.proposalCode,'');
 assert.equal(s.messages.at(-1).text,answer.reply);
});
