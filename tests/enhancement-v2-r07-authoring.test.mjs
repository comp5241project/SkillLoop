import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCourseApi } from '../api/courses.mjs';
import { createCourseAuthor } from '../enhancement-v2/m3-ai-author.mjs';
import { createAIClient } from '../server/ai.mjs';
import { completion, fixtureContent } from './r07-model-fixture.mjs';

const env = { AI_BASE_URL: 'https://openrouter.ai/api/v1', AI_API_KEY: 'fixture-secret', AI_MODEL: 'fixture' };
const teacher = randomUUID();
const student = randomUUID();
const otherTeacher = randomUUID();
const base = 'https://skillloop.example';
const courseId = randomUUID();

function input(caseId = 'cart-checkout', requirementId = caseId === 'cart-checkout' ? 'empty-cart' : 'backoff-cap') {
  return {
    courseId: null, revision: null, caseRef: { caseId, caseVersion: 1, conceptId: 'edge-cases' },
    brief: { topic: 'Trace a boundary condition', learnerLevel: 'beginner', constraints: 'Use a concrete trace.',
      objectives: [{ objectiveId: 'obj-trace', text: 'Trace the result at the boundary.', requirementIds: [requirementId] }] },
  };
}

function harness(fetchImpl, timeoutMs = 1000) {
  const calls = [];
  const saves = [];
  const saved = { revision: 4, caseRef: input().caseRef, content: { title: 'Original lesson' } };
  const client = createAIClient({ env, timeoutMs, fetchImpl: async (_url, init) => {
    const { messages, reasoning, response_format } = JSON.parse(init.body);
    assert.deepEqual(reasoning, { enabled: false });
    assert.deepEqual(response_format, { type: 'json_object' });
    const payload = JSON.parse(messages[1].content);
    calls.push(payload);
    return fetchImpl(payload, init);
  } });
  const api = createCourseApi({
    getAuth: () => ({ user: async (id) => ({ id, user_metadata: { role: 'teacher' } }) }),
    getStore: () => ({
      role: async (id) => id === student ? 'student' : 'teacher',
      open: async () => ({ draft: saved }),
      save: async (...args) => { saves.push(args); return { saved: true }; },
    }),
    author: createCourseAuthor({ client, signingKey: () => env.AI_API_KEY }),
  });
  return { calls, saves, saved, post(op, data, actor = teacher) {
    return api.fetch(new Request(base + '/api/courses/?op=' + op, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SkillLoop-Course': '1', Origin: base,
        ...(actor ? { Cookie: 'sl_course_access=' + actor } : {}) },
      body: JSON.stringify(data),
    }));
  } };
}

const validCompletion = (payload) => completion(payload.proposal ? { approved: true } : fixtureContent(payload));

for (const caseId of ['cart-checkout', 'retry-queue']) {
  test(`R07 generates a validated teacher proposal for ${caseId}`, async () => {
    const { post, calls, saves } = harness(validCompletion);
    const body = input(caseId);
    const response = await post('generate', { ...body, actor: student, studentResponses: 'PRIVATE LEARNER DATA' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { proposal } = await response.json();
    assert.equal(proposal.caseRef.caseId, caseId);
    assert.equal(proposal.provenance.origin, 'ai-assisted');
    assert.deepEqual(proposal.content, fixtureContent(calls[0]));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].brief, body.brief);
    assert.deepEqual(Object.keys(calls[0].case), ['caseId', 'caseVersion', 'conceptId', 'title', 'scenario', 'requirements', 'starterCode']);
    assert.doesNotMatch(JSON.stringify(calls), /PRIVATE LEARNER DATA|fixture-secret|referenceCode/);
    assert.equal(saves.length, 0);
    const form = { brief: proposal.brief, content: { ...proposal.content, title: 'Teacher edited the AI title' } };
    const request = { ...body, form, aiReceipt: proposal.receipt };
    assert.equal((await post('save', request, otherTeacher)).status, 422);
    assert.equal((await post('save', { ...request, caseRef: input(caseId === 'cart-checkout' ? 'retry-queue' : 'cart-checkout').caseRef })).status, 422);
    assert.equal((await post('save', { ...request, aiReceipt: proposal.receipt + '0' })).status, 422);
    assert.equal((await post('save', request)).status, 201);
    assert.deepEqual(saves[0].at(-1), proposal.provenance);
  });
}

test('R07 rejects anonymous and student callers, unsupported cases, stale revisions and invalid brief references before inference', async () => {
  const { post, calls } = harness(validCompletion);
  const forgedRole = { ...input(), role: 'teacher' };
  assert.equal((await post('generate', forgedRole, null)).status, 401);
  assert.equal((await post('generate', forgedRole, student)).status, 403);
  assert.equal((await post('generate', { ...input(), caseRef: { ...input().caseRef, caseVersion: 2 } })).status, 404);
  assert.equal((await post('generate', { ...input('retry-queue'), courseId, revision: 4 })).status, 409);
  assert.equal((await post('generate', { ...input(), courseId, revision: 3 })).status, 409);
  const invalid = await post('generate', input('retry-queue', 'empty-cart'));
  assert.equal(invalid.status, 422);
  assert.ok((await invalid.json()).fields['brief.objectives[0].requirementIds']);
  assert.equal(calls.length, 0);
});

for (const [name, failure, status, code] of [
  ['foreign starter excerpt', (payload) => {
    const content = fixtureContent(payload);
    content.codeExample.excerpt = 'return total / count;';
    return completion(content);
  }, 502, 'ai-invalid-output'],
  ['foreign exercise requirement', (payload) => {
    const content = fixtureContent(payload);
    content.exercises[0].requirementIds = ['empty-cart'];
    return completion(content);
  }, 502, 'ai-invalid-output'],
  ['copied private guidance', (payload) => {
    const content = fixtureContent(payload);
    content.exercises[0].publicHints.push(content.exercises[0].teacherAnswerGuidance[0]);
    return completion(content);
  }, 502, 'ai-invalid-output'],
  ['constraint/fact review rejected', (payload) => completion(payload.proposal ? { approved: false } : fixtureContent(payload)),
    502, 'ai-invalid-output'],
  ['malformed model JSON', () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'broken JSON' } }] }),
    502, 'ai-invalid-output'],
  ['provider failure', () => new Response('provider-private data', { status: 500 }), 502, 'ai-failed'],
  ['timeout', (_payload, { signal }) => new Promise((_, reject) =>
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })), 504, 'ai-timeout'],
]) {
  test(`R07 handles ${name} without saving anything`, async () => {
    const { post, saves, saved } = harness(failure, 20);
    const before = structuredClone(saved);
    const response = await post('generate', input('retry-queue'));
    assert.equal(response.status, status);
    const result = await response.json();
    assert.equal(result.code, code);
    assert.equal(result.proposal, undefined);
    assert.doesNotMatch(result.error, /provider-private|fixture-secret/);
    assert.deepEqual(saved, before);
    assert.equal(saves.length, 0);
  });
}
