(async function () {
  const host = document.querySelector('#unit-article');
  const status = document.querySelector('#reader-status');
  const reader = window.SkillLoopKnowledgeReader;
  const params = new URLSearchParams(location.search);
  const unitId = params.get('unit');
  const make = (tag, className = '', value = '') => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
  };
  const link = (label, href, className = '') => {
    const element = make('a', className, label); element.href = href; return element;
  };
  if (!unitId) { status.textContent = 'Unit ID is missing.'; return; }
  try {
    const query = new URLSearchParams({ op: 'public-unit', unit: unitId });
    if (params.get('version')) query.set('version', params.get('version'));
    const response = await fetch(`/api/knowledge-v4?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unit is unavailable.');
    const record = result.unit, unit = record.payload;
    const sourcesById = new Map((unit.sources || []).map((source) => [source.id, source]));
    document.title = `${unit.title} | SkillLoop`;
    host.replaceChildren();
    if (Number.isInteger(record.currentVersion) && record.version !== record.currentVersion) {
      const old = make('div', 'v4-risk');
      old.append(document.createTextNode(`You are viewing Unit Version ${record.version}. `),
        link(`Open current Version ${record.currentVersion}`,
          `/knowledge-map/teacher-unit.html?${new URLSearchParams({ unit: unitId })}`));
      host.append(old);
    }
    const typeLabels = { 'open-source': 'Open-source breakdown', 'case-study': 'Case study',
      'build-something': 'Build something', 'knowledge-collection': 'Knowledge collection' };
    host.append(reader.unitHero({
      eyebrow: `${typeLabels[unit.type] || 'Exploration Unit'} · From Teachers · Version ${record.version}`,
      title: unit.title, lead: unit.summary, question: unit.guidingQuestion,
      meta: `Published by ${record.publisherName || 'Teacher'} · ${new Date(record.published_at).toLocaleDateString()}`,
      topics: unit.topics || [],
    }));
    const { layout, article, aside } = reader.unitLayout(
      'Each direction opens the Graph Version fixed by this Unit Version.');
    for (const section of unit.sections || []) {
      const block = make('section', 'sl-card kn-unit-section'); block.id = section.id;
      block.append(make('p', 'kn-eyebrow', (section.kind || 'overview').replaceAll('-', ' ')),
        make('h2', '', section.title), make('p', 'v4-prose', section.body));
      for (const ref of section.evidenceRefs || []) {
        const source = sourcesById.get(ref.sourceId);
        const citation = make('p', 'kn-source-label', 'Evidence: ');
        if (source) citation.append(link(source.title, source.url), document.createTextNode(` · ${ref.location}`));
        else citation.append(document.createTextNode(`${ref.sourceId} · ${ref.location}`));
        block.append(citation);
      }
      article.append(block);
    }
    if (unit.activities?.length) {
      const activities = make('section', 'sl-card kn-unit-section');
      activities.append(make('p', 'kn-eyebrow', 'practice'), make('h2', '', 'Learning Activities'));
      for (const activity of unit.activities) {
        activities.append(make('h3', '', activity.prompt), make('p', '', activity.guidance || ''));
      }
      article.append(activities);
    }
    for (const ref of record.graph_refs || []) {
      const direction = unit.directions.find((item) => item.id === ref.directionId);
      if (!direction) continue;
      aside.append(reader.directionCard({ title: direction.title, description: direction.question,
        meta: `Pinned Graph Version ${ref.version}`,
        href: `/knowledge-map/teacher-direction.html?${new URLSearchParams({
          graph: ref.graphId, version: ref.version, unit: unitId, unitVersion: record.version,
        })}` }));
    }
    host.append(layout);

    const sourceSection = make('section', 'sl-card kn-source-section');
    sourceSection.append(make('h2', '', 'Original materials and review'),
      make('p', '', 'These records describe the material used or checked when this version was prepared.'));
    for (const source of unit.sources || []) {
      const row = make('div', 'v4-item');
      const sourceLink = link(source.title, source.url);
      sourceLink.target = '_blank'; sourceLink.rel = 'noopener noreferrer';
      row.append(sourceLink, make('p', 'sl-small', source.origin === 'captured'
        ? `Analyzed revision ${source.revision || 'not available'} · Captured ${source.retrievedAt || 'unknown'}`
        : `Teacher checked ${source.reviewedAt || 'unknown'}`));
      if (source.publisher || source.publishedAt) row.append(make('p', 'sl-small',
        `${source.publisher || 'Publisher unknown'}${source.publishedAt ? ` · Published ${source.publishedAt}` : ''}`));
      if (source.scope) row.append(make('p', 'sl-small', `Analyzed scope: ${source.scope}`));
      if (source.origin === 'captured' && source.reviewedAt)
        row.append(make('p', 'sl-small', `Teacher last reviewed: ${source.reviewedAt}`));
      sourceSection.append(row);
    }
    if (!unit.sources?.length) sourceSection.append(make('p', '', 'No external source recorded.'));
    host.append(sourceSection);
  } catch (error) { status.textContent = error.message; }
})();
