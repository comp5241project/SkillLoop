(async function () {
  const params = new URLSearchParams(location.search);
  const graphId = params.get('graph');
  const status = document.querySelector('#graph-status');
  const reader = window.SkillLoopKnowledgeReader;
  const make = (tag, className = '', value = '') => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
  };
  const sourceLink = (source) => {
    const link = make('a', '', source.title); link.href = source.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  };
  if (!graphId) { status.textContent = 'Graph ID is missing.'; return; }
  if (params.get('unit')) document.querySelector('#back-unit').href =
    `/knowledge-map/teacher-unit.html?${new URLSearchParams({
      unit: params.get('unit'), ...(params.get('unitVersion') ? { version: params.get('unitVersion') } : {}),
    })}`;
  try {
    const query = new URLSearchParams({ op: 'public-graph', graph: graphId });
    if (params.get('version')) query.set('version', params.get('version'));
    const response = await fetch(`/api/knowledge-v4?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Graph unavailable.');
    const graph = result.graph.payload;
    const sources = new Map((result.graph.sources || []).map((source) => [source.id, source]));
    document.title = `${graph.title} | SkillLoop`;
    document.querySelector('#graph-title').textContent = graph.title;
    document.querySelector('#graph-eyebrow').textContent = `From Teachers · Direction Graph Version ${result.graph.version}`;
    if (graph.importedFrom) {
      const provenance = document.querySelector('#graph-provenance');
      provenance.append(document.createTextNode('Based on Independent Graph '));
      const origin = make('a', '', `${graph.importedFrom.graphId} ${graph.importedFrom.version}`);
      origin.href = `/knowledge-map/graph.html?${new URLSearchParams({
        graph: graph.importedFrom.graphId, version: graph.importedFrom.version,
      })}`;
      provenance.append(origin);
    }
    const intro = document.querySelector('#graph-intro');
    if (params.get('unit')) {
      try {
        const unitQuery = new URLSearchParams({ op: 'public-unit', unit: params.get('unit') });
        if (params.get('unitVersion')) unitQuery.set('version', params.get('unitVersion'));
        const unitResponse = await fetch(`/api/knowledge-v4?${unitQuery}`);
        if (unitResponse.ok) {
          const unitRecord = (await unitResponse.json()).unit;
          const direction = unitRecord.payload.directions.find((item) => item.id === result.graph.directionId);
          intro.textContent = direction?.question || `Part of ${unitRecord.payload.title}`;
        }
      } catch { /* The fixed Graph Version remains readable without Unit context. */ }
    }
    status.textContent = '';
    document.querySelector('#graph-reader').hidden = false;

    const selected = document.querySelector('#selected-details');
    const appendEvidence = (host, refs = []) => {
      if (!refs.length) { host.append(make('p', 'sl-small', 'No external evidence required for this teaching explanation.')); return; }
      for (const ref of refs) {
        const source = sources.get(ref.sourceId);
        const row = make('p', 'sl-small', 'Evidence: ');
        if (source) row.append(sourceLink(source), document.createTextNode(` · ${ref.location}`));
        else row.append(document.createTextNode(`${ref.sourceId} · ${ref.location}`));
        host.append(row);
      }
    };
    const selectNode = (id) => {
      const node = graph.nodes.find((item) => item.id === id); if (!node) return;
      reader.showSelection(selected, { kind: 'Concept', title: node.title,
        description: node.description });
      if (node.reusedFrom) selected.append(make('p', 'sl-small',
        `Teacher-copied from Graph ${node.reusedFrom.graphId} v${node.reusedFrom.version}, concept ${node.reusedFrom.nodeId}.`));
      appendEvidence(selected, node.evidenceRefs);
    };
    const selectEdge = (edge) => {
      const from = graph.nodes.find((item) => item.id === edge.source);
      const to = graph.nodes.find((item) => item.id === edge.target);
      reader.showSelection(selected, { kind: edge.basis === 'source-supported'
        ? 'Material-supported relationship' : 'Teaching association',
      title: `${from?.title || edge.source} → ${edge.label} → ${to?.title || edge.target}`,
      description: edge.reason });
      appendEvidence(selected, edge.evidenceRefs);
    };
    const canvas = new window.KnowledgeNetwork.Canvas(document.querySelector('#v4-canvas'),
      { editable: false, onSelect: selectNode, onSelectEdge: selectEdge });
    canvas.set(graph.nodes, graph.edges);
    document.querySelector('#graph-zoom-in').addEventListener('click', () => canvas.zoom(1.2));
    document.querySelector('#graph-zoom-out').addEventListener('click', () => canvas.zoom(1 / 1.2));
    document.querySelector('#graph-reset').addEventListener('click', () => canvas.resetView());
    const concepts = document.querySelector('#concept-list');
    for (const node of graph.nodes) {
      const button = make('button', 'kn-list-button', node.title); button.type = 'button';
      button.addEventListener('click', () => canvas.focus(node.id)); concepts.append(button);
    }
    const relationships = document.querySelector('#relationship-list');
    for (const edge of graph.edges) {
      const button = make('button', 'kn-list-button',
        `${edge.source} → ${edge.label} → ${edge.target}`); button.type = 'button';
      button.addEventListener('click', () => canvas.selectEdge(edge.id)); relationships.append(button);
    }
    const sourceList = document.querySelector('#graph-source-list');
    for (const source of sources.values()) {
      const row = make('div', 'v4-item');
      row.append(sourceLink(source), make('p', 'sl-small',
        `${source.revision ? `Revision ${source.revision} · ` : ''}${source.origin === 'captured'
          ? `Captured ${source.retrievedAt}` : `Teacher checked ${source.reviewedAt}`}`));
      if (source.publisher || source.publishedAt) row.append(make('p', 'sl-small',
        `${source.publisher || 'Publisher unknown'}${source.publishedAt ? ` · Published ${source.publishedAt}` : ''}`));
      if (source.scope) row.append(make('p', 'sl-small', `Analyzed scope: ${source.scope}`));
      if (source.origin === 'captured' && source.reviewedAt)
        row.append(make('p', 'sl-small', `Teacher last reviewed: ${source.reviewedAt}`));
      sourceList.append(row);
    }
    if (!sources.size) sourceList.textContent = 'No external sources recorded for this Graph Version.';
  } catch (error) { status.textContent = error.message; }
})();
