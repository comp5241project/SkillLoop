/** Module 1: published graph, mini-courses and personal learning records. */
(async function () {
  const app = window.SkillLoop;
  let graph = window.SkillLoopGraph;
  const $ = (selector) => document.querySelector(selector);
  let publicationKind = 'Curated sample';
  const preview = new URLSearchParams(location.search).has('draftPreview');
  if (preview) {
    try {
      graph = JSON.parse(sessionStorage.getItem('skillloop.knowledge.preview'));
      publicationKind = 'Unpublished draft preview';
    } catch { graph = window.SkillLoopGraph; }
  } else {
    try {
      const response = await fetch('../api/knowledge?op=public', { credentials: 'same-origin' });
      if (response.ok) {
        graph = (await response.json()).graph;
        publicationKind = 'Published';
      }
    } catch { /* Static prototype and offline preview use curated sample. */ }
  }
  function usable(candidate) {
    if (!candidate?.publication?.title || !candidate.publication.version ||
        !Array.isArray(candidate.topics) || !Array.isArray(candidate.relations) ||
        !Array.isArray(candidate.events) || !Array.isArray(candidate.activities)) return false;
    const topics = new Set(candidate.topics.map((item) => item?.id));
    const relations = new Set(candidate.relations.map((item) => item?.id));
    return topics.size === candidate.topics.length && relations.size === candidate.relations.length &&
      candidate.topics.every((item) => item?.id && item.position && item.lesson && item.title && item.description) &&
      candidate.relations.every((item) => item && topics.has(item.source) && topics.has(item.target)) &&
      candidate.events.every((item) => item?.source?.url && Array.isArray(item.links) && Array.isArray(item.claims) &&
        item.links.every((link) => topics.has(link?.topicId))) &&
      candidate.activities.every((item) => item && relations.has(item.relationId) && Array.isArray(item.topicIds) &&
        item.topicIds.every((id) => topics.has(id)) && Array.isArray(item.options));
  }
  if (!usable(graph)) {
    graph = window.SkillLoopGraph;
    publicationKind = 'Curated sample';
  }
  const byId = new Map(graph.topics.map((topic) => [topic.id, topic]));
  const relationById = new Map(graph.relations.map((relation) => [relation.id, relation]));
  const labels = { prerequisite: 'Learn before', enables: 'Enables', supports: 'Supports', related: 'Related to' };


  const saved = app.read('knowledge', {});
  const completed = new Set(Array.isArray(saved.completed)
    ? saved.completed.filter((id) => byId.has(id)) : []);
  const localReferences = Array.isArray(saved.references)
    ? saved.references.filter((reference, index, all) => reference && byId.has(reference.id) &&
      all.findIndex((item) => item && item.id === reference.id) === index).map((reference) => ({
        id: reference.id,
        version: typeof reference.version === 'string' ? reference.version : '',
        addedAt: typeof reference.addedAt === 'string' ? reference.addedAt : '',
        title: typeof reference.title === 'string' ? reference.title.slice(0, 100) : '',
        description: typeof reference.description === 'string' ? reference.description.slice(0, 280) : '',
        note: typeof reference.note === 'string' ? reference.note.slice(0, 1000) : '',
      })) : [];
  let remoteReferences = [];
  let signedIn = false;
  let accountAvailable = false;
  const requested = new URLSearchParams(location.search).get('topic');
  let selectedId = byId.has(requested) ? requested : byId.has(saved.selected) ? saved.selected : 'software-testing';
  let selectedRelationId = null;
  const nodeButtons = new Map();
  const relationButtons = new Map();

  function references() { return signedIn ? remoteReferences : localReferences; }

  async function api(op, method = 'GET', body) {
    const response = await fetch(`../api/knowledge?op=${encodeURIComponent(op)}`, {
      method, credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  async function loadRemoteReferences() {
    const data = await api('references');
    remoteReferences = (data.references || []).map((item) => ({
      id: item.concept_id, version: item.source_version, title: item.title_snapshot,
      description: item.description_snapshot, note: item.note, addedAt: item.added_at,
    })).filter((item) => byId.has(item.id));
    renderPersonal();
  }

  function renderAccount() {
    $('#sl-show-login').hidden = !accountAvailable || signedIn;
    $('#sl-logout').hidden = !signedIn;
    $('#sl-storage-note').textContent = signedIn
      ? 'Account references sync across devices. Study marks remain in this browser.'
      : 'Saved only in this browser. Referencing a node does not mark it as studied.';
  }

  function icon(name) {
    const element = document.createElement('i');
    element.dataset.lucide = name;
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  function persist() {
    app.write('knowledge', { selected: selectedId, completed: [...completed], references: localReferences });
  }

  function suggestedId() {
    return graph.topics.filter((topic) => topic.pathRole === 'core')
      .sort((a, b) => a.order - b.order).find((topic) => !completed.has(topic.id))?.id ?? null;
  }

  function selectTopic(id, updateUrl = true) {
    if (!byId.has(id)) return;
    selectedId = id;
    $('#sl-lesson-body').hidden = true;
    $('#sl-lesson').setAttribute('aria-expanded', 'false');
    $('#sl-lesson').textContent = 'Open lesson';
    $('#sl-reference-status').textContent = '';
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('topic', id);
      history.replaceState(null, '', url);
    }
    persist();
    render();
  }

  function makeNodes() {
    const container = $('#sl-graph');
    graph.topics.forEach((topic) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sl-node';
      button.dataset.topic = topic.id;
      button.style.gridColumn = String(topic.position.column);
      button.style.gridRow = String(topic.position.row);
      const nodeIcon = document.createElement('span');
      nodeIcon.className = 'sl-node-icon';
      nodeIcon.append(icon(topic.icon));
      const nodeTitle = document.createElement('span');
      nodeTitle.className = 'sl-node-title';
      nodeTitle.textContent = topic.title;
      const state = document.createElement('span');
      state.className = 'sl-node-state';
      nodeTitle.append(state);
      button.append(nodeIcon, nodeTitle);
      button.addEventListener('click', () => selectTopic(topic.id));
      container.append(button);
      nodeButtons.set(topic.id, button);
    });
  }

  function makePath() {
    const list = $('#sl-path-list');
    graph.topics.filter((topic) => topic.pathRole === 'core')
      .sort((a, b) => a.order - b.order).forEach((topic) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = topic.title;
        button.dataset.topic = topic.id;
        button.addEventListener('click', () => selectTopic(topic.id));
        item.append(button);
        list.append(item);
      });
  }

  function makeRelations() {
    const list = $('#sl-relations');
    graph.relations.forEach((relation) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sl-relation';
      button.textContent = `${byId.get(relation.source).title} → ${byId.get(relation.target).title} · ${labels[relation.type] || relation.type}`;
      button.addEventListener('click', () => {
        selectedRelationId = relation.id;
        renderRelation();
        drawConnections();
      });
      list.append(button);
      relationButtons.set(relation.id, button);
    });
  }

  function renderRelation() {
    relationButtons.forEach((button, id) => button.setAttribute('aria-pressed', String(id === selectedRelationId)));
    const box = $('#sl-relation-detail');
    box.replaceChildren();
    if (!selectedRelationId) {
      box.textContent = 'Choose a relationship above to see why it is shown.';
      return;
    }
    const relation = relationById.get(selectedRelationId);
    const title = document.createElement('strong');
    title.textContent = `${byId.get(relation.source).title} → ${byId.get(relation.target).title}`;
    const type = document.createElement('span');
    type.className = 'sl-small';
    type.textContent = ` ${labels[relation.type] || relation.type}`;
    const reason = document.createElement('p');
    reason.textContent = relation.reason;
    box.append(title, type, reason);
  }

  function renderActivity(topicId) {
    const activity = graph.activities.find((item) => item.topicIds.includes(topicId));
    const section = $('#sl-activity');
    section.hidden = !activity;
    if (!activity) return;
    $('#sl-activity-prompt').textContent = activity.prompt;
    const options = $('#sl-activity-options');
    options.replaceChildren();
    $('#sl-check-answer').disabled = true;
    $('#sl-activity-feedback').hidden = true;
    activity.options.forEach((option, index) => {
      const label = document.createElement('label');
      label.className = 'sl-answer-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'sl-activity-choice';
      input.value = String(index);
      input.addEventListener('change', () => {
        $('#sl-check-answer').disabled = false;
        $('#sl-activity-feedback').hidden = true;
      });
      label.append(input, document.createTextNode(option));
      options.append(label);
    });
  }

  function renderPersonal() {
    const list = $('#sl-personal-list');
    list.replaceChildren();
    if (!references().length) {
      const empty = document.createElement('p');
      empty.className = 'sl-small';
      empty.textContent = 'No references yet. Choose a concept and save it here.';
      list.append(empty);
    }
    references().forEach((reference) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sl-personal-item';
      button.setAttribute('aria-pressed', String(reference.id === selectedId));
      button.textContent = byId.get(reference.id).title;
      button.addEventListener('click', () => selectTopic(reference.id));
      list.append(button);
    });
    const selected = references().find((reference) => reference.id === selectedId);
    $('#sl-note-wrap').hidden = !selected;
    $('#sl-reference').textContent = selected ? 'Already in my map' : 'Reference in my map';
    if (selected) {
      $('#sl-note').value = selected.note;
      $('#sl-version-note').textContent = selected.version !== graph.publication.version
        ? `Saved from version ${selected.version || 'unknown'}. The public map is now ${graph.publication.version}. Original: ${selected.title} — ${selected.description}`
        : `Referenced from public version ${selected.version}. Your note stays ${signedIn ? 'in your account' : 'private to this browser'}.`;
    }
  }

  function renderEvents() {
    const list = $('#sl-events');
    list.replaceChildren();
    const events = graph.events.filter((event) => event.links.some((link) => link.topicId === selectedId));
    if (!events.length) {
      const empty = document.createElement('p');
      empty.className = 'sl-small';
      empty.textContent = 'No sourced event is linked to this concept yet.';
      list.append(empty);
      return;
    }
    events.forEach((event) => {
      const article = document.createElement('article');
      article.className = 'sl-event';
      const date = document.createElement('p');
      date.className = 'sl-kicker';
      date.textContent = `Event · ${event.date}`;
      const title = document.createElement('h3');
      title.textContent = event.title;
      const summary = document.createElement('p');
      summary.textContent = event.summary;
      const claims = document.createElement('ul');
      claims.className = 'sl-claims';
      event.claims.forEach((claim) => {
        const item = document.createElement('li');
        const status = document.createElement('strong');
        status.textContent = claim.kind === 'source-supported' ? 'Source-supported: ' : 'Teaching inference: ';
        item.append(status, document.createTextNode(claim.text));
        if (claim.sourceSection) {
          const section = document.createElement('span');
          section.className = 'sl-small';
          section.textContent = ` (${claim.sourceSection})`;
          item.append(section);
        }
        claims.append(item);
      });
      const source = document.createElement('p');
      source.className = 'sl-source';
      source.textContent = `Source published ${event.source.publishedDate}; checked ${event.source.checkedDate}. `;
      const link = document.createElement('a');
      link.href = event.source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${event.source.title} ↗`;
      source.append(link);
      const connections = document.createElement('div');
      connections.className = 'sl-event-links';
      event.links.forEach((item) => {
        const anchor = document.createElement('a');
        anchor.href = `?topic=${encodeURIComponent(item.topicId)}`;
        anchor.textContent = `${byId.get(item.topicId).title}: ${item.reason}`;
        connections.append(anchor);
      });
      article.append(date, title, summary, claims, source, connections);
      list.append(article);
    });
  }

  function render() {
    const topic = byId.get(selectedId);
    const suggestion = suggestedId();
    nodeButtons.forEach((button, id) => {
      button.setAttribute('aria-pressed', String(id === selectedId));
      button.dataset.status = completed.has(id) ? 'done' : id === suggestion ? 'suggested' : 'new';
      button.querySelector('.sl-node-state').textContent = completed.has(id) ? 'Studied' :
        id === suggestion ? 'Suggested next' : 'Explore';
    });
    document.querySelectorAll('#sl-path-list button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.topic === selectedId));
      button.dataset.status = completed.has(button.dataset.topic) ? 'done' : 'new';
    });
    $('#sl-node-title').textContent = topic.title;
    $('#sl-node-desc').textContent = topic.description;
    const nextIcon = icon(topic.icon);
    nextIcon.id = 'sl-detail-icon';
    $('#sl-detail-icon').replaceWith(nextIcon);
    $('#sl-lesson-goal').textContent = topic.lesson.goal;
    $('#sl-lesson-text').textContent = topic.lesson.explanation;
    $('#sl-lesson-example').textContent = topic.lesson.example;
    $('#sl-lesson-action').textContent = topic.lesson.nextAction;
    $('#sl-mark').textContent = completed.has(topic.id) ? 'Remove studied mark' : 'Mark as studied';
    const practice = $('#sl-practice-link');
    practice.hidden = !topic.practiceHref;
    if (topic.practiceHref) practice.href = topic.practiceHref;
    renderActivity(topic.id);
    renderPersonal();
    renderEvents();
    app.icons();
    requestAnimationFrame(drawConnections);
  }

  function drawConnections() {
    const container = $('#sl-graph');
    const svg = $('#sl-lines');
    const box = container.getBoundingClientRect();
    if (!box.width || !box.height) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.replaceChildren();
    graph.relations.forEach((relation) => {
      const from = nodeButtons.get(relation.source).getBoundingClientRect();
      const to = nodeButtons.get(relation.target).getBoundingClientRect();
      const x1 = from.right - box.left;
      const y1 = from.top + from.height / 2 - box.top;
      const x2 = to.left - box.left;
      const y2 = to.top + to.height / 2 - box.top;
      const middle = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} H${middle} V${y2} H${x2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', relation.id === selectedRelationId ? '2.5' : '1.25');
      if (relation.id === selectedRelationId) path.classList.add('sl-active-line');
      svg.append(path);
    });
  }

  $('#sl-publication').textContent = `${publicationKind} · version ${graph.publication.version}`;
  $('#sl-map-heading').textContent = graph.publication.title;
  makeNodes();
  makePath();
  makeRelations();
  renderRelation();
  $('#sl-lesson').addEventListener('click', () => {
    const body = $('#sl-lesson-body');
    body.hidden = !body.hidden;
    $('#sl-lesson').setAttribute('aria-expanded', String(!body.hidden));
    $('#sl-lesson').textContent = body.hidden ? 'Open lesson' : 'Close lesson';
  });
  $('#sl-mark').addEventListener('click', () => {
    if (completed.has(selectedId)) completed.delete(selectedId);
    else {
      completed.add(selectedId);
      app.appendEvent({ module: 'knowledge-map', type: 'lesson-studied', conceptId: selectedId });
    }
    persist();
    render();
  });
  $('#sl-reference').addEventListener('click', async () => {
    if (references().some((reference) => reference.id === selectedId)) {
      $('#sl-reference-status').textContent = 'This concept is already in your map.';
      return;
    }
    if (signedIn) {
      try {
        await api('reference', 'POST', { conceptId: selectedId });
        await loadRemoteReferences();
        $('#sl-reference-status').textContent = 'Saved to your account.';
      } catch (error) { $('#sl-reference-status').textContent = error.message; }
      return;
    }
    const topic = byId.get(selectedId);
    localReferences.push({ id: selectedId, version: graph.publication.version,
      addedAt: new Date().toISOString(), title: topic.title, description: topic.description, note: '' });
    persist();
    renderPersonal();
    $('#sl-reference-status').textContent = 'Saved to your map in this browser.';
  });
  $('#sl-note').addEventListener('input', (event) => {
    const reference = references().find((item) => item.id === selectedId);
    if (reference) {
      reference.note = event.target.value.slice(0, 1000);
      if (!signedIn) persist();
    }
  });
  $('#sl-note').addEventListener('change', async (event) => {
    if (!signedIn) return;
    try { await api('note', 'POST', { conceptId: selectedId, note: event.target.value.slice(0, 1000) }); }
    catch (error) { $('#sl-reference-status').textContent = error.message; }
  });
  $('#sl-remove-reference').addEventListener('click', async () => {
    if (signedIn) {
      try {
        await api('unreference', 'POST', { conceptId: selectedId });
        await loadRemoteReferences();
        $('#sl-reference-status').textContent = 'Account reference removed. Your study mark is unchanged.';
      } catch (error) { $('#sl-reference-status').textContent = error.message; }
      return;
    }
    const index = localReferences.findIndex((item) => item.id === selectedId);
    if (index >= 0) {
      localReferences.splice(index, 1);
      persist();
      renderPersonal();
      $('#sl-reference-status').textContent = 'Reference removed. Your study mark is unchanged.';
    }
  });
  $('#sl-check-answer').addEventListener('click', () => {
    const activity = graph.activities.find((item) => item.topicIds.includes(selectedId));
    const selected = document.querySelector('input[name="sl-activity-choice"]:checked');
    if (!activity || !selected) return;
    const feedback = $('#sl-activity-feedback');
    const relation = relationById.get(activity.relationId);
    feedback.textContent = `${Number(selected.value) === activity.answerIndex ? 'Matches this map. ' : 'Try reconsidering the connection. '}${activity.feedback} Relationship: ${relation.reason} This is practice, not a mastery score.`;
    feedback.hidden = false;
  });
  $('#sl-show-login').addEventListener('click', () => {
    $('#sl-login-form').hidden = !$('#sl-login-form').hidden;
  });
  $('#sl-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('login', 'POST', { email: $('#sl-email').value, password: $('#sl-password').value });
      $('#sl-password').value = '';
      signedIn = true;
      await loadRemoteReferences();
      $('#sl-login-form').hidden = true;
      $('#sl-account-status').textContent = 'Signed in. Your browser references remain here until you choose to move them.';
      renderAccount();
    } catch (error) { $('#sl-account-status').textContent = error.message; }
  });
  $('#sl-logout').addEventListener('click', async () => {
    try { await api('logout', 'POST', {}); } catch { /* Local account view still signs out. */ }
    signedIn = false;
    remoteReferences = [];
    $('#sl-account-status').textContent = 'Signed out. Showing references saved in this browser.';
    renderAccount();
    renderPersonal();
  });
  render();
  try {
    const state = await api('session');
    accountAvailable = true;
    signedIn = state.signedIn === true;
    if (signedIn) await loadRemoteReferences();
  } catch { /* The static site has no account API. */ }
  renderAccount();
  if (window.ResizeObserver) new ResizeObserver(drawConnections).observe($('#sl-graph'));
  else window.addEventListener('resize', drawConnections);
})();
