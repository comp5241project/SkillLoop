import { createHash, randomUUID } from 'node:crypto';

export const UNIT_TYPES = new Set(['open-source', 'case-study', 'build-something', 'knowledge-collection']);
export const SECTION_KINDS = new Set(['overview', 'artifact', 'how-it-works', 'evidence', 'activity']);
export const EVIDENCE_KINDS = new Set(['code', 'file', 'research', 'event', 'external']);
export const CLAIM_KINDS = new Set(['general', ...EVIDENCE_KINDS]);
export const MAX_GENERATION_DIRECTIONS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z][a-z0-9-]{0,63}$/;

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value;
}

function requireText(value, name, max = 4000, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max)
    throw new Error(`${name} must be ${min}–${max} characters.`);
  return value.trim();
}

function optionalText(value, name, max = 4000) {
  if (value === undefined || value === null || value === '') return '';
  return requireText(value, name, max);
}

function requireUuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${name} must be a UUID.`);
  return value.toLowerCase();
}

function requireSlug(value, name) {
  if (typeof value !== 'string' || !SLUG.test(value)) throw new Error(`${name} has an invalid ID.`);
  return value;
}

function list(value, name, max) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${name} must be a list of at most ${max}.`);
  return value;
}

function unique(items, name) {
  if (new Set(items).size !== items.length) throw new Error(`${name} IDs must be unique.`);
}

export function createUnitDraft(id = randomUUID()) {
  return { schemaVersion: '0.4', id, type: 'open-source', title: '', summary: '', guidingQuestion: '',
    publisherName: '', topics: [], sections: [], activities: [], directions: [], sources: [], confirmedPlanFingerprint: null };
}

export function createDirectionGraph(id = randomUUID(), directionId = '') {
  return { schemaVersion: '0.4', id, directionId, title: '', nodes: [], edges: [] };
}

export function planFingerprint(unit) {
  const directions = list(unit?.directions, 'Directions', 20).map((direction) => ({
    id: direction.id, graphId: direction.graphId, title: direction.title,
    question: direction.question, scope: direction.scope,
  }));
  return createHash('sha256').update(JSON.stringify(directions)).digest('hex');
}

export function isPlanConfirmed(unit) {
  return typeof unit?.confirmedPlanFingerprint === 'string' &&
    unit.confirmedPlanFingerprint === planFingerprint(unit) && unit.directions.length > 0;
}

export function confirmPlan(unit) {
  validateUnitDraft(unit, { allowIncomplete: true });
  if (!unit.directions.length) throw new Error('Add a Direction before confirming the plan.');
  return { ...unit, confirmedPlanFingerprint: planFingerprint(unit) };
}

export function validateEvidenceRefs(refs, sources, name) {
  const ids = new Set(sources.map((source) => source.id));
  return list(refs || [], `${name} evidence`, 20).map((ref) => {
    requireObject(ref, `${name} evidence reference`);
    requireUuid(ref.sourceId, 'Evidence source');
    if (!ids.has(ref.sourceId)) throw new Error(`${name} references an unknown source.`);
    requireText(ref.location, 'Evidence location', 300);
    if (ref.kind && !EVIDENCE_KINDS.has(ref.kind)) throw new Error('Invalid evidence kind.');
    return ref;
  });
}

function validateSources(sources) {
  list(sources, 'Sources', 40);
  unique(sources.map((source) => requireUuid(source.id, 'Source')), 'Source');
  for (const source of sources) {
    requireText(source.title, 'Source title', 240);
    const url = new URL(requireText(source.url, 'Source URL', 2000));
    if (url.protocol !== 'https:') throw new Error('Source URL must use HTTPS.');
    if (!['manual', 'captured'].includes(source.origin)) throw new Error('Source origin is required.');
    if (source.origin === 'captured') {
      requireText(source.snapshotId, 'Captured snapshot ID', 100);
      requireText(source.retrievedAt, 'Source retrieval time', 40);
      requireText(source.scope, 'Captured material scope', 2000);
      optionalText(source.reviewedAt, 'Teacher source review time', 40);
      if (!/^[0-9a-f]{64}$/.test(source.contentSha256 || ''))
        throw new Error('Captured material fingerprint is required.');
    } else {
      requireText(source.reviewedAt, 'Manual source review time', 40);
    }
  }
}

