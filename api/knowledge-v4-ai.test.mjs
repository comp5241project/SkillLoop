import test from 'node:test';
import assert from 'node:assert/strict';
import { proposePlan, proposeGeneration, safeUrl } from './_knowledge-v4-ai.mjs';
import { createUnitDraft, confirmPlan } from './_knowledge-v4-model.mjs';

const unitId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const graphId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

async function modelReply(payload, run) {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldModel = process.env.KNOWLEDGE_V4_OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.KNOWLEDGE_V4_OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const request = JSON.parse(options.body);
    assert.equal(request.response_format.type, 'json_object');
    assert.equal(request.model, 'deepseek/deepseek-v4.1-flash');
    return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
  };
  try { await run(); } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.KNOWLEDGE_V4_OPENROUTER_MODEL;
    else process.env.KNOWLEDGE_V4_OPENROUTER_MODEL = oldModel;
  }
}

test('two-stage AI contract starts with planning and only generates for confirmed Direction IDs', async () => {
  const plan = { title: 'Canvas', summary: 'Explore a canvas.', guidingQuestion: 'How does it work?',
    directions: [{ title: 'Scene', question: 'What is a scene?', scope: 'Scene state' }] };
  await modelReply(plan, async () => {
    assert.deepEqual(await proposePlan({ topic: 'Canvas', capture: null }), plan);
  });
  const unit = createUnitDraft(unitId);
  Object.assign(unit, { title: plan.title, summary: plan.summary, guidingQuestion: plan.guidingQuestion,
    directions: [{ id: 'scene', graphId, ...plan.directions[0] }] });
  const confirmed = confirmPlan(unit);
  const output = { sections: [{ id: 'overview', kind: 'overview', title: 'Overview', body: 'Scenes have state.',
    claimKind: 'general', evidenceRefs: [] }], activities: [{ id: 'trace', prompt: 'Trace a scene update.',
    guidance: 'Observe changes.', evidenceRefs: [] }], graphs: [{ schemaVersion: '0.4', id: graphId,
    directionId: 'scene', title: 'Scene', nodes: [{ id: 'state', title: 'State',
      description: 'A representation of a scene.', claimKind: 'general', evidenceRefs: [] }], edges: [] }] };
  await modelReply(output, async () => {
    assert.deepEqual(await proposeGeneration(confirmed, [], ['scene']), output);
    await assert.rejects(proposeGeneration(confirmed, [], ['unconfirmed']), /confirmed Directions/);
  });
  await modelReply({ ...output, activities: [] }, async () => {
    await assert.rejects(proposeGeneration(confirmed, [], ['scene']), /learning activity/);
  });
  const twoDirections = confirmPlan({ ...unit, directions: [...unit.directions,
    { id: 'rendering', graphId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      title: 'Rendering', question: 'How is it drawn?', scope: 'Draw loop' }] });
  await modelReply(output, async () => {
    await assert.rejects(proposeGeneration(twoDirections, [], ['scene', 'rendering']), /omitted/);
  });
});

test('source capture rejects private or non-HTTPS URLs before fetching', async () => {
  await assert.rejects(safeUrl('http://example.org'), /public HTTPS/);
  await assert.rejects(safeUrl('https://127.0.0.1/data'), /public HTTPS/);
  await assert.rejects(safeUrl('https://localhost/data'), /public HTTPS/);
});

test('generation repairs one invalid model draft before teacher review', async () => {
  const unit = createUnitDraft(unitId);
  unit.directions = [{ id: 'scene', graphId, title: 'Scene', question: 'What?', scope: 'State' }];
  const confirmed = confirmPlan(unit);
  const valid = { sections: [{ id: 'overview', kind: 'overview', title: 'Overview',
    body: 'A scene has state.', claimKind: 'general', evidenceRefs: [] }],
  activities: [{ id: 'trace', prompt: 'Trace an update.', guidance: '', evidenceRefs: [] }],
  graphs: [{ schemaVersion: '0.4', id: graphId, directionId: 'scene', title: 'Scene',
    nodes: [{ id: 'state', title: 'State', description: 'Scene state.', claimKind: 'general',
      evidenceRefs: [] }], edges: [] }] };
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldModel = process.env.KNOWLEDGE_V4_OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.KNOWLEDGE_V4_OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (calls++) assert.match(request.messages[0].content, /Invalid section kind/);
    const proposal = calls === 1 ? { ...valid,
      sections: [{ ...valid.sections[0], kind: 'concept' }] } : valid;
    return Response.json({ choices: [{ message: { content: JSON.stringify(proposal) } }] });
  };
  try {
    assert.deepEqual(await proposeGeneration(confirmed, [], ['scene']), valid);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.KNOWLEDGE_V4_OPENROUTER_MODEL;
    else process.env.KNOWLEDGE_V4_OPENROUTER_MODEL = oldModel;
  }
});

test('AI evidence must name a location present in the captured material', async () => {
  const sourceId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const unit = createUnitDraft(unitId);
  unit.directions = [{ id: 'scene', graphId, title: 'Scene', question: 'What?', scope: 'Scene state' }];
  unit.sources = [{ id: sourceId, title: 'Code', url: 'https://example.com/repo',
    origin: 'captured', snapshotId: sourceId, retrievedAt: '2026-10-27T00:00:00Z',
    revision: 'a'.repeat(40), scope: 'Pinned src/scene.js', contentSha256: 'b'.repeat(64) }];
  const confirmed = confirmPlan(unit);
  const captures = [{ metadata: unit.sources[0], snapshot: { content: 'FILE src/scene.js @ commit\nScene state.' } }];
  const output = { sections: [{ id: 'overview', kind: 'overview', title: 'Overview',
    body: 'Scene implementation.', claimKind: 'code',
    evidenceRefs: [{ sourceId, location: 'src/imaginary.js', kind: 'code' }] }],
  activities: [{ id: 'trace', prompt: 'Trace the scene.', guidance: '', evidenceRefs: [] }],
  graphs: [{ schemaVersion: '0.4', id: graphId, directionId: 'scene', title: 'Scene',
    nodes: [{ id: 'state', title: 'State', description: 'Scene state.', claimKind: 'general',
      evidenceRefs: [] }], edges: [] }] };
  await modelReply(output, async () => {
    await assert.rejects(proposeGeneration(confirmed, captures, ['scene']), /absent from the captured source/);
  });
  output.sections[0].evidenceRefs[0].location = 'src/scene.js';
  await modelReply(output, async () => {
    assert.equal((await proposeGeneration(confirmed, captures, ['scene'])).sections[0].evidenceRefs[0].location,
      'src/scene.js');
  });
});
