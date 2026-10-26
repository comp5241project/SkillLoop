(async function () {
  const K = window.KnowledgeNetwork;
  const model = window.SkillLoopCuratedModel;
  const catalog = window.SkillLoopCurated;
  const params = new URLSearchParams(location.search);
  if (params.has('topic')) {
    location.replace(K.href('concept', { topic: params.get('topic') }));
    return;
  }
  const sample = window.SkillLoopGraph;
  const concepts = document.querySelector('#home-concepts');
  const graphs = document.querySelector('#home-graphs');
  const status = document.querySelector('#home-status');
  const search = document.querySelector('#home-search');
  const unitHost = document.querySelector('#home-units');
  const unitCount = document.querySelector('#unit-count');
  const unitSearch = document.querySelector('#unit-search');
  const typeSelect = document.querySelector('#unit-type');
  const topicSelect = document.querySelector('#unit-topic');
  const typeLabels = {
    'open-source': 'Open-source breakdown', 'case-study': 'Case study',
    'build-something': 'Build something', 'knowledge-collection': 'Knowledge collection',
  };

  function card(title, description, label, href) {
    const article = K.make('article', 'sl-card kn-directory-card');
    article.append(K.make('h3', '', title), K.make('p', '', description));
    const a = K.make('a', 'sl-btn', label); a.href = href; article.append(a);
    return article;
  }
  function renderConcepts() {
    const query = search.value.trim().toLowerCase();
    concepts.replaceChildren();
    for (const topic of sample.topics.filter((item) => !item.archived &&
      `${item.title} ${item.description}`.toLowerCase().includes(query))) {
      concepts.append(card(topic.title, topic.description, 'Read concept',
        `/knowledge-map/concept.html?${new URLSearchParams({ graph: K.sampleId, topic: topic.id })}`));
    }
    if (!concepts.childElementCount) concepts.append(K.make('p', '', 'No matching concepts.'));
  }
  search.addEventListener('input', renderConcepts);
  renderConcepts();

  const featured = catalog.index.slice().sort((a, b) => a.order - b.order)
    .map((entry) => model.resolveUnit(catalog, entry.id)).filter((result) => result.state === 'ready')
    .map((result) => result.unit);
  if (!featured.length) {
    unitHost.append(K.make('p', 'kn-error', 'Curated explorations are temporarily unavailable.'));
  } else {
    const topics = [...new Set(featured.flatMap((unit) => unit.topics))].sort();
    for (const topic of topics) {
      const option = K.make('option', '', topic);
      option.value = topic;
      topicSelect.append(option);
    }
    function renderUnits() {
      const query = unitSearch.value.trim().toLowerCase();
      const visible = featured.filter((unit) =>
        (!typeSelect.value || unit.type === typeSelect.value) &&
        (!topicSelect.value || unit.topics.includes(topicSelect.value)) &&
        (!query || `${unit.title} ${unit.hook} ${unit.guidingQuestion} ${unit.summary} ${unit.topics.join(' ')}`
          .toLowerCase().includes(query)));
      unitHost.replaceChildren();
      for (const unit of visible) {
        const article = K.make('article', 'kn-unit-card');
        const publishers = [...new Set(unit.sources.map((id) =>
          catalog.sources.find((source) => source.id === id)?.publisher).filter(Boolean))];
        article.append(K.make('span', 'kn-type', typeLabels[unit.type]),
          K.make('h3', '', unit.title), K.make('p', 'kn-hook', unit.hook),
          K.make('p', 'kn-question', unit.guidingQuestion), K.make('p', '', unit.summary));
        article.append(K.make('p', 'kn-source-origin', `Original material: ${publishers.join(', ')}`));
        article.append(K.make('p', 'kn-meta', `${unit.estimatedMinutes} min · ${unit.level} · ${unit.directions.length} knowledge direction${unit.directions.length === 1 ? '' : 's'}`));
        const topicRow = K.make('div', 'kn-topic-row');
        unit.topics.forEach((topic) => topicRow.append(K.make('span', 'kn-topic', topic)));
        article.append(topicRow);
        const link = K.make('a', 'sl-btn sl-btn-main', 'Explore this unit');
        link.href = `/knowledge-map/unit.html?${new URLSearchParams({ unit: unit.id })}`;
        article.append(link);
        unitHost.append(article);
      }
      if (!visible.length) unitHost.append(K.make('p', '', 'No explorations match these filters. Try another topic or type.'));
      unitCount.textContent = `${visible.length} of ${featured.length} units`;
    }
    [unitSearch, typeSelect, topicSelect].forEach((control) => control.addEventListener('input', renderUnits));
    renderUnits();
  }

  graphs.append(card(sample.publication.title, 'Seven curated software development concepts and their relationships.',
    'Browse original sample', `/knowledge-map/graph.html?graph=${K.sampleId}`));
  try {
    const result = await K.api('public-graphs', 'GET', undefined, { page: '0' });
    let count = 0;
    for (const graph of result.graphs || []) {
      if (graph.id === K.sampleId) continue;
      graphs.append(card(graph.title, `${graph.conceptCount} published concepts · ${graph.description || 'Explore this graph.'}`,
        'Browse teacher-shared graph', `/knowledge-map/graph.html?${new URLSearchParams({ graph: graph.id })}`));
      if (++count === 3) break;
    }
    status.textContent = count ? `${count} recently published graphs featured.`
      : 'The original sample is available. Teacher-shared graphs will appear here when published.';
  } catch (error) {
    status.textContent = 'Teacher-shared graphs could not load right now. The original sample is still available.';
  }
})();
