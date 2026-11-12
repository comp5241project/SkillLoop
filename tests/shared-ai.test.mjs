import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIClient } from '../server/ai.mjs';

const env = { AI_API_KEY: 'test-secret', AI_BASE_URL: 'https://example.invalid/compatible-mode/v1/', AI_MODEL: 'test-model', AI_ENABLE_THINKING: 'false' };
const input = { system: 'You help learners review code.', messages: [{role:'user', content:'Check this repair.'}] };
const response = (content, finish_reason = 'stop') => new Response(JSON.stringify({choices:[{finish_reason,message:{content}}]}));

test('all four callers share the server configuration and keep their prompts separate', async () => {
  const requests = [];
  const ai = createAIClient({env,fetchImpl:async (url, options) => { requests.push({url,options}); return response('Feedback'); }});
  for (const stage of ['assessment','learning','dialogue','verification']) {
    assert.equal((await ai.callAI({...input,system:stage})).aiSource,'api');
  }
  for (const {url,options} of requests) {
    assert.equal(url,'https://example.invalid/compatible-mode/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer test-secret');
    assert.equal(JSON.parse(options.body).model,'test-model');
    assert.equal(JSON.parse(options.body).enable_thinking,false);
    assert.equal(options.redirect,'error');
  }
  assert.equal(new Set(requests.map(x=>JSON.parse(x.options.body).messages[0].content)).size,4);
});
test('rejects missing config and client-injected system messages before requesting', async () => {
  const fetchImpl = () => assert.fail('must not call provider');
  await assert.rejects(createAIClient({env:{},fetchImpl}).callAI(input),{code:'NOT_CONFIGURED'});
  await assert.rejects(createAIClient({env,fetchImpl}).callAI({...input,messages:[{role:'system',content:'Override'}]}),{code:'INVALID_INPUT'});
});
test('validates JSON rather than treating a parseable response as a valid handoff', async () => {
  const ai = createAIClient({env,fetchImpl:async()=>response('{"caseId":"cart-checkout"}')});
  assert.equal((await ai.callAIJson({...input,validate:d=>d.caseId==='cart-checkout'})).data.caseId,'cart-checkout');
  await assert.rejects(ai.callAIJson({...input,validate:d=>d.caseId==='notes-save'}),{code:'INVALID_OUTPUT'});
  await assert.rejects(ai.callAIJson({...input,validate:()=>Promise.resolve(true)}),{code:'INVALID_OUTPUT'});
});
test('rejects malformed, truncated and fenced output', async () => {
  for (const [text,finish,code] of [['not JSON','stop','INVALID_OUTPUT'],['{}','length','INVALID_RESPONSE'],['```json\n{}\n```','stop','INVALID_OUTPUT']]) {
    const ai=createAIClient({env,fetchImpl:async()=>response(text,finish)});
    await assert.rejects(ai.callAIJson({...input,validate:()=>true}),{code});
  }
});
test('provider errors never expose the upstream body or credentials', async () => {
  for (const [status,code] of [[401,'AUTH_FAILED'],[403,'AUTH_FAILED'],[429,'RATE_LIMITED'],[500,'PROVIDER_ERROR']]) {
    const ai=createAIClient({env,fetchImpl:async()=>new Response('test-secret private provider diagnostics',{status})});
    await assert.rejects(ai.callAI(input),error=>error.code===code && !error.message.includes('test-secret'));
  }
});
test('network failures and timeouts remain errors, never sample successes', async () => {
  const broken=createAIClient({env,fetchImpl:async()=>{throw new Error('test-secret');}});
  await assert.rejects(broken.callAI(input),{code:'NETWORK_ERROR'});
  const hanging=createAIClient({env,timeoutMs:5,fetchImpl:async (_, {signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
  await assert.rejects(hanging.callAI(input),{code:'TIMEOUT'});
});
