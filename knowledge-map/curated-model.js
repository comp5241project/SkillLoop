/* Pure v0.3 curated-content contract. Browser and Node share the same checks. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root) root.SkillLoopCuratedModel = model;
})(typeof globalThis === 'object' ? globalThis : null, function () {
  const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
  const versionPattern = /^v[1-9][0-9]*$/;
  const types = new Set(['open-source', 'case-study', 'build-something', 'knowledge-collection']);
  const bases = new Set(['source-supported', 'teaching-association']);
  const key = (id, version) => `${id}@${version}`;
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
  const validId = (value) => typeof value === 'string' && idPattern.test(value);
  const validVersion = (value) => typeof value === 'string' && versionPattern.test(value);

  function validate(catalog) {
    const errors = [];
    const check = (condition, message) => { if (!condition) errors.push(message); };
    if (!catalog || catalog.schemaVersion !== '0.3' || !Array.isArray(catalog.index) ||
        !Array.isArray(catalog.units) || !Array.isArray(catalog.graphs) || !Array.isArray(catalog.sources))
      return ['Catalog needs schemaVersion 0.3 and index, units, graphs, sources arrays.'];

    const sources = new Map();
    for (const source of catalog.sources) {
      check(validId(source.id) && !sources.has(source.id), `Invalid or duplicate source ${source.id}`);
      sources.set(source.id, source);
      check(hasText(source.title) && hasText(source.publisher) && hasText(source.kind) &&
        /^https:\/\/[^\s]+$/.test(source.url || '') && /^\d{4}-\d{2}-\d{2}$/.test(source.verifiedAt || ''),
      `Incomplete source ${source.id}`);
      if (source.revision) check(/^[0-9a-f]{40}$/.test(source.revision) && hasText(source.path),
        `Invalid fixed revision for ${source.id}`);
    }
    function checkSources(refs, path, required) {
      check(Array.isArray(refs) && (!required || refs.length > 0), `${path}: sources required`);
      for (const ref of Array.isArray(refs) ? refs : []) check(sources.has(ref), `${path}: unknown source ${ref}`);
    }

    const graphs = new Map();
    for (const graph of catalog.graphs) {
      const path = `Graph ${key(graph.id, graph.version)}`;
      check(validId(graph.id) && validVersion(graph.version) && !graphs.has(key(graph.id, graph.version)),
        `${path}: invalid or duplicate identity`);
      graphs.set(key(graph.id, graph.version), graph);
      check(graph.schemaVersion === '0.3' && validId(graph.unitId) && validId(graph.directionId) &&
        ['active', 'withdrawn'].includes(graph.status), `${path}: invalid metadata`);
      if (graph.status === 'withdrawn') {
        check(hasText(graph.withdrawalReason), `${path}: withdrawal reason required`);
        continue;
      }
      check(hasText(graph.title) && Array.isArray(graph.nodes) && graph.nodes.length > 0 &&
        Array.isArray(graph.edges) && graph.edges.length > 0, `${path}: nodes and edges required`);
      const nodes = new Set();
      for (const node of graph.nodes || []) {
        check(validId(node.id) && !nodes.has(node.id) && hasText(node.title) && hasText(node.description),
          `${path}: invalid or duplicate node ${node.id}`);
        nodes.add(node.id);
        checkSources(node.sources, `${path} node ${node.id}`, true);
        if (node.contextNote !== undefined) check(hasText(node.contextNote), `${path} node ${node.id}: empty context note`);
      }
      const edges = new Set();
      for (const edge of graph.edges || []) {
        check(validId(edge.id) && !edges.has(edge.id) && nodes.has(edge.source) && nodes.has(edge.target) &&
          edge.source !== edge.target && hasText(edge.label) && hasText(edge.reason) && bases.has(edge.basis),
        `${path}: invalid edge ${edge.id}`);
        edges.add(edge.id);
        checkSources(edge.sources, `${path} edge ${edge.id}`, edge.basis === 'source-supported');
      }
    }

    const units = new Map();
    for (const unit of catalog.units) {
      const path = `Unit ${key(unit.id, unit.version)}`;
      check(validId(unit.id) && validVersion(unit.version) && !units.has(key(unit.id, unit.version)),
        `${path}: invalid or duplicate identity`);
      units.set(key(unit.id, unit.version), unit);
      check(unit.schemaVersion === '0.3' && validId(unit.slug) && types.has(unit.type) &&
        ['active', 'withdrawn'].includes(unit.status), `${path}: invalid metadata`);
      if (unit.status === 'withdrawn') {
        check(hasText(unit.withdrawalReason), `${path}: withdrawal reason required`);
        continue;
      }
      check(hasText(unit.title) && hasText(unit.hook) && hasText(unit.guidingQuestion) &&
        hasText(unit.summary) && hasText(unit.level) && Number.isInteger(unit.estimatedMinutes) &&
        unit.estimatedMinutes > 0 && Array.isArray(unit.topics) && unit.topics.length > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(unit.checkedAt || ''), `${path}: discovery or review fields missing`);
      checkSources(unit.sources, path, true);
      check(Array.isArray(unit.sections) && unit.sections.length > 0, `${path}: sections required`);
      for (const section of unit.sections || []) {
        check(validId(section.id) && hasText(section.title) && hasText(section.body) &&
          ['overview', 'artifact', 'how-it-works', 'evidence', 'activity'].includes(section.kind),
        `${path}: invalid section ${section.id}`);
        checkSources(section.sources, `${path} section ${section.id}`, section.kind !== 'activity');
      }
      check(Array.isArray(unit.directions) && unit.directions.length > 0, `${path}: direction required`);
      const directions = new Set();
      for (const direction of unit.directions || []) {
        check(validId(direction.id) && !directions.has(direction.id) && validId(direction.graphId) &&
          validVersion(direction.graphVersion) && hasText(direction.title) && hasText(direction.summary),
        `${path}: invalid direction ${direction.id}`);
        directions.add(direction.id);
        const graph = graphs.get(key(direction.graphId, direction.graphVersion));
        check(graph && graph.unitId === unit.id && graph.directionId === direction.id,
          `${path}: missing pinned graph for direction ${direction.id}`);
      }
    }

    const indexed = new Set();
    const orders = new Set();
    for (const entry of catalog.index) {
      check(validId(entry.id) && validVersion(entry.latestVersion) && !indexed.has(entry.id) &&
        Number.isInteger(entry.order) && !orders.has(entry.order), `Invalid index entry ${entry.id}`);
      indexed.add(entry.id); orders.add(entry.order);
      check(units.get(key(entry.id, entry.latestVersion))?.status === 'active',
        `Index ${entry.id} does not point to an active unit`);
    }
    check(catalog.index.length === 4 && new Set(catalog.index.map((entry) =>
      units.get(key(entry.id, entry.latestVersion))?.type)).size === 4,
    'The latest index must contain one active unit of each content type.');
    for (const unit of catalog.units) check(indexed.has(unit.id), `Unindexed unit ${unit.id}`);
    return errors;
  }

  function resolveUnit(catalog, id, version) {
    const entry = catalog.index.find((item) => item.id === id);
    if (!entry) return { state: 'missing-unit' };
    const selectedVersion = version || entry.latestVersion;
    const unit = catalog.units.find((item) => item.id === id && item.version === selectedVersion);
    if (!unit) return { state: 'missing-version', latestVersion: entry.latestVersion };
    if (unit.status === 'withdrawn') return { state: 'withdrawn', unit, latestVersion: entry.latestVersion };
    return { state: 'ready', unit, latestVersion: entry.latestVersion, isOld: selectedVersion !== entry.latestVersion };
  }

  function resolveDirection(catalog, id, version, directionId) {
    const result = resolveUnit(catalog, id, version);
    if (result.state !== 'ready') return result;
    const direction = result.unit.directions.find((item) => item.id === directionId);
    if (!direction) return { ...result, state: 'missing-direction' };
    const graph = catalog.graphs.find((item) => item.id === direction.graphId && item.version === direction.graphVersion);
    if (!graph || graph.status !== 'active') return { ...result, state: 'unavailable-graph', direction };
    return { ...result, direction, graph };
  }

  return { validate, resolveUnit, resolveDirection, key };
});