function validateSections(sections, sources, { allowIncomplete }) {
  list(sections, 'Sections', 60);
  unique(sections.map((section) => requireSlug(section.id, 'Section')), 'Section');
  for (const section of sections) {
    if (!SECTION_KINDS.has(section.kind)) throw new Error(`Invalid section kind: ${section.kind}`);
    if (!allowIncomplete || section.title) requireText(section.title, 'Section title', 160);
    if (!allowIncomplete || section.body) requireText(section.body, 'Section body', 12000);
    validateEvidenceRefs(section.evidenceRefs, sources, `Section ${section.id}`);
    if (section.claimKind && !CLAIM_KINDS.has(section.claimKind)) throw new Error('Invalid section claim kind.');
    if (!allowIncomplete && section.claimKind && section.claimKind !== 'general' && !section.evidenceRefs?.length)
      throw new Error(`Section ${section.id} needs verifiable evidence for ${section.claimKind} claims.`);
  }
}

function validateActivities(activities, sources, { allowIncomplete }) {
  list(activities, 'Activities', 60);
  unique(activities.map((activity) => requireSlug(activity.id, 'Activity')), 'Activity');
  for (const activity of activities) {
    if (!allowIncomplete || activity.prompt) requireText(activity.prompt, 'Activity prompt', 2000);
    optionalText(activity.guidance, 'Activity guidance', 4000);
    validateEvidenceRefs(activity.evidenceRefs, sources, `Activity ${activity.id}`);
  }
}

export function validateUnitDraft(unit, { allowIncomplete = false } = {}) {
  requireObject(unit, 'Unit');
  if (unit.schemaVersion !== '0.4') throw new Error('Unit schemaVersion must be 0.4.');
  requireUuid(unit.id, 'Unit ID');
  if (!UNIT_TYPES.has(unit.type)) throw new Error('Invalid Unit type.');
  if (!allowIncomplete || unit.title) requireText(unit.title, 'Unit title', 160);
  if (!allowIncomplete || unit.summary) requireText(unit.summary, 'Unit summary', 1200);
  if (!allowIncomplete || unit.guidingQuestion) requireText(unit.guidingQuestion, 'Guiding question', 400);
  optionalText(unit.publisherName, 'Teacher display name', 100);
  list(unit.topics, 'Topics', 20).forEach((topic) => requireText(topic, 'Topic', 60));
  validateSources(list(unit.sources, 'Sources', 40));
  validateSections(unit.sections, unit.sources, { allowIncomplete });
  validateActivities(unit.activities, unit.sources, { allowIncomplete });
  list(unit.directions, 'Directions', 20);
  unique(unit.directions.map((direction) => requireSlug(direction.id, 'Direction')), 'Direction');
  unique(unit.directions.map((direction) => requireUuid(direction.graphId, 'Direction Graph')), 'Direction Graph');
  for (const direction of unit.directions) {
    requireText(direction.title, 'Direction title', 160);
    requireText(direction.question, 'Direction question', 400);
    requireText(direction.scope, 'Direction scope', 1000);
  }
  if (unit.confirmedPlanFingerprint !== null && unit.confirmedPlanFingerprint !== undefined &&
    (typeof unit.confirmedPlanFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(unit.confirmedPlanFingerprint)))
    throw new Error('Invalid plan confirmation.');
  return unit;
}

export function validatePublishableUnit(unit) {
  validateUnitDraft(unit);
  if (!unit.sections.length) throw new Error('A published Unit needs a readable section.');
  if (!isPlanConfirmed(unit)) throw new Error('Confirm Direction Planning before publishing.');
  return unit;
}

