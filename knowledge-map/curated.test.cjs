const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('./curated-data.js');
const model = require('./curated-model.js');

const copy = () => structuredClone(catalog);

test('four reviewed content types form a navigable latest index', () => {
  assert.deepEqual(model.validate(catalog), []);
  assert.equal(catalog.index.length, 4);
  for (const entry of catalog.index) {
    const result = model.resolveUnit(catalog, entry.id);
    assert.equal(result.state, 'ready');
    assert.equal(result.unit.version, entry.latestVersion);
    for (const direction of result.unit.directions) {
      const detail = model.resolveDirection(catalog, entry.id, result.unit.version, direction.id);
      assert.equal(detail.state, 'ready');
      assert.equal(detail.graph.version, direction.graphVersion);
    }
  }
});

test('historical Unit and Graph Versions remain pinned and discoverable', () => {
  const old = model.resolveDirection(catalog, 'excalidraw-canvas', 'v1', 'scene-format');
  const latest = model.resolveDirection(catalog, 'excalidraw-canvas', 'v2', 'scene-format');
  assert.equal(old.state, 'ready');
  assert.equal(old.isOld, true);
  assert.equal(old.graph.version, 'v1');
  assert.equal(latest.graph.version, 'v2');
  assert.equal(model.resolveUnit(catalog, 'excalidraw-canvas', 'v99').state, 'missing-version');
});

test('missing pinned graph does not fall back to a newer graph', () => {
  const broken = copy();
  broken.graphs = broken.graphs.filter((graph) => !(graph.id === 'excal-scene' && graph.version === 'v1'));
  assert.equal(model.resolveDirection(broken, 'excalidraw-canvas', 'v1', 'scene-format').state,
    'unavailable-graph');
  assert.match(model.validate(broken).join(' '), /missing pinned graph/);
});

test('withdrawn history keeps its identity but cannot be read', () => {
  const withdrawn = copy();
  const unit = withdrawn.units.find((item) => item.id === 'excalidraw-canvas' && item.version === 'v1');
  unit.status = 'withdrawn';
  unit.withdrawalReason = 'A source was withdrawn.';
  assert.equal(model.resolveUnit(withdrawn, unit.id, unit.version).state, 'withdrawn');
  assert.equal(model.resolveDirection(withdrawn, unit.id, unit.version, 'scene-format').state, 'withdrawn');
});

test('contract rejects broken evidence and identity links', () => {
  const broken = copy();
  broken.graphs[0].edges[0].sources = [];
  broken.graphs[0].edges[1].target = 'unknown-node';
  broken.sources[0].url = 'http://example.invalid';
  broken.units[0].directions = [];
  const errors = model.validate(broken).join('\n');
  assert.match(errors, /sources required/);
  assert.match(errors, /invalid edge/);
  assert.match(errors, /Incomplete source/);
  assert.match(errors, /direction required/);
});

test('teaching associations must explain themselves without becoming technical facts', () => {
  const broken = copy();
  const edge = broken.graphs.find((graph) => graph.id === 'owasp-risk-lens').edges
    .find((item) => item.basis === 'teaching-association');
  edge.reason = '';
  assert.match(model.validate(broken).join(' '), /invalid edge/);
  assert.ok(catalog.graphs.flatMap((graph) => graph.edges).some((item) =>
    item.basis === 'teaching-association' && item.reason));
});
