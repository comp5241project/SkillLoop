import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnitDraft, confirmPlan, isPlanConfirmed, planFingerprint,
  validateGenerationProposal, validateUnitDraft, validateDirectionGraph } from './_knowledge-v4-model.mjs';

const unitId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const graphId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const sourceId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const base = () => ({ ...createUnitDraft(unitId), title: 'Canvas architecture', summary: 'Explore how a canvas works.',
  guidingQuestion: 'How does a canvas manage interaction and rendering?', topics: ['Canvas'],
  sources: [{ id: sourceId, title: 'Project README', url: 'https://example.org/readme', origin: 'manual',
    reviewedAt: '2026-10-27' }],
  directions: [{ id: 'interaction', graphId, title: 'Interaction design',
    question: 'How do pointer events work?', scope: 'Input handling and coordinates' }],
  sections: [{ id: 'overview', kind: 'overview', title: 'Overview', body: 'A canvas has several parts.', evidenceRefs: [] }],
  activities: [{ id: 'inspect', prompt: 'Trace one pointer action.', evidenceRefs: [] }] });

test('teacher confirmation is invalidated by a changed Direction plan', () => {
  const unit = confirmPlan(base());
  assert.equal(isPlanConfirmed(unit), true);
  assert.equal(unit.confirmedPlanFingerprint, planFingerprint(unit));
  unit.directions[0].scope = 'Rendering only';
  assert.equal(isPlanConfirmed(unit), false);
});

test('AI may only generate graph content for a confirmed Direction identity', () => {
  const unit = confirmPlan(base());
  const graph = { schemaVersion: '0.4', id: graphId, directionId: 'interaction', title: 'Interaction',
    nodes: [{ id: 'events', title: 'Events', description: 'Pointer events.', claimKind: 'general', evidenceRefs: [] }], edges: [] };
  const proposal = { sections: unit.sections.map((section) => ({ ...section, claimKind: 'general' })),
    activities: unit.activities, graphs: [graph] };
  assert.equal(validateGenerationProposal(proposal, unit), proposal);
  assert.throws(() => validateGenerationProposal({ ...proposal, graphs: [{ ...graph, directionId: 'rendering' }] }, unit),
    /unconfirmed Direction/);
  assert.throws(() => validateGenerationProposal(proposal, { ...unit, confirmedPlanFingerprint: null }),
    /must be confirmed/);
});

test('external code claims can carry evidence without requiring citations on general teaching content', () => {
  const unit = base();
  assert.equal(validateUnitDraft(unit), unit);
  unit.sections.push({ id: 'implementation', kind: 'artifact', title: 'Implementation',
    body: 'The repository uses a renderer.', claimKind: 'code', evidenceRefs: [] });
  assert.throws(() => validateUnitDraft(unit), /needs verifiable evidence/);
  unit.sections[1].evidenceRefs.push({ sourceId, kind: 'code', location: 'README section 2' });
  assert.equal(validateUnitDraft(unit), unit);
  const graph = { schemaVersion: '0.4', id: graphId, directionId: 'interaction', title: 'Interaction',
    nodes: [{ id: 'events', title: 'Events', description: 'Pointer events.', evidenceRefs: [] },
      { id: 'handlers', title: 'Handlers', description: 'Project event handlers.',
        evidenceRefs: [{ sourceId, kind: 'code', location: 'README section 2' }] }],
    edges: [{ id: 'events-handlers', source: 'events', target: 'handlers', label: 'handled by',
      reason: 'The project routes events to handlers.', basis: 'source-supported',
      evidenceRefs: [{ sourceId, kind: 'code', location: 'README section 2' }] }] };
  assert.equal(validateDirectionGraph(graph, unit.sources), graph);
  graph.edges[0].evidenceRefs = [];
  assert.throws(() => validateDirectionGraph(graph, unit.sources), /Relationship .* needs verifiable evidence/);
  graph.edges[0].evidenceRefs = [{ sourceId, kind: 'code', location: 'README section 2' }];
  graph.nodes[1].evidenceRefs[0].sourceId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
  assert.throws(() => validateDirectionGraph(graph, unit.sources), /unknown source/);
});
