(function () {
  const K = window.KnowledgeNetwork;
  const catalog = window.SkillLoopCurated;
  const model = window.SkillLoopCuratedModel;
  const params = new URLSearchParams(location.search);
  const page = document.body.dataset.page;
  const content = document.querySelector('#curated-content');
  const notice = document.querySelector('#curated-notice');
  const breadcrumbs = document.querySelector('#curated-breadcrumbs');
  const sourceMap = new Map(catalog.sources.map((source) => [source.id, source]));
  const typeLabels = {
    'open-source': 'Open-source breakdown', 'case-study': 'Case study',
    'build-something': 'Build something', 'knowledge-collection': 'Knowledge collection',
  };
  const make = K.make;
  const reader = window.SkillLoopKnowledgeReader;
  const unitUrl = (unit, version) => `/knowledge-map/unit.html?${new URLSearchParams({ unit, ...(version ? { version } : {}) })}`;
  const directionUrl = (unit, version, direction) =>
    `/knowledge-map/direction.html?${new URLSearchParams({ unit, version, direction })}`;
  function anchor(label, url, className = '') {
    const link = make('a', className, label);
    link.href = url;
    return link;
  }
  function sourceLinks(ids, compact = false) {
    const list = make('ul', compact ? 'kn-source-links kn-source-compact' : 'kn-source-links');
    for (const id of [...new Set(ids || [])]) {
      const source = sourceMap.get(id);
      if (!source) continue;
      const item = make('li');
      const link = anchor(source.title, source.url);
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link);
      if (!compact) item.append(make('span', 'kn-source-meta',
        `${source.publisher} · ${source.kind} · checked ${source.verifiedAt}${source.location ? ` · ${source.location}` : ''}${source.revision ? ` · revision ${source.revision.slice(0, 12)}` : ''}`));
      list.append(item);
    }
    return list;
  }
  function statusPanel(title, explanation, latestUrl) {
    content.replaceChildren();
    const panel = make('section', 'sl-card kn-state');
    panel.append(make('h1', '', title), make('p', '', explanation));
    if (latestUrl) panel.append(anchor('View latest version', latestUrl, 'sl-btn'));
    panel.append(anchor('Return to Universe', '/knowledge-map/', 'sl-btn'));
    content.append(panel);
    document.title = `${title} | SkillLoop`;
  }
  function showNotice(unit, latestVersion) {
    if (unit.version === latestVersion) return;
    const box = make('div', 'kn-version-notice');
    box.append(make('strong', '', `You are viewing ${unit.version}. `),
      make('span', '', 'A newer version is available. Your link will stay on this version. '),
      anchor(`View ${latestVersion}`, unitUrl(unit.id), 'sl-btn'));
    notice.append(box);
  }
  function renderUnavailable(result, id) {
    if (result.state === 'missing-unit') return statusPanel('Exploration not found', 'This Unit ID is not in the curated catalog.');
    if (result.state === 'missing-version') return statusPanel('Version unavailable',
      'The requested Unit Version cannot be read. It has not been replaced with a different version.',
      unitUrl(id));
    if (result.state === 'withdrawn') return statusPanel('This version was withdrawn',
      result.unit.withdrawalReason, result.latestVersion !== result.unit.version ? unitUrl(id) : null);
    return false;
  }
  function disabledSave() {
    const wrap = make('div', 'kn-future-action');
    const button = make('button', 'sl-btn', 'Save to My Knowledge');
    button.type = 'button'; button.disabled = true;
    button.setAttribute('aria-describedby', 'curated-save-note');
    wrap.append(button, make('p', 'sl-small', 'Saving curated Units and nodes is not available in v0.3.'));
    wrap.lastChild.id = 'curated-save-note';
    return wrap;
  }
  function renderUnit(result) {
    const { unit, latestVersion } = result;
    document.title = `${unit.title} | SkillLoop`;
    showNotice(unit, latestVersion);
    breadcrumbs.append(make('span', '', unit.title));
    content.replaceChildren();
    content.append(reader.unitHero({ eyebrow: `${typeLabels[unit.type]} · Curated Sample · ${unit.version}`,
      title: unit.title, lead: unit.hook, question: unit.guidingQuestion,
      meta: `${unit.estimatedMinutes} min · ${unit.level} · reviewed ${unit.checkedAt}`,
      topics: unit.topics }));
    const { layout, article, aside } = reader.unitLayout(
      'Each direction has its own verified, versioned local graph. Read this Unit first or open any direction now.');
    for (const section of unit.sections) {
      const block = make('section', 'sl-card kn-unit-section');
      block.id = section.id;
      block.append(make('p', 'kn-eyebrow', section.kind.replaceAll('-', ' ')),
        make('h2', '', section.title), make('p', '', section.body));
      if (section.sources?.length) {
        block.append(make('p', 'kn-source-label', 'Source'), sourceLinks(section.sources, true));
      }
      article.append(block);
    }
    for (const direction of unit.directions) {
      aside.append(reader.directionCard({ title: direction.title, description: direction.summary,
        meta: `Pinned graph ${direction.graphId} ${direction.graphVersion}`,
        href: directionUrl(unit.id, unit.version, direction.id) }));
    }
    aside.append(disabledSave());
    content.append(layout);
    const sources = make('section', 'sl-card kn-source-section');
    sources.append(make('h2', '', 'Original materials and review'),
      make('p', '', 'This static sample records a source check. Source links let you check the claims and graph relationships yourself.'),
      sourceLinks(unit.sources));
    content.append(sources);
  }
  function renderDirection(result) {
    const { unit, direction, graph, latestVersion } = result;
    document.title = `${direction.title} | SkillLoop`;
    showNotice(unit, latestVersion);
    breadcrumbs.append(anchor(unit.title, unitUrl(unit.id, unit.version)), make('span', '', direction.title));
    content.replaceChildren();
    const hero = make('header', 'kn-unit-hero');
    hero.append(make('p', 'kn-eyebrow', `Curated direction · ${graph.id} ${graph.version}`),
      make('h1', '', direction.title), make('p', 'kn-lead', direction.summary),
      make('p', 'kn-meta', `Part of ${unit.title} ${unit.version} · graph pinned to ${graph.version}`));
    content.append(hero);
    const layout = make('div', 'kn-direction-layout');
    const mapCard = make('section', 'sl-card');
    mapCard.append(make('h2', '', 'Knowledge map'),
      make('p', '', 'Select a node or relationship to read its explanation and original sources. The list below also works by keyboard.'));
    const controls = make('div', 'sl-actions');
    const zoomIn = make('button', 'sl-btn', 'Zoom in');
    const zoomOut = make('button', 'sl-btn', 'Zoom out');
    const reset = make('button', 'sl-btn', 'Reset view');
    [zoomIn, zoomOut, reset].forEach((button) => { button.type = 'button'; controls.append(button); });
    mapCard.append(controls);
    const canvasHost = make('div'); canvasHost.id = 'curated-canvas';
    canvasHost.setAttribute('aria-label', 'Interactive knowledge map');
    mapCard.append(canvasHost);
    const list = make('div', 'kn-curated-list');
    mapCard.append(make('h3', '', 'Concepts'), list);
    const edgeList = make('div', 'kn-curated-list');
    mapCard.append(make('h3', '', 'Relationships'), edgeList);
    const context = make('aside', 'sl-card kn-context-panel');
    context.append(make('h2', '', 'Selection details'));
    const selected = make('div'); selected.id = 'curated-selected';
    selected.setAttribute('aria-live', 'polite');
    context.append(selected, disabledSave());
    layout.append(mapCard, context);
    content.append(layout);
    const basisLabel = (basis) => basis === 'source-supported' ? 'Material-supported fact' : 'Teaching association';
    function selectNode(id) {
      const node = graph.nodes.find((item) => item.id === id);
      if (!node) return;
      reader.showSelection(selected, { kind: 'Concept', title: node.title, description: node.description });
      if (node.contextNote) selected.append(make('h4', '', 'In this context'), make('p', '', node.contextNote));
      selected.append(make('p', 'kn-source-label', 'Evidence'), sourceLinks(node.sources, true));
    }
    function selectEdge(edge) {
      const from = graph.nodes.find((item) => item.id === edge.source);
      const to = graph.nodes.find((item) => item.id === edge.target);
      reader.showSelection(selected, { kind: basisLabel(edge.basis),
        title: `${from.title} → ${edge.label} → ${to.title}`, description: edge.reason });
      if (edge.sources?.length) selected.append(make('p', 'kn-source-label', 'Related material'), sourceLinks(edge.sources, true));
    }
    const canvas = new K.Canvas(canvasHost, { onSelect: selectNode, onSelectEdge: selectEdge });
    canvas.set(graph.nodes, graph.edges);
    zoomIn.addEventListener('click', () => canvas.zoom(1.2));
    zoomOut.addEventListener('click', () => canvas.zoom(1 / 1.2));
    reset.addEventListener('click', () => canvas.resetView());
    for (const node of graph.nodes) {
      const button = make('button', 'kn-list-button', node.title);
      button.type = 'button'; button.addEventListener('click', () => canvas.focus(node.id));
      list.append(button);
    }
    for (const edge of graph.edges) {
      const from = graph.nodes.find((item) => item.id === edge.source);
      const to = graph.nodes.find((item) => item.id === edge.target);
      const button = make('button', 'kn-list-button', `${from.title} → ${edge.label} → ${to.title}`);
      button.type = 'button'; button.addEventListener('click', () => canvas.selectEdge(edge.id));
      edgeList.append(button);
    }
    selected.append(make('p', '', 'Choose a concept or relationship to see why it appears here.'));
    const sourceIds = [...new Set([...graph.nodes.flatMap((node) => node.sources),
      ...graph.edges.flatMap((edge) => edge.sources || [])])];
    const sources = make('section', 'sl-card kn-source-section');
    sources.append(make('h2', '', 'Sources for this direction'), sourceLinks(sourceIds),
      make('p', 'kn-meta', 'These links describe the reviewed materials. A teaching association is an editorial learning connection, not a claim of technical causation.'));
    content.append(sources);
  }

  const id = params.get('unit');
  const version = params.get('version');
  if (!id) return statusPanel('Choose an exploration', 'Open a curated Unit from Universe.');
  if (page === 'curated-unit') {
    const result = model.resolveUnit(catalog, id, version);
    if (result.state !== 'ready') return renderUnavailable(result, id);
    return renderUnit(result);
  }
  const directionId = params.get('direction');
  if (!version) return statusPanel('Pinned Unit Version required',
    'Open a direction from a Unit so its graph version stays fixed.');
  if (!directionId) return statusPanel('Knowledge direction not found', 'No direction was specified in this link.');
  const result = model.resolveDirection(catalog, id, version, directionId);
  if (result.state === 'missing-direction') return statusPanel('Knowledge direction not found',
    'This direction does not belong to the requested Unit Version.', unitUrl(id, version));
  if (result.state === 'unavailable-graph') return statusPanel('Pinned graph unavailable',
    `The graph fixed to this Unit Version (${result.direction.graphId} ${result.direction.graphVersion}) cannot be read. No newer graph has been substituted.`,
    result.latestVersion !== version ? unitUrl(id) : null);
  if (result.state !== 'ready') return renderUnavailable(result, id);
  renderDirection(result);
})();
