(async function () {
  const $ = (selector) => document.querySelector(selector);
  const K = window.KnowledgeNetwork;
  const make = K.make;
  const state = { unit: null, revision: null, planRevision: null, dirty: false, graph: null, graphRevision: null,
    graphDirty: false, currentDirection: null, graphVersion: null, step: 'overview', jobPoll: null };

  async function api(op, method = 'GET', body, query = {}) {
    const url = new URL('/api/knowledge-v4', location.origin);
    url.searchParams.set('op', op);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { method, credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Knowledge request failed.');
    return result;
  }

  const status = (value) => { $('#studio-status').textContent = value; };
  const uid = () => crypto.randomUUID();
  $('#generation-options').before(make('p', 'sl-small',
    'Choose up to three confirmed Directions per AI job. Run another batch for remaining Directions; each proposal stays private until you accept it.'));
  const slug = (value) => (value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52) || 'item');
  function uniqueSlug(value, items) {
    const base = slug(value);
    let id = base, index = 2;
    while (items.some((item) => item.id === id)) id = `${base}-${index++}`;
    return id;
  }
  function button(label, action, className = 'sl-btn') {
    const element = make('button', className, label);
    element.type = 'button'; element.addEventListener('click', action);
    return element;
  }
  function field(label, value, change, multiline = false) {
    const wrap = make('label', '', label);
    const input = make(multiline ? 'textarea' : 'input');
    input.value = value || '';
    input.addEventListener('input', () => change(input.value));
    wrap.append(input);
    return wrap;
  }
  function dirtyUnit() {
    state.dirty = true;
    $('#draft-state').textContent = 'Unsaved changes';
  }
  function dirtyGraph() { state.graphDirty = true; $('#graph-state').textContent = 'Unsaved Graph changes'; }
  function changedPlan() { state.unit.confirmedPlanFingerprint = null; dirtyUnit(); renderDirectionState(); }

  function showStep(name) {
    state.step = name;
    document.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
    document.querySelectorAll('[data-step]').forEach((button) => {
      if (button.dataset.step === name) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    if (name === 'graph') renderGraphDirections();
    if (name === 'publish') renderPublish();
  }
  document.querySelectorAll('[data-step]').forEach((button) =>
    button.addEventListener('click', () => showStep(button.dataset.step)));

  async function listUnits() {
    const { units } = await api('my-units');
    const host = $('#unit-list'); host.replaceChildren();
    for (const unit of units || []) {
      const item = button(`${unit.title}${unit.current_version ? ` · v${unit.current_version}` : ' · draft'}`,
        () => loadUnit(unit.id), 'kn-list-button');
      host.append(item);
    }
    if (!host.childElementCount) host.append(make('p', '', 'Create your first Unit.'));
  }

  async function loadUnit(id) {
    if ((state.dirty || state.graphDirty) && !window.confirm('Discard unsaved Unit or Graph changes?')) return false;
    if (state.jobPoll) clearTimeout(state.jobPoll);
    state.jobPoll = null;
    const { draft } = await api('unit-draft', 'GET', undefined, { unit: id });
    state.unit = draft.payload; state.revision = draft.revision;
    state.planRevision = draft.plan_revision; state.dirty = false;
    state.graph = null; state.graphRevision = null; state.graphDirty = false;
    $('#unit-workspace').hidden = false;
    $('#unit-heading').textContent = state.unit.title || 'Untitled Unit';
    $('#draft-state').textContent = `Private draft · revision ${state.revision.slice(0, 8)}`;
    fillOverview(); renderSources(); renderSections(); renderDirections(); renderActivities();
    showStep('overview');
    $('#planning-proposal').replaceChildren(); $('#generation-proposal').replaceChildren();
    $('#local-proposal').replaceChildren(); $('#local-proposal').hidden = true;
    delete $('#planning-proposal').dataset.proposalId;
    delete $('#generation-proposal').dataset.proposalId;
    delete $('#local-proposal').dataset.proposalId;
    $('#analysis-state').textContent = ''; $('#generation-state').textContent = '';
    try {
      await refreshJobsAndProposals(id);
    } catch (error) { status(`Draft loaded. Proposals could not be restored: ${error.message}`); }
    return true;
  }

  async function refreshJobsAndProposals(id) {
    if (state.unit?.id !== id) return;
    const [{ jobs }, { proposals }] = await Promise.all([
      api('jobs', 'GET', undefined, { unit: id }), api('proposals', 'GET', undefined, { unit: id }),
    ]);
    if (state.unit?.id !== id) return;
    const latestJobs = jobs.filter((job, index) => jobs.findIndex((item) => item.kind === job.kind) === index);
    const pending = latestJobs.filter((job) => ['queued', 'running'].includes(job.effectiveStatus));
    const interrupted = latestJobs.filter((job) => job.effectiveStatus === 'interrupted');
    const latestFailure = latestJobs.find((job) => job.status === 'failed');
    const banner = $('#job-list');
    banner.hidden = !(pending.length || interrupted.length || latestFailure);
    banner.textContent = pending.length ? `${pending.length} AI task${pending.length === 1 ? '' : 's'} still running. Saved proposals will appear here when ready.`
      : interrupted.length ? 'An AI task was interrupted. Your draft is safe; retry the task from its step.'
        : latestFailure ? `Last AI task failed: ${latestFailure.error || 'retry from its step.'}` : '';
    const planning = proposals.find((item) => item.kind === 'plan' && !item.accepted_at && !item.dismissed_at &&
      item.unit_revision === state.revision);
    const generation = proposals.find((item) => item.kind === 'generate' && !item.accepted_at && !item.dismissed_at &&
      item.unit_revision === state.revision && item.plan_revision === state.planRevision &&
      state.unit.confirmedPlanFingerprint);
    const localRevision = proposals.find((item) => item.kind === 'regenerate' && !item.accepted_at && !item.dismissed_at &&
      item.unit_revision === state.revision && item.plan_revision === state.planRevision);
    if (planning && $('#planning-proposal').dataset.proposalId !== planning.id) {
      showPlanProposal({ id: planning.id, ...planning.payload });
      $('#planning-proposal').dataset.proposalId = planning.id;
      $('#analysis-state').textContent = 'Saved planning proposal available for review.';
    }
    if (generation && $('#generation-proposal').dataset.proposalId !== generation.id) {
      showGenerationProposal({ id: generation.id, ...generation.payload });
      $('#generation-proposal').dataset.proposalId = generation.id;
      $('#generation-state').textContent = 'Saved generation proposal available for review.';
    }
    if (localRevision && $('#local-proposal').dataset.proposalId !== localRevision.id)
      showLocalProposal({ id: localRevision.id, ...localRevision.payload });
    if (state.jobPoll) clearTimeout(state.jobPoll);
    state.jobPoll = pending.length ? setTimeout(() => {
      refreshJobsAndProposals(id).catch((error) => { $('#job-list').textContent = error.message; });
    }, 5000) : null;
  }

  $('#new-unit').addEventListener('click', async () => {
    try {
      if ((state.dirty || state.graphDirty) && !window.confirm('Discard unsaved Unit or Graph changes?')) return;
      const title = window.prompt('Unit title (you can change it later):', 'New Exploration Unit');
      if (title === null) return;
      state.dirty = false; state.graphDirty = false;
      const { unit } = await api('create-unit', 'POST', { title: title.trim() || 'New Exploration Unit' });
      await listUnits(); await loadUnit(unit.id);
      status('New private Unit draft created.');
    } catch (error) { status(error.message); }
  });
  $('#unit-from-template').addEventListener('click', async () => {
    try {
      if ((state.dirty || state.graphDirty) && !window.confirm('Discard unsaved Unit or Graph changes?')) return;
      const catalog = window.SkillLoopCurated;
      const examples = catalog.index.map((entry) => catalog.units.find((unit) =>
        unit.id === entry.id && unit.version === entry.latestVersion));
      const choice = window.prompt(`Choose a Discover template:\n${examples.map((unit, index) =>
        `${index + 1}: ${unit.title}`).join('\n')}`);
      if (choice === null) return;
      const template = examples[Number(choice) - 1];
      if (!template) throw new Error('Choose a listed template number.');
      state.dirty = false; state.graphDirty = false;
      const { unit } = await api('create-unit', 'POST', { title: `${template.title} — class exploration`, type: template.type });
      if (!await loadUnit(unit.id)) return;
      state.unit.summary = template.summary;
      state.unit.guidingQuestion = template.guidingQuestion;
      state.unit.topics = [...template.topics];
      state.unit.sections = template.sections.filter((section) => section.kind !== 'activity')
        .map((section) => ({ id: section.id, kind: section.kind, title: section.title,
          body: '', claimKind: 'general', evidenceRefs: [] }));
      state.unit.activities = template.sections.filter((section) => section.kind === 'activity')
        .map((section) => ({ id: section.id, prompt: section.body, guidance: '', evidenceRefs: [] }));
      state.unit.directions = template.directions.map((direction) => ({
        id: direction.id, graphId: uid(), title: direction.title,
        question: `What can we investigate about ${direction.title}?`, scope: direction.summary }));
      changedPlan(); fillOverview(); renderSections(); renderActivities(); renderDirections(); await saveUnit();
      status('Template outline copied into a private Unit. Add your own content, review sources, and confirm Directions.');
    } catch (error) { status(error.message); }
  });

  function fillOverview() {
    const form = $('#unit-form');
    for (const name of ['title', 'publisherName', 'type', 'summary', 'guidingQuestion'])
      form.elements[name].value = state.unit[name] || '';
    form.elements.topics.value = state.unit.topics.join(', ');
  }
  $('#unit-form').addEventListener('input', (event) => {
    if (!state.unit) return;
    const input = event.target;
    if (input.name === 'topics') state.unit.topics = input.value.split(',').map((item) => item.trim()).filter(Boolean);
    else state.unit[input.name] = input.value;
    $('#unit-heading').textContent = state.unit.title || 'Untitled Unit'; dirtyUnit();
  });

  function renderSources() {
    const host = $('#source-list'); host.replaceChildren();
    for (const source of state.unit.sources) {
      const card = make('div', 'v4-item');
      const link = make('a', '', source.title); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      card.append(link, make('p', 'sl-small', source.origin === 'captured'
        ? `Captured · ${source.retrievedAt || ''}${source.reviewedAt ? ` · Teacher reviewed ${source.reviewedAt}` : ''}`
        : `Teacher checked · ${source.reviewedAt || ''}`));
      if (source.publisher || source.publishedAt) card.append(make('p', 'sl-small',
        `${source.publisher || 'Publisher unknown'}${source.publishedAt ? ` · Published ${source.publishedAt}` : ''}`));
      if (source.scope) card.append(make('p', 'sl-small', `Analyzed scope: ${source.scope}`));
      if (source.origin === 'captured') card.append(button('Mark reviewed now', () => {
        source.reviewedAt = new Date().toISOString(); dirtyUnit(); renderSources();
      }));
      card.append(
        button('Remove source', () => { state.unit.sources = state.unit.sources.filter((item) => item.id !== source.id); dirtyUnit(); renderSources(); }));
      host.append(card);
    }
  }
  $('#source-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const url = new URL(form.elements.url.value);
    if (url.protocol !== 'https:') { status('Sources must use HTTPS.'); return; }
    state.unit.sources.push({ id: uid(), title: form.elements.title.value.trim(), url: url.href,
      origin: 'manual', reviewedAt: new Date().toISOString() });
    form.reset(); dirtyUnit(); renderSources();
  });

  async function regenerateItem(kind, item, host) {
    const graphItem = kind === 'node' || kind === 'edge';
    const statusLine = make('p', 'sl-small', 'Preparing a local revision…');
    host.append(statusLine);
    try {
      if (graphItem) await saveGraph(); else await saveUnit();
      const result = await api('regenerate-item', 'POST', {
        unitId: state.unit.id, expectedRevision: state.revision, requestId: uid(),
        kind, itemId: item.id, ...(graphItem ? { graphId: state.graph.id,
          expectedGraphRevision: state.graphRevision } : {}),
      });
      if (result.proposal) { showLocalProposal(result.proposal); statusLine.textContent = 'AI suggestion ready above the Unit workspace.'; }
      else { statusLine.textContent = 'AI revision queued. You can leave and return to this Unit.';
        await refreshJobsAndProposals(state.unit.id); }
    } catch (error) { statusLine.textContent = error.message; }
  }

  function showLocalProposal(proposal) {
    const host = $('#local-proposal'); host.hidden = false; host.replaceChildren();
    host.dataset.proposalId = proposal.id;
    host.append(make('h3', '', `AI suggestion for ${proposal.kind} ${proposal.itemId}`),
      make('p', 'v4-prose', proposal.text), button('Accept this revision', async () => {
        try {
          await api('verify-proposal', 'POST', { unitId: state.unit.id, proposalId: proposal.id });
          const graphItem = proposal.kind === 'node' || proposal.kind === 'edge';
          let item;
          if (graphItem) {
            const direction = state.unit.directions.find((entry) => entry.graphId === proposal.graphId);
            if (!direction) throw new Error('Direction was removed. Regenerate this item.');
            if (state.graph?.id !== proposal.graphId) await loadGraph(direction.id);
            if (state.graph?.id !== proposal.graphId || state.graphRevision !== proposal.graphRevision)
              throw new Error('Graph draft changed. Regenerate this item.');
            item = (proposal.kind === 'node' ? state.graph.nodes : state.graph.edges)
              .find((entry) => entry.id === proposal.itemId);
          } else item = (proposal.kind === 'section' ? state.unit.sections : state.unit.activities)
            .find((entry) => entry.id === proposal.itemId);
          if (!item) throw new Error('The original item is unavailable. Regenerate it.');
          const property = proposal.kind === 'section' ? 'body' : proposal.kind === 'activity' ? 'prompt' :
            proposal.kind === 'node' ? 'description' : 'reason';
          if (item[property] !== proposal.originalText)
            throw new Error('This item changed while AI worked. Keep your edit or regenerate again.');
          item[property] = proposal.text;
          if (graphItem) { dirtyGraph(); await saveGraph(); renderGraph(); }
          else { dirtyUnit(); await saveUnit(); proposal.kind === 'section' ? renderSections() : renderActivities(); }
          await api('accept-proposal', 'POST', { unitId: state.unit.id, proposalId: proposal.id });
          host.replaceChildren(); host.hidden = true;
          status('Local AI revision added to the private draft for teacher review.');
        } catch (error) { status(error.message); }
      }, 'sl-btn sl-btn-main'), dismissProposalButton(proposal, host));
  }

  function dismissProposalButton(proposal, host) {
    return button('Dismiss proposal', async () => {
      try {
        await api('dismiss-proposal', 'POST', { unitId: state.unit.id, proposalId: proposal.id });
        host.replaceChildren(); host.hidden = host.id === 'local-proposal';
        delete host.dataset.proposalId;
        status('AI proposal dismissed. Your drafts were not changed.');
      } catch (error) { status(error.message); }
    });
  }

  function renderSections() {
    const host = $('#section-list'); host.replaceChildren();
    for (const section of state.unit.sections) {
      const card = make('div', 'v4-item');
      card.append(field('Section title', section.title, (value) => { section.title = value; dirtyUnit(); }),
        field('Body', section.body, (value) => { section.body = value; dirtyUnit(); }, true),
        claimControls(section, dirtyUnit),
        button('Regenerate wording', () => regenerateItem('section', section, card)),
        button('Remove section', () => { state.unit.sections = state.unit.sections.filter((item) => item.id !== section.id);
          dirtyUnit(); renderSections(); }));
      host.append(card);
    }
  }
  function claimControls(item, onChange) {
    const host = make('div');
    const label = make('label', '', 'Claim type');
    const select = make('select');
    for (const [value, title] of [['general', 'General explanation / teaching judgment'], ['code', 'Code implementation'],
      ['file', 'Specific file location'], ['research', 'Research finding'], ['event', 'Event data'], ['external', 'External fact']]) {
      const option = make('option', '', title); option.value = value; select.append(option);
    }
    select.value = item.claimKind || 'general';
    select.addEventListener('change', () => { item.claimKind = select.value; onChange(); });
    label.append(select); host.append(label);
    const refs = make('div');
    const render = () => {
      refs.replaceChildren();
      for (const ref of item.evidenceRefs || []) {
        const source = state.unit.sources.find((entry) => entry.id === ref.sourceId);
        refs.append(make('p', 'sl-small', `${source?.title || 'Missing source'} · ${ref.location}`),
          button('Remove reference', () => { item.evidenceRefs = item.evidenceRefs.filter((entry) => entry !== ref);
            onChange(); render(); }));
      }
    };
    render(); host.append(refs);
    host.append(button('Add evidence reference', () => {
      if (!state.unit.sources.length) { status('Add a source in Overview first.'); return; }
      const names = state.unit.sources.map((source, index) => `${index + 1}: ${source.title}`).join('\n');
      const index = Number(window.prompt(`Choose source number:\n${names}`)) - 1;
      const source = state.unit.sources[index]; if (!source) return;
      const location = window.prompt('Verifiable location (file path, heading, paragraph or URL fragment):');
      if (!location?.trim()) return;
      item.evidenceRefs ||= [];
      item.evidenceRefs.push({ sourceId: source.id, location: location.trim(), kind: item.claimKind || 'external' });
      onChange(); render();
    }));
    return host;
  }
  $('#add-section').addEventListener('click', () => {
    const id = uniqueSlug('section', state.unit.sections);
    state.unit.sections.push({ id, kind: 'overview', title: 'New section', body: '', evidenceRefs: [] });
    dirtyUnit(); renderSections();
  });

  function renderDirectionState() {
    $('#direction-state').textContent = state.unit.confirmedPlanFingerprint
      ? 'Direction Planning confirmed. Changes to a direction require confirmation again.'
      : 'Planning not confirmed. AI cannot generate Direction Graphs yet.';
  }
  function renderDirections() {
    const host = $('#direction-list'); host.replaceChildren();
    for (const direction of state.unit.directions) {
      const card = make('div', 'v4-item');
      card.append(field('Title', direction.title, (value) => { direction.title = value; changedPlan(); }),
        field('Learning question', direction.question, (value) => { direction.question = value; changedPlan(); }),
        field('Scope', direction.scope, (value) => { direction.scope = value; changedPlan(); }, true),
        make('p', 'sl-small', `Direction ID ${direction.id} · Graph ${direction.graphId}`),
        button('Merge into another Direction', () => {
          const targets = state.unit.directions.filter((item) => item.id !== direction.id);
          if (!targets.length) { status('Add another Direction before merging.'); return; }
          const choice = window.prompt(`Merge into which Direction?\n${targets.map((item, index) => `${index + 1}: ${item.title}`).join('\n')}`);
          const target = targets[Number(choice) - 1]; if (!target) return;
          target.scope = `${target.scope}\n${direction.scope}`.trim();
          target.question = `${target.question} ${direction.question}`.trim().slice(0, 400);
          state.unit.directions = state.unit.directions.filter((item) => item.id !== direction.id);
          changedPlan(); renderDirections();
        }),
        button('Remove Direction', () => { state.unit.directions = state.unit.directions.filter((item) => item.id !== direction.id);
          changedPlan(); renderDirections(); }));
      host.append(card);
    }
    renderDirectionState();
    const options = $('#generation-options'); options.replaceChildren();
    for (const direction of state.unit.directions) {
      const label = make('label'); const box = make('input'); box.type = 'checkbox'; box.value = direction.id;
      label.append(box, document.createTextNode(` ${direction.title}`)); options.append(label);
    }
  }
  $('#add-direction').addEventListener('click', () => {
    const title = window.prompt('Direction title:', 'New Direction');
    if (title === null) return;
    state.unit.directions.push({ id: uniqueSlug(title, state.unit.directions), graphId: uid(),
      title: title.trim() || 'New Direction', question: 'What should learners investigate?', scope: 'Define the learning scope.' });
    changedPlan(); renderDirections();
  });

  async function saveUnit() {
    if (!state.unit || !state.dirty) return;
    const result = await api('save-unit', 'POST', { unitId: state.unit.id,
      expectedRevision: state.revision, payload: state.unit });
    state.revision = result.revision; state.dirty = false;
    $('#draft-state').textContent = `Saved private draft · revision ${state.revision.slice(0, 8)}`;
    await listUnits();
  }
  $('#save-unit').addEventListener('click', async () => {
    try { await saveUnit(); status('Unit draft saved.'); } catch (error) { status(error.message); }
  });
  $('#confirm-directions').addEventListener('click', async () => {
    try {
      await saveUnit();
      const result = await api('confirm-plan', 'POST', { unitId: state.unit.id, expectedRevision: state.revision });
      state.unit = result.unit; state.revision = result.revision;
      state.planRevision = result.planRevision; state.dirty = false;
      renderDirections(); status(`Direction Planning confirmed at revision ${result.planRevision}.`);
    } catch (error) { status(error.message); }
  });

  function renderActivities() {
    const host = $('#activity-list'); host.replaceChildren();
    for (const activity of state.unit.activities) {
      const card = make('div', 'v4-item');
      card.append(field('Prompt', activity.prompt, (value) => { activity.prompt = value; dirtyUnit(); }, true),
        field('Guidance', activity.guidance, (value) => { activity.guidance = value; dirtyUnit(); }, true),
        button('Regenerate prompt', () => regenerateItem('activity', activity, card)),
        button('Remove activity', () => { state.unit.activities = state.unit.activities.filter((item) => item.id !== activity.id);
          dirtyUnit(); renderActivities(); }));
      host.append(card);
    }
  }
  $('#add-activity').addEventListener('click', () => {
    state.unit.activities.push({ id: uniqueSlug('activity', state.unit.activities), prompt: '', guidance: '', evidenceRefs: [] });
    dirtyUnit(); renderActivities();
  });

  const canvas = new K.Canvas($('#v4-canvas'), { editable: true,
    onSelect: (id) => inspectNode(id), onSelectEdge: (edge) => inspectEdge(edge.id),
    onMove: (item) => { const node = state.graph?.nodes.find((entry) => entry.id === item.id);
      if (node) { node.x = item.x; node.y = item.y; dirtyGraph(); } } });

  function renderGraphDirections() {
    const select = $('#graph-direction'); select.replaceChildren();
    for (const direction of state.unit.directions) {
      const option = make('option', '', direction.title); option.value = direction.id; select.append(option);
    }
    if (state.currentDirection && state.unit.directions.some((item) => item.id === state.currentDirection))
      select.value = state.currentDirection;
    if (select.value) loadGraph(select.value);
    else { state.graph = null; canvas.set([], []); $('#graph-state').textContent = 'Add a Direction first.'; }
  }
  $('#graph-direction').addEventListener('change', (event) => loadGraph(event.target.value));

  $('#reuse-independent').addEventListener('toggle', async (event) => {
    if (!event.currentTarget.open) return;
    const choice = $('#independent-graph-choice'); choice.replaceChildren();
    try {
      const { graphs } = await api('independent-graphs');
      for (const graph of graphs) {
        const option = make('option', '', `${graph.title} · ${graph.current_version}`);
        option.value = graph.id; option.dataset.version = graph.current_version; choice.append(option);
      }
      $('#copy-independent').disabled = !graphs.length;
      $('#copy-independent-state').textContent = graphs.length
        ? 'Choose a published graph and confirm the copy.' : 'No published Independent Graphs found.';
    } catch (error) { $('#copy-independent-state').textContent = error.message; }
  });
  $('#copy-independent').addEventListener('click', async () => {
    const choice = $('#independent-graph-choice'); const selected = choice.selectedOptions[0];
    if (!selected || !state.currentDirection || !state.graph) return;
    if (state.graphRevision || state.graphDirty || state.graph.nodes.length) {
      $('#copy-independent-state').textContent = 'This Direction already has Graph work. Create a new Direction to copy without overwriting edits.';
      return;
    }
    if (!window.confirm(`Copy ${selected.textContent} into this Direction Graph draft? The independent Graph stays unchanged.`)) return;
    try {
      await saveUnit();
      const result = await api('copy-independent-graph', 'POST', { unitId: state.unit.id,
        directionId: state.currentDirection, sourceGraphId: selected.value,
        sourceVersion: selected.dataset.version, confirmed: true });
      state.graph = result.graph; state.graphRevision = result.revision; state.graphDirty = false;
      renderGraph();
      $('#graph-state').textContent = `Copied from Independent Graph ${selected.value} ${selected.dataset.version} into this Direction draft.`;
      $('#copy-independent-state').textContent = 'Copy saved privately. Review concepts, relationships and evidence before publishing.';
    } catch (error) { $('#copy-independent-state').textContent = error.message; }
  });

  const conceptReuse = make('details', 'v4-proposal-preview');
  conceptReuse.append(make('summary', '', 'Reuse one published concept'),
    make('p', '', 'Copy a concept from one of your published Direction Graph Versions. It gets a local ID; review its claim type and add evidence before publishing.'));
  const conceptChoice = make('select');
  const conceptCopy = button('Copy selected concept', async () => {
    const selected = conceptChoice.selectedOptions[0];
    if (!selected || !state.currentDirection || !state.graph) return;
    if (state.graphDirty) { conceptState.textContent = 'Save current Graph edits before copying a concept.'; return; }
    if (!window.confirm(`Copy “${selected.textContent}” into this Direction Graph?`)) return;
    try {
      await saveUnit();
      const result = await api('copy-concept', 'POST', { unitId: state.unit.id,
        directionId: state.currentDirection, sourceGraphId: selected.dataset.graph,
        sourceVersion: Number(selected.dataset.version), sourceNodeId: selected.dataset.node,
        expectedGraphRevision: state.graphRevision, confirmed: true });
      state.graph = result.graph; state.graphRevision = result.revision; state.graphDirty = false;
      renderGraph(); canvas.focus(result.nodeId);
      conceptState.textContent = `Concept copied as ${result.nodeId}. Its original evidence was not copied; review before publishing.`;
    } catch (error) { conceptState.textContent = error.message; }
  });
  const conceptState = make('p', 'sl-small'); conceptState.setAttribute('role', 'status');
  conceptReuse.append(conceptChoice, conceptCopy, conceptState);
  $('#reuse-independent').after(conceptReuse);
  conceptReuse.addEventListener('toggle', async () => {
    if (!conceptReuse.open) return;
    conceptChoice.replaceChildren();
    try {
      const { concepts } = await api('reusable-concepts');
      for (const concept of concepts) {
        const option = make('option', '', `${concept.title} · ${concept.graphTitle} v${concept.version}`);
        option.dataset.graph = concept.graphId; option.dataset.version = concept.version;
        option.dataset.node = concept.nodeId; conceptChoice.append(option);
      }
      conceptCopy.disabled = !concepts.length;
      conceptState.textContent = concepts.length ? 'Select a concept and confirm the copy.' : 'No published concepts found.';
    } catch (error) { conceptState.textContent = error.message; }
  });

  async function loadGraph(directionId) {
    if (state.graphDirty && !window.confirm('Discard unsaved Graph changes?')) {
      $('#graph-direction').value = state.currentDirection; return;
    }
    const direction = state.unit.directions.find((item) => item.id === directionId);
    if (!direction) return;
    state.currentDirection = directionId;
    try {
      const { graph, draft } = await api('graph-state', 'GET', undefined, { graph: direction.graphId });
      state.graph = draft?.payload || { schemaVersion: '0.4', id: direction.graphId,
        directionId, title: direction.title, nodes: [], edges: [] };
      state.graphRevision = draft?.revision || null;
      state.graphVersion = graph?.current_version || null;
      state.graphDirty = false;
      $('#graph-state').textContent = draft ? `Graph draft ${state.graphRevision.slice(0, 8)} · published ${state.graphVersion || 'none'}`
        : 'New private Direction Graph';
      if (state.graph.importedFrom) $('#graph-state').textContent +=
        ` · copied from Independent Graph ${state.graph.importedFrom.graphId} ${state.graph.importedFrom.version}`;
      renderGraph();
      document.querySelector('.v4-graph-withdraw')?.remove();
      if (graph?.current_version) {
        const { versions } = await api('graph-versions', 'GET', undefined, { graph: direction.graphId });
        const active = versions.filter((item) => !item.withdrawn_reason);
        if (active.length) {
          const controls = make('div', 'v4-graph-withdraw sl-actions');
          const select = make('select');
          for (const item of active) {
            const option = make('option', '', `Graph Version ${item.version}`);
            option.value = item.version; select.append(option);
          }
          controls.append(select, button('Withdraw selected Graph Version', async () => {
            const reason = window.prompt('This also withdraws published Unit Versions that reference this Graph Version. Explain why:');
            if (reason === null) return;
            try {
              await api('withdraw-graph-version', 'POST', { graphId: direction.graphId,
                version: Number(select.value), reason: reason.trim() });
              await loadGraph(directionId); await listUnits();
              status('Graph Version withdrawn. Referencing Unit Versions now show withdrawal notices.');
            } catch (error) { status(error.message); }
          }));
          $('#graph-state').after(controls);
        }
      }
    } catch (error) { $('#graph-state').textContent = error.message; }
  }

  function renderGraph() {
    canvas.set(state.graph.nodes, state.graph.edges);
    const nodes = $('#v4-node-list'); nodes.replaceChildren();
    state.graph.nodes.forEach((node) => nodes.append(button(node.title, () => canvas.focus(node.id), 'kn-list-button')));
    const edges = $('#v4-edge-list'); edges.replaceChildren();
    state.graph.edges.forEach((edge) => edges.append(button(`${edge.source} → ${edge.label} → ${edge.target}`,
      () => canvas.selectEdge(edge.id), 'kn-list-button')));
    $('#inspector-body').textContent = 'Select a concept or relationship to edit it.';
  }
  function inspectNode(id) {
    const node = state.graph.nodes.find((item) => item.id === id);
    if (!node) return;
    const host = $('#inspector-body'); host.replaceChildren();
    host.append(field('Concept title', node.title, (value) => { node.title = value; dirtyGraph(); }),
      field('Explanation', node.description, (value) => { node.description = value; dirtyGraph(); }, true),
      claimControls(node, dirtyGraph),
      button('Regenerate explanation', () => regenerateItem('node', node, host)),
      button('Apply to canvas', renderGraph), button('Remove concept', () => {
        state.graph.nodes = state.graph.nodes.filter((item) => item.id !== id);
        state.graph.edges = state.graph.edges.filter((edge) => edge.source !== id && edge.target !== id);
        dirtyGraph(); renderGraph();
      }));
  }
  function inspectEdge(id) {
    const edge = state.graph.edges.find((item) => item.id === id);
    if (!edge) return;
    const host = $('#inspector-body'); host.replaceChildren();
    host.append(field('Relationship', edge.label, (value) => { edge.label = value; dirtyGraph(); }),
      field('Why are these concepts connected?', edge.reason, (value) => { edge.reason = value; dirtyGraph(); }, true),
      claimControls(edge, dirtyGraph),
      button('Regenerate explanation', () => regenerateItem('edge', edge, host)),
      button('Apply to canvas', renderGraph), button('Remove relationship', () => {
        state.graph.edges = state.graph.edges.filter((item) => item.id !== id);
        dirtyGraph(); renderGraph();
      }));
  }
  $('#add-node').addEventListener('click', () => {
    if (!state.graph) return;
    const title = window.prompt('Concept title:'); if (!title) return;
    const id = uniqueSlug(title, state.graph.nodes);
    state.graph.nodes.push({ id, title: title.trim(), description: 'Explain this concept.', evidenceRefs: [],
      x: 80 + (state.graph.nodes.length % 4) * 220, y: 80 + Math.floor(state.graph.nodes.length / 4) * 140 });
    dirtyGraph(); renderGraph(); canvas.focus(id);
  });
  $('#add-edge').addEventListener('click', () => {
    if (!state.graph || state.graph.nodes.length < 2) { $('#graph-state').textContent = 'Add two concepts first.'; return; }
    const source = window.prompt('From concept ID:', state.graph.nodes[0].id);
    const target = window.prompt('To concept ID:', state.graph.nodes[1].id);
    if (!source || !target || source === target || !state.graph.nodes.some((node) => node.id === source) ||
      !state.graph.nodes.some((node) => node.id === target)) { $('#graph-state').textContent = 'Choose two distinct existing concept IDs.'; return; }
    const id = uniqueSlug(`${source}-${target}`, state.graph.edges);
    state.graph.edges.push({ id, source, target, label: 'relates to', reason: 'Explain this connection.',
      basis: 'teaching-association', evidenceRefs: [] });
    dirtyGraph(); renderGraph(); canvas.selectEdge(id);
  });
  $('#graph-zoom-in').addEventListener('click', () => canvas.zoom(1.2));
  $('#graph-zoom-out').addEventListener('click', () => canvas.zoom(1 / 1.2));
  async function saveGraph() {
    if (!state.graph || !state.graphDirty && state.graphRevision) return;
    await saveUnit();
    const result = await api('save-graph', 'POST', { graphId: state.graph.id,
      unitId: state.unit.id, directionId: state.currentDirection,
      expectedRevision: state.graphRevision, payload: state.graph });
    state.graphRevision = result.revision; state.graphDirty = false;
    $('#graph-state').textContent = `Saved Graph draft ${result.revision.slice(0, 8)}`;
  }
  $('#save-graph').addEventListener('click', async () => {
    try { await saveGraph(); } catch (error) { $('#graph-state').textContent = error.message; }
  });

  async function renderPublish() {
    if (!state.unit) return;
    const previousWithdrawChoice = $('#withdraw-version-choice');
    if (previousWithdrawChoice) previousWithdrawChoice.remove();
    try {
      const { versions } = await api('unit-versions', 'GET', undefined, { unit: state.unit.id });
      const active = versions.filter((item) => !item.withdrawn_reason);
      const select = make('select'); select.id = 'withdraw-version-choice';
      for (const item of active) {
        const option = make('option', '', `Unit Version ${item.version}`);
        option.value = item.version; select.append(option);
      }
      $('#withdraw-unit').before(select);
      $('#withdraw-unit').disabled = !active.length;
    } catch (error) { $('#publish-state').textContent = error.message; }
    $('#withdraw-unit').textContent = 'Withdraw selected Unit Version';
    const overview = $('#review-overview'); overview.replaceChildren();
    overview.append(make('h4', '', 'Unit review'), make('h5', '', state.unit.title || 'Untitled Unit'),
      make('p', '', state.unit.summary || 'No summary yet.'),
      make('p', '', `Core question: ${state.unit.guidingQuestion || 'Not set'}`));
    const unitDetails = make('details', 'v4-proposal-preview');
    unitDetails.append(make('summary', '', `${state.unit.sections.length} ${state.unit.sections.length === 1 ? 'section' : 'sections'} · ${state.unit.activities.length} ${state.unit.activities.length === 1 ? 'learning activity' : 'learning activities'}`));
    for (const section of state.unit.sections) {
      const item = make('article', 'v4-item');
      item.append(make('h5', '', section.title || 'Untitled section'),
        make('p', 'v4-prose', section.body || ''),
        make('p', 'sl-small', `${section.claimKind || 'general'} · ${section.evidenceRefs?.length || 0} evidence references`));
      unitDetails.append(item);
    }
    for (const activity of state.unit.activities) {
      const item = make('article', 'v4-item');
      item.append(make('h5', '', activity.prompt || 'Untitled activity'),
        make('p', '', activity.guidance || ''));
      unitDetails.append(item);
    }
    overview.append(unitDetails);
    const preflight = $('#preflight'); preflight.replaceChildren();
    const risks = [];
    if (!state.unit.title || !state.unit.summary || !state.unit.guidingQuestion) risks.push('Complete the Unit title, summary and core question.');
    if (!state.unit.sections.length) risks.push('Add at least one readable section.');
    if (!state.unit.confirmedPlanFingerprint) risks.push('Confirm Direction Planning.');
    if (state.dirty) risks.push('Save Unit changes before publishing.');
    if (state.graphDirty) risks.push('Save Graph changes before publishing.');
    if (state.unit.sources.length === 0) risks.push('No source is recorded. Check whether this Unit makes specific external claims.');
    const sourceIds = new Set(state.unit.sources.map((source) => source.id));
    for (const section of state.unit.sections) {
      const refs = section.evidenceRefs || [];
      if (section.claimKind && section.claimKind !== 'general' && !refs.length)
        risks.push(`Section “${section.title || section.id}” makes a specific claim without evidence.`);
      if (refs.some((ref) => !sourceIds.has(ref.sourceId) || !ref.location?.trim()))
        risks.push(`Section “${section.title || section.id}” has an invalid evidence reference.`);
    }
    const titles = state.unit.sections.map((section) => String(section.title || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(titles).size < titles.length) risks.push('Some sections have the same title; check for repeated content.');
    if (state.unit.sources.some((source) => source.origin === 'captured' && !source.reviewedAt))
      risks.push('Optional: review captured sources and mark them reviewed if you checked them.');
    for (const risk of risks) preflight.append(make('p', 'v4-risk', risk));
    if (!risks.length) preflight.append(make('p', 'v4-good', 'Unit structure and planning are ready for server checks.'));
    const host = $('#publish-refs'); host.replaceChildren();
    for (const direction of state.unit.directions) {
      const card = make('div', 'v4-item');
      card.append(make('h5', '', direction.title), make('p', 'sl-small', direction.question));
      try {
        const result = await api('graph-state', 'GET', undefined, { graph: direction.graphId });
        const select = make('select'); select.className = 'v4-version-choice'; select.dataset.direction = direction.id;
        const exclude = make('option', '', 'Keep this Direction in draft only');
        exclude.value = 'exclude'; select.append(exclude);
        const published = result.graph?.current_version
          ? (await api('graph-versions', 'GET', undefined, { graph: direction.graphId })).versions : [];
        for (const version of published) {
          const option = make('option', '', `Reuse published v${version.version}`);
          option.value = `version:${version.version}`; select.append(option);
        }
        if (result.draft) {
          if (result.draft.payload.importedFrom) preflight.append(make('p', 'v4-risk',
            `Review copied concepts in ${direction.title}; classify specific claims and add evidence where needed.`));
          for (const node of result.draft.payload.nodes || []) {
            if (node.claimKind && node.claimKind !== 'general' && !node.evidenceRefs?.length)
              preflight.append(make('p', 'v4-risk',
                `Concept “${node.title || node.id}” in ${direction.title} makes a specific claim without evidence.`));
          }
          const option = make('option', '', 'Publish current Graph draft as a new version');
          option.value = `draft:${result.draft.revision}`; select.append(option);
        }
        if (published.length) select.value = `version:${published[0].version}`;
        else if (result.draft) select.value = `draft:${result.draft.revision}`;
        if (select.options.length > 1) {
          card.append(select);
          const preview = make('details', 'v4-proposal-preview');
          preview.append(make('summary', '', 'Review selected Graph Version'));
          card.append(preview);
          const showGraph = (graph) => {
            preview.querySelectorAll(':scope > .v4-graph-review').forEach((item) => item.remove());
            const body = make('div', 'v4-graph-review');
            if (graph.importedFrom) body.append(make('p', 'sl-small',
              `Copied from Independent Graph ${graph.importedFrom.graphId} ${graph.importedFrom.version}`));
            const nodes = graph.nodes?.length || 0, edges = graph.edges?.length || 0;
            body.append(make('p', '', `${nodes} ${nodes === 1 ? 'concept' : 'concepts'} · ${edges} ${edges === 1 ? 'relationship' : 'relationships'}`));
            for (const node of graph.nodes || []) {
              body.append(make('p', '', `${node.title}: ${node.description || ''}`));
              if (node.reusedFrom) body.append(make('p', 'sl-small',
                `Copied from Graph ${node.reusedFrom.graphId} v${node.reusedFrom.version}, concept ${node.reusedFrom.nodeId}`));
            }
            for (const edge of graph.edges || []) body.append(make('p', 'sl-small',
              `${edge.source} → ${edge.label} → ${edge.target}: ${edge.reason || ''}`));
            preview.append(body);
          };
          const showSelected = async () => {
            const choice = select.value;
            if (choice === 'exclude') {
              preview.querySelectorAll(':scope > .v4-graph-review').forEach((item) => item.remove());
              preview.open = false;
              return;
            }
            try {
              if (choice.startsWith('draft:')) showGraph(result.draft.payload);
              else {
                const chosen = await api('graph-version', 'GET', undefined,
                  { graph: direction.graphId, version: choice.slice(8) });
                if (select.value === choice) showGraph(chosen.graphVersion.payload);
              }
            } catch (error) { preview.append(make('p', 'v4-risk', error.message)); }
          };
          select.addEventListener('change', showSelected);
          await showSelected();
        }
        else card.append(make('p', 'sl-small', 'This Direction stays in the private draft until its Graph is ready.'));
        if (!card.contains(select)) card.append(select);
      } catch (error) { card.append(make('p', 'sl-small', error.message)); }
      host.append(card);
    }
  }
  $('#publish-unit').addEventListener('click', async () => {
    try {
      if (state.dirty || state.graphDirty) throw new Error('Save Unit and Graph changes first.');
      const graphRefs = [];
      for (const direction of state.unit.directions) {
        const selector = [...document.querySelectorAll('.v4-version-choice')]
          .find((item) => item.dataset.direction === direction.id);
        if (!selector) throw new Error(`Save a Graph for ${direction.title} before publishing.`);
        const choice = selector.value;
        if (choice === 'exclude') continue;
        graphRefs.push({ directionId: direction.id, graphId: direction.graphId,
          ...(choice.startsWith('draft:') ? { draftRevision: choice.slice(6) } : { version: Number(choice.slice(8)) }) });
      }
      if (!graphRefs.length) throw new Error('Select at least one completed Direction to publish.');
      const result = await api('publish-unit', 'POST', { unitId: state.unit.id,
        expectedRevision: state.revision, graphRefs });
      $('#publish-state').replaceChildren(document.createTextNode(`Published Unit v${result.version}. `));
      const link = make('a', '', 'Open learner view');
      link.href = `/knowledge-map/teacher-unit.html?${new URLSearchParams({ unit: state.unit.id, version: result.version })}`;
      $('#publish-state').append(link);
      await listUnits();
    } catch (error) { $('#publish-state').textContent = error.message; }
  });
  $('#withdraw-unit').addEventListener('click', async () => {
    const selected = $('#withdraw-version-choice');
    if (!selected?.value) return;
    const reason = window.prompt(`Why is Unit Version ${selected.value} being withdrawn from learners?`);
    if (reason === null) return;
    try {
      await api('withdraw-unit-version', 'POST', { unitId: state.unit.id,
        version: Number(selected.value), reason: reason.trim() });
      await listUnits(); await renderPublish();
      $('#publish-state').textContent = `Unit Version ${selected.value} withdrawn. Its historical link shows the reason.`;
    } catch (error) { $('#publish-state').textContent = error.message; }
  });

  function showPlanProposal(proposal) {
    const host = $('#planning-proposal'); host.replaceChildren();
    host.append(make('h4', '', 'AI planning proposal'), make('p', '', `Proposed title: ${proposal.title}`),
      make('p', '', proposal.summary),
      make('p', 'sl-small', `Core question: ${proposal.guidingQuestion}`));
    if (proposal.source) host.append(make('p', 'sl-small',
      `Analyzed ${proposal.source.title} · ${proposal.source.revision || 'unversioned article'} · ${proposal.source.scope || 'scope unavailable'} · captured ${proposal.source.retrievedAt}`));
    else host.append(make('p', 'sl-small', 'Based on the teacher-provided topic; no external source was read.'));
    const metadata = make('label'); const useMetadata = make('input'); useMetadata.type = 'checkbox';
    useMetadata.checked = !state.unit.summary && !state.unit.guidingQuestion;
    metadata.append(useMetadata, document.createTextNode(' Use proposed Unit title, summary and question'));
    host.append(metadata);
    const selected = [];
    for (const direction of proposal.directions) {
      const card = make('label', 'v4-item'); const box = make('input'); box.type = 'checkbox'; box.checked = true;
      selected.push({ box, direction });
      card.append(box, document.createTextNode(` ${direction.title} — ${direction.question}`),
        make('p', 'sl-small', direction.scope)); host.append(card);
    }
    host.append(button('Add selected directions to draft', async () => {
      try {
      await api('verify-proposal', 'POST', { unitId: state.unit.id, proposalId: proposal.id });
      if (proposal.source && !state.unit.sources.some((source) => source.id === proposal.source.id))
        state.unit.sources.push(proposal.source);
      if (useMetadata.checked) {
        state.unit.title = proposal.title; state.unit.summary = proposal.summary;
        state.unit.guidingQuestion = proposal.guidingQuestion;
      }
      for (const { box, direction } of selected.filter((entry) => entry.box.checked))
        if (!state.unit.directions.some((item) => item.title === direction.title &&
          item.question === direction.question && item.scope === direction.scope))
          state.unit.directions.push({ ...direction, id: uniqueSlug(direction.title, state.unit.directions), graphId: uid() });
      changedPlan(); fillOverview(); renderSources(); renderDirections(); showStep('directions');
      await saveUnit();
      await api('accept-proposal', 'POST', { unitId: state.unit.id, proposalId: proposal.id });
      host.replaceChildren();
      status('AI suggestions added to the private draft. Edit, merge or remove directions, then confirm the plan.');
      } catch (error) { status(error.message); }
    }, 'sl-btn sl-btn-main'), dismissProposalButton(proposal, host));
  }
  function showGenerationProposal(proposal) {
    const host = $('#generation-proposal'); host.replaceChildren();
    host.append(make('p', '', `${proposal.sections.length} sections, ${proposal.activities.length} activities, and ${proposal.graphs.length} Direction Graphs proposed.`));
    const preview = make('details', 'v4-proposal-preview');
    preview.append(make('summary', '', 'Review proposed content and graph structure'));
    const sections = make('section'); sections.append(make('h4', '', 'Unit sections'));
    for (const section of proposal.sections) {
      const item = make('article', 'v4-item');
      item.append(make('h5', '', section.title), make('p', 'v4-prose', section.body),
        make('p', 'sl-small', `${section.kind} · ${section.claimKind} · ${section.evidenceRefs?.length || 0} evidence references`));
      sections.append(item);
    }
    const activities = make('section'); activities.append(make('h4', '', 'Learning activities'));
    for (const activity of proposal.activities) {
      const item = make('article', 'v4-item');
      item.append(make('h5', '', activity.prompt), make('p', '', activity.guidance || ''));
      activities.append(item);
    }
    const graphs = make('section'); graphs.append(make('h4', '', 'Direction Graphs'));
    for (const graph of proposal.graphs) {
      const item = make('article', 'v4-item');
      item.append(make('h5', '', graph.title),
        make('p', '', `Concepts: ${graph.nodes.map((node) => node.title).join(', ')}`),
        make('p', '', `Relationships: ${graph.edges.map((edge) => `${edge.source} ${edge.label} ${edge.target}`).join('; ') || 'none'}`));
      graphs.append(item);
    }
    preview.append(sections, activities, graphs); host.append(preview);
    const choices = {};
    for (const [key, label] of [['sections', 'Unit sections'], ['activities', 'Learning activities'],
      ['concepts', 'Graph concepts'], ['relationships', 'Graph relationships']]) {
      const wrap = make('label'); const box = make('input'); box.type = 'checkbox'; box.checked = true;
      choices[key] = box; wrap.append(box, document.createTextNode(` Accept ${label}`)); host.append(wrap);
    }
    host.append(button('Accept proposal into private drafts', async () => {
      try {
        if (!Object.values(choices).some((box) => box.checked)) throw new Error('Select a module to accept.');
        if (state.graphDirty) await saveGraph();
        await api('verify-proposal', 'POST', { unitId: state.unit.id, proposalId: proposal.id });
        if (!state.unit.confirmedPlanFingerprint ||
          proposal.graphs.some((graph) => !state.unit.directions.some((direction) =>
            direction.id === graph.directionId && direction.graphId === graph.id)))
          throw new Error('The Direction plan changed. Generate a fresh proposal.');
        const conflicts = [];
        let unitChanged = false;
        for (const section of choices.sections.checked ? proposal.sections : []) {
          if (state.unit.sections.some((item) => item.id === section.id)) conflicts.push(`section ${section.id}`);
          else { state.unit.sections.push(section); unitChanged = true; }
        }
        for (const activity of choices.activities.checked ? proposal.activities : []) {
          if (state.unit.activities.some((item) => item.id === activity.id)) conflicts.push(`activity ${activity.id}`);
          else { state.unit.activities.push(activity); unitChanged = true; }
        }
        if (unitChanged) dirtyUnit();
        for (const graph of choices.concepts.checked || choices.relationships.checked ? proposal.graphs : []) {
          const existing = await api('graph-state', 'GET', undefined, { graph: graph.id });
          const { graph: merged, conflicts: graphConflicts, changed } = window.SkillLoopProposalMerge.merge(
            existing.draft?.payload, graph, { concepts: choices.concepts.checked,
              relationships: choices.relationships.checked });
          conflicts.push(...graphConflicts);
          if (!changed) continue;
          const saved = await api('save-graph', 'POST', { graphId: graph.id, unitId: state.unit.id,
            directionId: graph.directionId, expectedRevision: existing.draft?.revision || null, payload: merged });
          if (state.graph?.id === graph.id) {
            state.graph = merged; state.graphRevision = saved.revision; state.graphDirty = false;
            renderGraph();
          }
        }
        if (state.dirty) await saveUnit();
        await api('accept-proposal', 'POST', { unitId: state.unit.id, proposalId: proposal.id });
        renderSections(); renderActivities(); host.replaceChildren();
        $('#generation-state').textContent = conflicts.length
          ? `New content accepted. Preserved existing edits in: ${conflicts.join(', ')}.`
          : 'Proposal accepted into drafts. Review and edit before publishing.';
      } catch (error) { $('#generation-state').textContent = error.message; }
    }, 'sl-btn sl-btn-main'), dismissProposalButton(proposal, host));
  }
  $('#analysis-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await saveUnit();
      const form = event.currentTarget;
      $('#analysis-state').textContent = 'Capturing source and preparing a planning proposal…';
      const result = await api('analyze', 'POST', { unitId: state.unit.id,
        requestId: uid(), url: form.elements.url.value.trim(), topic: form.elements.topic.value.trim() });
      if (result.proposal) { showPlanProposal(result.proposal);
        $('#analysis-state').textContent = 'Proposal ready. No draft content changed yet.'; }
      else { $('#analysis-state').textContent = 'AI task queued. You can leave and return to this Unit.';
        await refreshJobsAndProposals(state.unit.id); }
    } catch (error) { $('#analysis-state').textContent = error.message; }
    finally { submit.disabled = false; }
  });
  $('#generate-content').addEventListener('click', async () => {
    const submit = $('#generate-content'); submit.disabled = true;
    try {
      await saveUnit();
      const directionIds = [...document.querySelectorAll('#generation-options input:checked')].map((box) => box.value);
      if (!directionIds.length || directionIds.length > 3)
        throw new Error('Choose 1–3 Directions for this AI job. Repeat for the remaining Directions.');
      $('#generation-state').textContent = 'Generating Unit and Graph proposals…';
      const result = await api('generate', 'POST', { unitId: state.unit.id,
        requestId: uid(), expectedRevision: state.revision, directionIds });
      if (result.proposal) { showGenerationProposal(result.proposal);
        $('#generation-state').textContent = 'Proposal ready for whole-content review.'; }
      else { $('#generation-state').textContent = 'AI task queued. You can leave and return to this Unit.';
        await refreshJobsAndProposals(state.unit.id); }
    } catch (error) { $('#generation-state').textContent = error.message; }
    finally { submit.disabled = false; }
  });

  try {
    const account = await K.api('session');
    if (!account.signedIn || account.role !== 'teacher') {
      status('Sign in with a teacher account to open Teaching Studio.');
      const link = make('a', 'sl-btn', 'Open account sign-in'); link.href = '/knowledge-map/account.html';
      $('#studio-status').after(link); return;
    }
    $('#studio-root').hidden = false;
    status(`Signed in as ${account.email}.`);
    await listUnits();
    const unitId = new URLSearchParams(location.search).get('unit');
    if (unitId) await loadUnit(unitId);
  } catch (error) { status(error.message); }
})();
