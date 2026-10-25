(async function () {
  const K = window.KnowledgeNetwork;
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
  graphs.append(card(sample.publication.title, 'Seven curated software development concepts and their relationships.',
    'Browse curated sample', `/knowledge-map/graph.html?graph=${K.sampleId}`));
  try {
    const result = await K.api('public-graphs', 'GET', undefined, { page: '0' });
    let count = 0;
    for (const graph of result.graphs || []) {
      if (graph.id === K.sampleId) continue;
      graphs.append(card(graph.title, `${graph.conceptCount} published concepts · ${graph.description || 'Explore this graph.'}`,
        'Browse published graph', `/knowledge-map/graph.html?${new URLSearchParams({ graph: graph.id })}`));
      count += 1;
      if (count === 3) break;
    }
    status.textContent = count ? `${count} recently published graphs featured. The curated sample is also available.`
      : 'The curated sample is available. More published graphs will appear here.';
  } catch (error) {
    status.textContent = `Published resources could not load: ${error.message} The curated sample is available.`;
  }
})();
