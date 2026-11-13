const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const flow = require('../shared/flow.js');
const catalog = require('../shared/cases.json');
const diagnosis = require('../learning-path/diagnosis-model.js');
const data = require('../learning-path/data.js');
const adapter = require('../knowledge-map/learning-part1-adapter.js');
const contract = require('../knowledge-map/learning-contract.js');
const dialogue = require('../interview/dialogue-model.js');
const runner = require('../correction-lab/break-runner.js');
const sampleContext = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../knowledge-map/learning-samples.js'), 'utf8'), sampleContext);
const samples = sampleContext.window.SkillLoopSamples;
const makeStore = () => { const values = {}; return { read:(k,f)=>values[k]??f, write:(k,v)=>{values[k]=v;return true;} }; };

for (const c of Object.values(catalog.cases)) test(`${c.caseId}: diagnosis to learning to dialogue to verification`, () => {
  const store=makeStore(), brief=data.findCase(c.caseId);
  assert.equal(brief.snippet,c.starterCode);
  const responses=brief.questions.map(q=>({questionId:q.id,optionId:q.options.find(o=>o.score===0).id,explanation:''}));
  const result=diagnosis.buildLocalDiagnosis(brief,responses);
  const record={schemaVersion:2,caseId:c.caseId,learner:{background:'student',goal:'build'},responses,result,source:'local',questionSource:'authored',updatedAt:'2026-11-13T00:00:00Z'};
  store.write('learningPathDiagnosis',record);
  const input=adapter.read(store,samples,contract,data);
  const output={caseId:c.caseId,aiSource:'api',learning:{studiedTopics:result.priorities,needsPractice:result.priorities,practiceFocus:['Explain and verify the case requirements.']}};
  assert.equal(contract.validOutput(output,input,samples),true);
  assert.equal(flow.saveLearning(store,input,output),true);
  const context=dialogue.input(flow.dialogueInput(store,catalog,c.caseId),catalog);
  assert.equal(context.case.starterCode,c.starterCode);
  assert.deepEqual(context.learning,output.learning);
  const session={pending:false,mode:'api',context,messages:[{role:'user',text:'Please fix the defects.'}],requests:Object.fromEntries(c.issues.map(i=>[i.issueId,{request:'Respect the stated requirement and verify the boundary.'}])),feedback:'Check the plan.'};
  const plan=dialogue.handoff(session);
  assert.deepEqual(runner.checkDialogue(plan,c).problems,[]);
  const learned=store.read('learningResult');
  flow.savePlan(store,plan,learned.completedAt);
  assert.deepEqual(flow.readPlan(store,c.caseId),plan);
  store.write('learningPathDiagnosis',{...record,updatedAt:'2026-11-14T00:00:00Z'});
  assert.equal(flow.dialogueInput(store,catalog,c.caseId),null);
  assert.equal(flow.readPlan(store,c.caseId),null);
});

test('editing a confirmed plan invalidates the downstream record',()=>{
  const store=makeStore();flow.savePlan(store,{caseId:'cart-checkout',dialogue:{confirmed:true}});
  assert.ok(flow.readPlan(store,'cart-checkout'));
  flow.invalidatePlan(store,'cart-checkout');assert.equal(flow.readPlan(store,'cart-checkout'),null);
});

test('runtime catalog matches shared teaching cases and is included in deployment',()=>{
  assert.deepEqual(catalog,require('../docs/team-samples/samples.json'));
  const ignored=fs.readFileSync(require.resolve('../.vercelignore'),'utf8');
  assert.ok(!ignored.split(/\r?\n/).includes('shared/'));
  for(const file of ['../interview/dialogue-server.cjs','../knowledge-map/learning-server.mjs'])
    assert.ok(!fs.readFileSync(require.resolve(file),'utf8').includes("require('../docs/"));
});
