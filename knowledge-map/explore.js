(async function () {
  const K = window.KnowledgeNetwork;
  const list = document.querySelector('#explore-list');
  const status = document.querySelector('#explore-status');
  const more = document.querySelector('#explore-more');
  const sample = window.SkillLoopGraph;
  const seen = new Set();
  let page = 0;
  let loaded = 0;
  let unavailable = 0;

  function addCard(graph) {
    if (seen.has(graph.id)) return;
    seen.add(graph.id);
    const card = K.make('article', 'sl-card kn-directory-card');
    const heading = K.make('h2', '', graph.title);
    const description = K.make('p', '', graph.description);
    const meta = K.make('p', 'sl-small', `${graph.sample ? 'Curated sample' : 'Published graph'} · ${graph.conceptCount} concepts`);
    const link = K.make('a', 'sl-btn', 'Browse graph');
    link.href = `/knowledge-map/graph.html?${new URLSearchParams({ graph: graph.id })}`;
    card.append(heading, description, meta, link);
    list.append(card);
  }

  addCard({
    id: K.sampleId, title: sample.publication.title, sample: true,
    description: 'Seven curated software development concepts to explore without signing in.',
    conceptCount: sample.topics.filter((topic) => !topic.archived).length,
  });

  async function loadPage() {
    more.disabled = true;
    try {
      const result = await K.api('public-graphs', 'GET', undefined, { page: String(page) });
      for (const graph of result.graphs || []) addCard(graph);
      loaded += (result.graphs || []).length;
      unavailable += result.unavailableCount || 0;
      page += 1;
      status.textContent = unavailable
        ? `${loaded} published resources loaded; ${unavailable} could not be loaded. The curated sample is available above.`
        : loaded ? `${loaded} published resources loaded.`
          : 'No published resources yet. The curated sample is available above.';
      more.hidden = !result.hasMore;
    } catch (error) {
      status.textContent = `The public directory could not load this page: ${error.message} The curated sample is still available.`;
      more.hidden = false;
      more.textContent = 'Retry loading published graphs';
    } finally {
      more.disabled = false;
    }
  }

  more.addEventListener('click', () => { more.textContent = 'Load more published graphs'; loadPage(); });
  await loadPage();
})();