export function validateDirectionGraph(graph, sources, { allowIncomplete = false } = {}) {
  requireObject(graph, 'Direction Graph');
  if (graph.schemaVersion !== '0.4') throw new Error('Graph schemaVersion must be 0.4.');
  requireUuid(graph.id, 'Graph ID');
  requireSlug(graph.directionId, 'Graph Direction');
  if (!allowIncomplete || graph.title) requireText(graph.title, 'Graph title', 160);
  list(graph.nodes, 'Graph nodes', 500);
  list(graph.edges, 'Graph edges', 2000);
  if (!allowIncomplete && !graph.nodes.length) throw new Error('A published Direction Graph needs a node.');
  unique(graph.nodes.map((node) => requireSlug(node.id, 'Node')), 'Node');
  unique(graph.edges.map((edge) => requireSlug(edge.id, 'Edge')), 'Edge');
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    requireText(node.title, 'Node title', 160);
    if (!allowIncomplete || node.description) requireText(node.description, 'Node description', 2000);
    validateEvidenceRefs(node.evidenceRefs, sources, `Node ${node.id}`);
    if (node.claimKind && !CLAIM_KINDS.has(node.claimKind)) throw new Error('Invalid concept claim kind.');
    if (!allowIncomplete && node.claimKind && node.claimKind !== 'general' && !node.evidenceRefs?.length)
      throw new Error(`Concept ${node.id} needs verifiable evidence.`);
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target)
      throw new Error(`Invalid endpoints for edge ${edge.id}.`);
    requireText(edge.label, 'Edge label', 100);
    requireText(edge.reason, 'Edge reason', 2000);
    if (!['source-supported', 'teaching-association'].includes(edge.basis)) throw new Error('Invalid edge basis.');
    validateEvidenceRefs(edge.evidenceRefs, sources, `Edge ${edge.id}`);
    if (!allowIncomplete && edge.basis === 'source-supported' && !edge.evidenceRefs?.length)
      throw new Error(`Relationship ${edge.id} needs verifiable evidence.`);
  }
  return graph;
}

export function validatePlanningProposal(proposal) {
  requireObject(proposal, 'Planning proposal');
  requireText(proposal.title, 'Proposed Unit title', 160);
  requireText(proposal.summary, 'Proposed Unit summary', 1200);
  requireText(proposal.guidingQuestion, 'Proposed guiding question', 400);
  const directions = list(proposal.directions, 'Proposed Directions', 12);
  if (!directions.length) throw new Error('AI must propose at least one Direction.');
  for (const direction of directions) {
    requireText(direction.title, 'Proposed Direction title', 160);
    requireText(direction.question, 'Proposed Direction question', 400);
    requireText(direction.scope, 'Proposed Direction scope', 1000);
  }
  return proposal;
}

export function validateGenerationProposal(proposal, confirmedUnit) {
  requireObject(proposal, 'Generation proposal');
  if (!isPlanConfirmed(confirmedUnit)) throw new Error('Direction Planning must be confirmed.');
  const planned = new Map(confirmedUnit.directions.map((direction) => [direction.id, direction]));
  const graphs = list(proposal.graphs, 'Proposed Graphs', 20);
  if (!graphs.length) throw new Error('Generation requires a selected Direction.');
  unique(graphs.map((graph) => requireSlug(graph.directionId, 'Proposed Direction')), 'Proposed Direction');
  for (const graph of graphs) {
    const direction = planned.get(graph.directionId);
    if (!direction || graph.id !== direction.graphId) throw new Error('AI proposed an unconfirmed Direction or Graph ID.');
    validateDirectionGraph(graph, confirmedUnit.sources);
    if (graph.nodes.some((node) => !node.claimKind)) throw new Error('AI must classify every concept claim.');
  }
  validateSections(proposal.sections, confirmedUnit.sources, { allowIncomplete: false });
  if (!proposal.sections.length) throw new Error('AI must propose readable Unit sections.');
  if (proposal.sections.some((section) => !section.claimKind))
    throw new Error('AI must classify every section claim.');
  validateActivities(proposal.activities, confirmedUnit.sources, { allowIncomplete: false });
  if (!proposal.activities.length) throw new Error('AI must propose a learning activity.');
  return proposal;
}
