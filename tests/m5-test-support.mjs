import assert from 'node:assert/strict';

export function client(stack) {
  return async function call(op, { cookie, body, query, status = 200 } = {}) {
    const response = await fetch(stack.base + '/api/courses/?' + new URLSearchParams({ op, ...query }), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} :
        { 'Content-Type': 'application/json', 'X-SkillLoop-Course': '1', Origin: stack.base }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return op === 'login' ? response.headers.get('set-cookie').split(';')[0] : data;
  };
}

export async function publishCourse(call, cookie, caseRef, requirementId, title, previous) {
  const { case: info } = await call('case', { query: caseRef });
  const objective = { objectiveId: 'obj-trace', text: 'Trace the selected requirement before changing the code.',
    requirementIds: [requirementId] };
  const form = { brief: { topic: 'Trace and verify the requirement', learnerLevel: 'beginner', constraints: '',
    objectives: [objective] }, content: { title,
    objectives: [objective], explanation: 'Compare the delivered behavior with the published requirement before changing the implementation.',
    codeExample: { kind: 'trace', excerpt: info.starterCode.split('\n').find((line) => line.includes('return')).trim(),
      prompt: 'Predict the delivered result at the boundary.' },
    exercises: [{ exerciseId: 'ex-verify', kind: 'short-answer', prompt: 'What observations would verify the requirement?',
      requirementIds: [requirementId], publicHints: ['Try invalid values and ordinary values.'],
      teacherAnswerGuidance: ['M5 teacher-private sentinel.'] }] } };
  const saved = await call('save', { cookie, status: previous ? 200 : 201,
    body: { courseId: previous?.id ?? null, revision: previous?.revision, caseRef, form } });
  const body = { courseId: saved.id, revision: saved.draft.revision, confirm: true };
  await call('review', { cookie, body });
  const release = await call('publish', { cookie, body });
  return { id: saved.id, revision: saved.draft.revision, version: release.version };
}
export const checkout = { caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases' };
export const retryQueue = { caseId: 'retry-queue', caseVersion: 1, conceptId: 'edge-cases' };
