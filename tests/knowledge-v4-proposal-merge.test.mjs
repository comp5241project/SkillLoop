import test from 'node:test';
import assert from 'node:assert/strict';
import '../knowledge-map/proposal-merge.js';

const proposed = {
  schemaVersion: '0.4', id: 'graph', directionId: 'scene', title: 'Scene',
  nodes: [{ id: 'state', title: 'AI state' }, { id: 'event', title: 'Event' }],
  edges: [{ id: 'updates', source: 'event', target: 'state', label: 'updates' }],
};

test('module acceptance preserves teacher concept edits and merges only selected new items', () => {
  const existing = { ...proposed, nodes: [{ id: 'state', title: 'Teacher state' }], edges: [] };
  const result = globalThis.SkillLoopProposalMerge.merge(existing, proposed,
    { concepts: true, relationships: true });
  assert.equal(existing.nodes.length, 1);
  assert.equal(result.graph.nodes.find((node) => node.id === 'state').title, 'Teacher state');
  assert.equal(result.graph.nodes.find((node) => node.id === 'event').title, 'Event');
  assert.deepEqual(result.graph.edges.map((edge) => edge.id), ['updates']);
  assert.deepEqual(result.conflicts, ['concept state']);
});

test('relationship-only acceptance waits for missing concepts without replacing a draft', () => {
  const result = globalThis.SkillLoopProposalMerge.merge(null, proposed,
    { concepts: false, relationships: true });
  assert.equal(result.changed, false);
  assert.deepEqual(result.graph.nodes, []);
  assert.deepEqual(result.graph.edges, []);
  assert.deepEqual(result.conflicts, ['relationship updates needs both concepts']);
});
