(async function () {
  const K = window.KnowledgeNetwork;
  const $ = K.$;
  let signedIn = false, graphId = null, draft = null, revision = null, dirty = false, selectedId = null;
  let saving = false, publishing = false, transitioning = false, editSequence = 0, loadSequence = 0, backendAvailable = false;
  const pendingForms = new Set();
  let graphList = [];
  let taskView = 'concepts', contextConceptId = null;
  const editorForms = { relationships: '#teacher-relation', questions: '#teacher-question', cases: '#teacher-case' };
  function updateTaskContext() {
    for (const view of Object.keys(editorForms)) {
      const active = taskView === view && contextConceptId;
      const label = $(`#${view}-context`);
      label.hidden = !active;
      label.textContent = active ? `Showing content related to ${draft?.topics.find((item) => item.id === contextConceptId)?.title || contextConceptId}` : '';
      document.querySelector(`[data-clear-context="${view}"]`).hidden = !active;
      document.querySelector(`[data-return-concept="${view}"]`).hidden = !active;
    }
  }
  function showTask(view, conceptId = null) {
    if (!window.SkillLoopStudioUI.views.includes(view)) return;
    taskView = view;
    contextConceptId = conceptId;
    if (conceptId && editorForms[view]) {
      const form = $(editorForms[view]);
      const items = view === 'relationships' ? draft?.relations : view === 'questions' ? draft?.questions : draft?.events;
      const item = items?.find((entry) => entry.id === form.dataset.editId);
      if (!form.hidden && (!item || !window.SkillLoopStudioUI.matchesConcept(view, item, conceptId))) {
        if (pendingForms.has(form)) msg('An unapplied form from another concept remains open. Apply or cancel it before using this filter.');
        else hideEditor(view);
      }
    }
    for (const panel of document.querySelectorAll('[data-studio-view]')) panel.hidden = panel.dataset.studioView !== view;
    for (const button of document.querySelectorAll('[data-studio-task]')) {
      const active = button.dataset.studioTask === view;
      button.setAttribute('aria-current', active ? 'page' : 'false');
    }
    $('#teacher-task-select').value = view;
    updateTaskContext();
    if (draft) { renderRelations(); renderQuestions(); renderCases(); }
  }
  for (const button of document.querySelectorAll('[data-studio-task]'))
    button.addEventListener('click', () => showTask(button.dataset.studioTask));
  $('#teacher-task-select').addEventListener('change', (event) => showTask(event.target.value));
  for (const view of Object.keys(editorForms)) {
    document.querySelector(`[data-new-editor="${view}"]`).addEventListener('click', () => openNewEditor(view));
    document.querySelector(`[data-clear-context="${view}"]`).addEventListener('click', () => showTask(view));
    document.querySelector(`[data-return-concept="${view}"]`).addEventListener('click', () => showTask('concepts'));
  }
  function revealEditor(view) {
    const form = $(editorForms[view]);
    form.hidden = false;
    form.closest('.kn-detail-editor').hidden = false;
    form.scrollIntoView({ block: 'nearest' });
  }
  function hideEditor(view) {
    const form = $(editorForms[view]);
    form.hidden = true;
    form.closest('.kn-detail-editor').hidden = true;
  }
  function openNewEditor(view) {
    if (!draft) return;
    const form = $(editorForms[view]);
    if (pendingForms.has(form) && !window.confirm('Discard the open form changes?')) return;
    if (pendingForms.has(form)) formDiscarded(form);
    form.reset(); delete form.dataset.editId;
    form.querySelector('button[type=submit]').textContent = `Add ${view === 'relationships' ? 'relationship' : view === 'questions' ? 'question' : 'case'}`;
    if (view === 'relationships') {
      if (contextConceptId) form.elements.source.value = contextConceptId;
    } else if (view === 'questions') {
      if (contextConceptId) form.elements.topicId.value = contextConceptId;
    } else {
      fillCaseArrays([{ kind: 'source-supported', text: '', sourceSection: '' },
        { kind: 'teaching-inference', text: '' }], [{ topicId: contextConceptId || draft.topics[0]?.id || '', kind: 'application', reason: '' }]);
    }
    $(`#${form.id}-cancel`).hidden = false;
    revealEditor(view);
  }
  const canvas = new K.Canvas($('#teacher-canvas'), { editable: true, onSelect: selectTopic,
    onSelectEdge: selectRelation,
    onMove: (topic) => {
      const stored = draft?.topics.find((item) => item.id === topic.id);
      if (stored) { stored.position = { x: topic.x, y: topic.y }; changed(); }
    } });
  const msg = (value) => { $('#teacher-editor-status').textContent = value; };
  const formValue = (form, name) => form.elements[name].value.trim();
  function changed() {
    editSequence += 1; dirty = true; $('#teacher-reviewed').checked = false;
    $('#teacher-frame').hidden = true;
    sessionStorage.removeItem('skillloop.knowledge.preview');
    controls(); msg('Unsaved changes. Save before publishing.');
  }
  function staged(form) {
    pendingForms.add(form);
    const cancel = $(`#${form.id}-cancel`);
    if (cancel) cancel.hidden = false;
    $('#teacher-reviewed').checked = false;
    $('#teacher-frame').hidden = true;
    sessionStorage.removeItem('skillloop.knowledge.preview');
    controls(); msg('Form changes are not applied yet. Save the form or Cancel.');
  }
  function formDiscarded(form) {
    pendingForms.delete(form);
    controls(); msg(dirty ? 'Unsaved draft changes. Save before publishing.' : 'Form changes discarded; draft is unchanged.');
  }
  function controls() {
    $('#teacher-sign-in').hidden = signedIn || !backendAvailable;
    $('#teacher-workspace').hidden = !signedIn || transitioning;
    $('#teacher-save').disabled = !draft || saving || publishing || transitioning;
    $('#teacher-reviewed').disabled = !draft || !revision || dirty || saving || publishing || transitioning || !!pendingForms.size;
    $('#teacher-publish').disabled = !draft || !revision || dirty || saving || publishing || transitioning || !!pendingForms.size || !$('#teacher-reviewed').checked;
    $('#teacher-graph-state').textContent = graphId ? `${graphList.find((item) => item.id === graphId)?.current_version ? 'Published' : 'Draft'}${dirty ? ' · Unsaved changes' : pendingForms.size ? ' · Open form changes' : revision ? ` · Draft ${revision}` : ''}` : 'No graph selected';
    $('#teacher-review-state').textContent = !draft ? 'Choose or create a graph first.' : pendingForms.size
      ? 'An editor has unapplied changes. Apply or cancel its form before review and publish.'
      : dirty ? 'Unsaved draft changes. Save the draft before review and publish.'
        : revision ? `Saved private draft ${revision}. Preview each page, then confirm the review to publish.`
          : 'Save this private draft before review and publish.';
  }
  function renderShareLink() {
    const share = $('#teacher-share');
    const learningView = $('#teacher-learning-view');
    learningView.hidden = true;
    if (!graphId) {
      share.textContent = 'Create a graph to get a share link.';
      return;
    }
    const graph = graphList.find((item) => item.id === graphId);
    if (!graph?.current_version) {
      share.textContent = 'Private draft. Publish a saved version to get a public share link.';
      return;
    }
    const url = new URL(K.href('graph', { graph: graphId }), location.origin);
    learningView.href = url.href;
    learningView.hidden = false;
    share.replaceChildren(document.createTextNode('Published share link: '));
    const anchor = K.make('a', '', url.href); anchor.href = url.href; share.append(anchor);
    const learning = K.make('a', 'sl-btn', 'Open published Learning View');
    learning.href = url.href;
    share.append(learning);
  }
  async function withWorkspaceTransition(message, action) {
    if (transitioning) return false;
    const previousStatus = $('#teacher-status').textContent;
    transitioning = true; $('#teacher-status').textContent = message; controls();
    try { await action(); return true; }
    finally { transitioning = false; controls(); $('#teacher-status').textContent = previousStatus; }
  }
  function optionList(selector) {
    const select = $(selector);
    const old = select.value;
    select.replaceChildren();
    for (const topic of draft.topics) {
      const option = K.make('option', '', topic.title);
      option.value = topic.id;
      select.append(option);
    }
    if (draft.topics.some((topic) => topic.id === old)) select.value = old;
  }
  function renderGraph() {
    if (!draft) return;
    canvas.set(draft.topics.filter((topic) => !topic.archived), draft.relations);
    const list = $('#teacher-topic-list');
    const query = $('#teacher-search').value.trim().toLowerCase();
    canvas.highlight(query);
    list.replaceChildren();
    for (const topic of draft.topics) {
      if (query && !`${topic.title} ${topic.description}`.toLowerCase().includes(query)) continue;
      const button = K.make('button', 'kn-list-button', `${topic.title}${topic.archived ? ' (archived)' : ''}`);
      button.type = 'button';
      button.addEventListener('click', () => { if (topic.archived) selectTopic(topic.id); else canvas.focus(topic.id); });
      list.append(button);
    }
    for (const selector of ['#teacher-relation [name=source]', '#teacher-relation [name=target]',
      '#teacher-question [name=topicId]']) optionList(selector);
    renderRelations(); renderQuestions(); renderCases(); renderRelated();
  }
  function renderRelated() {
    const panel = $('#teacher-related');
    panel.hidden = !selectedId || !draft;
    const box = $('#teacher-related-links'); box.replaceChildren();
    if (panel.hidden) return;
    const counts = window.SkillLoopStudioUI.relatedCounts(draft, selectedId);
    for (const [view, label] of [['relationships', 'Relationships'], ['questions', 'Questions'], ['cases', 'Cases']]) {
      const button = K.make('button', 'kn-list-button', `${label} (${counts[view]})`);
      button.type = 'button';
      button.addEventListener('click', () => showTask(view, selectedId));
      box.append(button);
    }
  }
  function selectTopic(id) {
    selectedId = id;
    const topic = draft?.topics.find((item) => item.id === id);
    const form = $('#teacher-topic');
    form.hidden = !topic;
    $('#teacher-topic-empty').hidden = !!topic;
    if (!topic) { renderRelated(); return; }
    for (const name of ['id', 'title', 'description']) form.elements[name].value = topic[name];
    for (const name of ['goal', 'explanation', 'example', 'nextAction']) form.elements[name].value = topic.lesson[name];
    $('#teacher-topic-preserved').textContent = `Preserved path fields · role: ${topic.pathRole}; order: ${topic.order}; icon: ${topic.icon}. These fields are kept unchanged when other fields are saved.`;
    form.elements.archived.checked = !!topic.archived;
    renderRelated();
  }
  function selectRelation(relation) {
    const form = $('#teacher-relation');
    if (pendingForms.has(form) && !window.confirm('Discard the open relationship form?')) return;
    if (pendingForms.has(form)) formDiscarded(form);
    form.dataset.editId = relation.id;
    form.elements.source.value = relation.source; form.elements.target.value = relation.target;
    form.elements.type.value = relation.type; form.elements.reason.value = relation.reason;
    form.querySelector('button[type=submit]').textContent = 'Save relationship';
    $('#teacher-relation-cancel').hidden = false;
    showTask('relationships', taskView === 'relationships' ? contextConceptId : null);
    revealEditor('relationships');
  }
  function renderRelations() {
    const box = $('#teacher-relations'); box.replaceChildren();
    for (const relation of draft.relations) {
      if (taskView === 'relationships' && !window.SkillLoopStudioUI.matchesConcept('relationships', relation, contextConceptId)) continue;
      const row = K.make('p', '', `${relation.source} → ${relation.target} (${relation.type}): ${relation.reason} `);
      const edit = K.make('button', 'sl-text-button', 'Edit'); edit.type = 'button';
      edit.addEventListener('click', () => selectRelation(relation));
      const button = K.make('button', 'sl-text-button', 'Remove'); button.type = 'button';
      button.addEventListener('click', () => {
        const attached = (draft.activities || []).filter((item) => item.relationId === relation.id);
        if (attached.length && !window.confirm(`Removing this relationship also removes ${attached.length} linked learning activities. Continue?`)) return;
        draft.relations = draft.relations.filter((item) => item.id !== relation.id);
        draft.activities = (draft.activities || []).filter((item) => item.relationId !== relation.id);
        changed(); renderGraph(); });
      row.append(edit, button); box.append(row);
    }
    renderRelated();
  }
  function renderQuestions() {
    const box = $('#teacher-questions'); box.replaceChildren();
    for (const question of draft.questions || []) {
      if (taskView === 'questions' && !window.SkillLoopStudioUI.matchesConcept('questions', question, contextConceptId)) continue;
      const row = K.make('p', '', `${question.archived ? '[Archived] ' : ''}${question.topicId}: ${question.prompt} `);
      const edit = K.make('button', 'sl-text-button', 'Edit'); edit.type = 'button';
      edit.addEventListener('click', () => {
        const form = $('#teacher-question');
        if (pendingForms.has(form) && !window.confirm('Discard the open question form?')) return;
        if (pendingForms.has(form)) formDiscarded(form);
        form.dataset.editId = question.id;
        form.elements.topicId.value = question.topicId; form.elements.prompt.value = question.prompt;
        form.elements.options.value = question.options.join('\n'); form.elements.answer.value = question.answerIndex + 1;
        form.elements.feedback.value = question.feedback;
        form.querySelector('button[type=submit]').textContent = 'Save question';
        $('#teacher-question-cancel').hidden = false;
        revealEditor('questions');
      });
      const archive = K.make('button', 'sl-text-button', question.archived ? 'Restore' : 'Archive'); archive.type = 'button';
      archive.addEventListener('click', () => { question.archived = !question.archived; changed(); renderQuestions(); });
      row.append(edit, archive); box.append(row);
    }
    renderRelated();
  }
  function renderCases() {
    const box = $('#teacher-cases'); box.replaceChildren();
    for (const item of draft.events || []) {
      if (taskView === 'cases' && !window.SkillLoopStudioUI.matchesConcept('cases', item, contextConceptId)) continue;
      const row = K.make('p', '', `${item.archived ? '[Archived] ' : ''}${item.title} · ${item.date} `);
      const edit = K.make('button', 'sl-text-button', 'Edit'); edit.type = 'button';
      edit.addEventListener('click', () => {
        const form = $('#teacher-case');
        if (pendingForms.has(form) && !window.confirm('Discard the open case form?')) return;
        if (pendingForms.has(form)) formDiscarded(form);
        form.dataset.editId = item.id;
        form.elements.title.value = item.title; form.elements.date.value = item.date;
        form.elements.summary.value = item.summary; form.elements.sourceTitle.value = item.source.title;
        form.elements.sourceUrl.value = item.source.url; form.elements.sourceDate.value = item.source.publishedDate;
        fillCaseArrays(item.claims, item.links);
        $('#teacher-case-cancel').hidden = false;
        form.querySelector('button[type=submit]').textContent = 'Save case'; revealEditor('cases');
      });
      const archive = K.make('button', 'sl-text-button', item.archived ? 'Restore' : 'Archive'); archive.type = 'button';
      archive.addEventListener('click', () => { item.archived = !item.archived; changed(); renderCases(); });
      row.append(edit, archive); box.append(row);
    }
    renderRelated();
  }
  function caseFormChanged() { staged($('#teacher-case')); }
  function caseOption(select, value, label) {
    const option = K.make('option', '', label); option.value = value; select.append(option);
  }
  function addClaimRow(claim = { kind: 'source-supported', text: '', sourceSection: '' }) {
    const host = $('#teacher-case-claims');
    if (host.children.length >= 10) { msg('A case can have at most 10 claims.'); return; }
    const row = K.make('div', 'kn-case-row'); row.original = structuredClone(claim);
    const kind = K.make('select'); kind.name = 'kind';
    caseOption(kind, 'source-supported', 'Source-supported fact');
    caseOption(kind, 'teaching-inference', 'Teaching interpretation'); kind.value = claim.kind;
    const kindLabel = K.make('label', '', 'Claim type'); kindLabel.append(kind);
    const content = K.make('textarea'); content.name = 'text'; content.required = true; content.minLength = 8;
    content.maxLength = 500; content.value = claim.text || '';
    const contentLabel = K.make('label', '', 'Claim'); contentLabel.append(content);
    const section = K.make('input'); section.name = 'sourceSection'; section.maxLength = 100;
    section.value = claim.sourceSection || '';
    const sectionLabel = K.make('label', '', 'Source section'); sectionLabel.append(section);
    const sync = () => { sectionLabel.hidden = kind.value !== 'source-supported'; section.required = kind.value === 'source-supported'; };
    kind.addEventListener('change', sync); sync();
    const remove = K.make('button', 'sl-text-button', 'Remove claim'); remove.type = 'button';
    remove.addEventListener('click', () => { if (host.children.length <= 1) { msg('A case needs at least one claim.'); return; } row.remove(); caseFormChanged(); });
    row.append(kindLabel, contentLabel, sectionLabel, remove); host.append(row);
  }
  function addLinkRow(link = { topicId: draft?.topics[0]?.id || '', kind: 'application', reason: '' }) {
    const host = $('#teacher-case-links');
    if (host.children.length >= 10) { msg('A case can have at most 10 concept links.'); return; }
    const row = K.make('div', 'kn-case-row'); row.original = structuredClone(link);
    const topic = K.make('select'); topic.name = 'topicId';
    for (const item of draft.topics) caseOption(topic, item.id, item.title);
    topic.value = link.topicId;
    const topicLabel = K.make('label', '', 'Concept'); topicLabel.append(topic);
    const kind = K.make('select'); kind.name = 'kind';
    for (const name of ['application', 'context', 'introduced']) caseOption(kind, name, name);
    kind.value = link.kind;
    const kindLabel = K.make('label', '', 'Connection kind'); kindLabel.append(kind);
    const reason = K.make('input'); reason.name = 'reason'; reason.required = true;
    reason.minLength = 12; reason.maxLength = 280; reason.value = link.reason || '';
    const reasonLabel = K.make('label', '', 'Connection reason'); reasonLabel.append(reason);
    const remove = K.make('button', 'sl-text-button', 'Remove concept link'); remove.type = 'button';
    remove.addEventListener('click', () => { if (host.children.length <= 1) { msg('A case needs at least one concept link.'); return; } row.remove(); caseFormChanged(); });
    row.append(topicLabel, kindLabel, reasonLabel, remove); host.append(row);
  }
  function fillCaseArrays(claims, links) {
    $('#teacher-case-claims').replaceChildren(); $('#teacher-case-links').replaceChildren();
    for (const claim of claims) addClaimRow(claim);
    for (const link of links) addLinkRow(link);
  }
  $('#teacher-add-claim').addEventListener('click', () => { addClaimRow(); caseFormChanged(); });
  $('#teacher-add-link').addEventListener('click', () => { addLinkRow(); caseFormChanged(); });
  $('#teacher-case-cancel').addEventListener('click', () => {
    const form = $('#teacher-case'); formDiscarded(form); form.reset(); delete form.dataset.editId;
    fillCaseArrays([{ kind: 'source-supported', text: '', sourceSection: '' },
      { kind: 'teaching-inference', text: '' }], [{ topicId: draft.topics[0]?.id || '', kind: 'application', reason: '' }]);
    form.querySelector('button[type=submit]').textContent = 'Add case';
    $('#teacher-case-cancel').hidden = true;
    hideEditor('cases');
  });
  async function graphs() {
    graphList = (await K.api('my-graphs')).graphs || [];
    const select = $('#teacher-graphs'); select.replaceChildren();
    const library = $('#teacher-graph-list'); library.replaceChildren();
    for (const graph of graphList) {
      const option = K.make('option', '', `${graph.title}${graph.current_version ? ` · ${graph.current_version}` : ' · draft'}`);
      option.value = graph.id; select.append(option);
      const button = K.make('button', 'kn-list-button', `${graph.title} · ${graph.current_version ? 'Published ' + graph.current_version : 'Draft'}`);
      button.type = 'button';
      button.dataset.graphId = graph.id;
      button.addEventListener('click', () => { select.value = graph.id; select.dispatchEvent(new Event('change')); });
      library.append(button);
    }
    if (!graphList.length) { graphId = null; draft = null; revision = null;
      renderShareLink(); showTask('library'); msg('Create your first graph to begin.'); controls(); return; }
    if (!graphList.some((item) => item.id === graphId)) graphId = graphList[0].id;
    select.value = graphId;
    await loadDraft();
  }
  async function loadDraft() {
    if (!graphId) return;
    const requestedGraph = graphId, requestedLoad = ++loadSequence;
    const response = await K.api('draft', 'GET', undefined, { graph: requestedGraph });
    if (requestedGraph !== graphId || requestedLoad !== loadSequence) return;
    revision = response.draft?.revision || null;
    if (response.draft?.payload) draft = response.draft.payload;
    else if (graphId === K.sampleId) draft = structuredClone(window.SkillLoopGraph);
    else throw new Error('This graph has no editable draft.');
    draft.questions ||= []; draft.events ||= []; draft.activities ||= [];
    for (const selector of ['#teacher-relation', '#teacher-question', '#teacher-case']) {
      const form = $(selector); form.reset(); delete form.dataset.editId;
      form.querySelector('button[type=submit]').textContent = selector === '#teacher-relation' ? 'Add relationship' : selector === '#teacher-question' ? 'Add question' : 'Add case';
    }
    for (const view of Object.keys(editorForms)) hideEditor(view);
    $('#teacher-relation-cancel').hidden = true;
    $('#teacher-question-cancel').hidden = true;
    selectedId = null;
    dirty = false; pendingForms.clear(); editSequence += 1; $('#teacher-reviewed').checked = false;
    $('#teacher-frame').hidden = true;
    sessionStorage.removeItem('skillloop.knowledge.preview');
    const form = $('#teacher-meta');
    form.elements.title.value = draft.publication.title;
    form.elements.version.value = draft.publication.version;
    form.elements.date.value = draft.publication.publishedAt;
    renderGraph(); selectTopic(null); controls();
    fillCaseArrays([{ kind: 'source-supported', text: '', sourceSection: '' },
      { kind: 'teaching-inference', text: '' }], [{ topicId: draft.topics[0]?.id || '', kind: 'application', reason: '' }]);
    $('#teacher-case-cancel').hidden = true;
    renderShareLink(); showTask('concepts');
    msg(revision ? `Loaded private draft ${revision}.` : 'Sample content loaded. Save a draft before publishing.');
  }
  $('#teacher-sign-in').addEventListener('click', () => window.KnowledgeAccount.open());
  window.KnowledgeBeforeSignOut = protectDraft;
  document.addEventListener('knowledge-auth-expired', () => {
    signedIn = false; graphId = null; draft = null; revision = null;
    sessionStorage.removeItem('skillloop.knowledge.preview');
    controls();
    $('#teacher-status').textContent = 'Your session expired. Sign in again to open Teaching Studio.';
  });
  $('#teacher-create').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!await protectDraft()) return;
    const form = event.currentTarget;
    const oldGraph = graphId, oldRevision = revision;
    let createdId = null;
    try { await withWorkspaceTransition('Creating graph…', async () => {
      const result = await K.api('create-graph', 'POST', { title: formValue(form, 'title') });
      createdId = result.id;
      graphId = result.id; form.reset(); await graphs();
    }); } catch (error) {
      graphId = oldGraph; revision = oldRevision;
      $('#teacher-graphs').value = oldGraph || '';
      msg(createdId ? `Graph created, but could not be loaded: ${error.message}. Reload to recover it.` : error.message);
    }
  });
  $('#teacher-create-sample').addEventListener('click', async () => {
    if (!await protectDraft()) return;
    const oldGraph = graphId, oldRevision = revision;
    let createdId = null;
    try { await withWorkspaceTransition('Creating sample graph…', async () => {
      const result = await K.api('create-graph', 'POST', { title: 'Software development sample' });
      createdId = result.id;
      const payload = structuredClone(window.SkillLoopGraph);
      payload.publication.id = result.id;
      payload.publication.publishedAt = new Date().toISOString().slice(0, 10);
      payload.publication.version = `${payload.publication.publishedAt}.1`;
      await K.api('draft', 'POST', { graphId: result.id, payload, expectedRevision: result.revision });
      graphId = result.id; await graphs();
    }); } catch (error) {
      graphId = oldGraph; revision = oldRevision;
      $('#teacher-graphs').value = oldGraph || '';
      msg(createdId ? `Sample graph created, but setup could not finish: ${error.message}. Reload to recover it.` : error.message);
    }
  });
  $('#teacher-graphs').addEventListener('change', async (event) => {
    const oldGraph = graphId, oldRevision = revision, nextGraph = event.target.value;
    event.target.value = oldGraph || '';
    if (!await protectDraft()) return;
    try { await withWorkspaceTransition('Loading selected graph…', async () => {
      graphId = nextGraph;
      await loadDraft();
      event.target.value = nextGraph;
    }); } catch (error) { graphId = oldGraph; revision = oldRevision;
      event.target.value = oldGraph || ''; controls(); msg(error.message); }
  });
  $('#teacher-search').addEventListener('input', renderGraph);
  $('#teacher-zoom-in').addEventListener('click', () => canvas.zoom(1.2));
  $('#teacher-zoom-out').addEventListener('click', () => canvas.zoom(1 / 1.2));
  $('#teacher-add-topic').addEventListener('click', () => {
    if (!draft) return;
    const id = `concept-${crypto.randomUUID()}`;
    const topic = { id, title: 'New concept', icon: 'circle', description: 'Describe this concept for learners.',
      pathRole: 'extension', order: draft.topics.length + 1, position: { x: 80 + draft.topics.length % 5 * 210,
        y: 80 + Math.floor(draft.topics.length / 5) * 130 },
      lesson: { goal: 'Describe what learners should understand after this page.',
        explanation: 'Explain the idea in a clear paragraph with enough context for learners.',
        example: 'Provide a concrete example of this concept in a realistic situation.',
        nextAction: 'Suggest a small action to apply this idea after reading.' } };
    draft.topics.push(topic); changed(); renderGraph(); canvas.focus(id); selectTopic(id);
  });
  $('#teacher-meta').addEventListener('input', (event) => {
    if (!draft) return;
    const form = event.currentTarget;
    draft.publication.title = formValue(form, 'title');
    draft.publication.version = formValue(form, 'version');
    draft.publication.publishedAt = form.elements.date.value;
    changed();
  });
  $('#teacher-topic').addEventListener('input', (event) => {
    if (!draft || !selectedId) return;
    const topic = draft.topics.find((item) => item.id === selectedId);
    const form = event.currentTarget;
    topic.title = formValue(form, 'title'); topic.description = formValue(form, 'description');
    for (const name of ['goal', 'explanation', 'example', 'nextAction']) topic.lesson[name] = formValue(form, name);
    topic.archived = form.elements.archived.checked;
    changed();
    if (event.target.name === 'title' || event.target.name === 'archived') renderGraph();
  });
  $('#teacher-relation').addEventListener('submit', (event) => {
    event.preventDefault(); if (!draft) return;
    const form = event.currentTarget;
    const source = formValue(form, 'source'), target = formValue(form, 'target');
    if (source === target) { msg('Choose different concepts.'); return; }
    const existing = draft.relations.find((item) => item.id === form.dataset.editId);
    if (existing && (existing.source !== source || existing.target !== target)) {
      const attached = (draft.activities || []).filter((item) => item.relationId === existing.id);
      if (attached.length && !window.confirm(`This relationship has ${attached.length} learning activities. Review their topic links after changing its endpoints. Continue?`)) return;
    }
    if (draft.relations.some((item) => item !== existing && item.source === source && item.target === target)) {
      msg('This directed relationship already exists.'); return;
    }
    const next = { ...existing, id: existing?.id || `relation-${crypto.randomUUID()}`, source, target,
      type: formValue(form, 'type'), reason: formValue(form, 'reason') };
    if (existing) Object.assign(existing, next); else draft.relations.push(next);
    pendingForms.delete(form); changed(); renderGraph(); form.reset(); delete form.dataset.editId;
    form.querySelector('button[type=submit]').textContent = 'Add relationship';
    $('#teacher-relation-cancel').hidden = true;
    hideEditor('relationships');
  });
  $('#teacher-relation-cancel').addEventListener('click', () => {
    const form = $('#teacher-relation');
    formDiscarded(form); form.reset(); delete form.dataset.editId;
    form.querySelector('button[type=submit]').textContent = 'Add relationship';
    $('#teacher-relation-cancel').hidden = true;
    hideEditor('relationships');
  });
  $('#teacher-question').addEventListener('submit', (event) => {
    event.preventDefault(); if (!draft) return;
    const form = event.currentTarget;
    const options = formValue(form, 'options').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const answerIndex = Number(form.elements.answer.value) - 1;
    if (options.length < 2 || options.length > 4 || answerIndex < 0 || answerIndex >= options.length) {
      msg('Use 2–4 options and a matching answer number.'); return;
    }
    const existing = draft.questions.find((item) => item.id === form.dataset.editId);
    const next = { ...existing, id: existing?.id || `question-${crypto.randomUUID()}`,
      topicId: formValue(form, 'topicId'), prompt: formValue(form, 'prompt'), options, answerIndex,
      feedback: formValue(form, 'feedback') };
    if (existing) Object.assign(existing, next); else draft.questions.push(next);
    pendingForms.delete(form); changed(); renderQuestions(); form.reset(); delete form.dataset.editId;
    form.querySelector('button[type=submit]').textContent = 'Add question';
    $('#teacher-question-cancel').hidden = true;
    hideEditor('questions');
  });
  $('#teacher-question-cancel').addEventListener('click', () => {
    const form = $('#teacher-question');
    formDiscarded(form); form.reset(); delete form.dataset.editId;
    form.querySelector('button[type=submit]').textContent = 'Add question';
    $('#teacher-question-cancel').hidden = true;
    hideEditor('questions');
  });
  $('#teacher-case').addEventListener('submit', (event) => {
    event.preventDefault(); if (!draft) return;
    const form = event.currentTarget;
    const today = new Date().toISOString().slice(0, 10);
    const existing = draft.events.find((item) => item.id === form.dataset.editId);
    const claims = [...$('#teacher-case-claims').children].map((row) => ({ ...row.original,
      kind: row.querySelector('[name=kind]').value, text: row.querySelector('[name=text]').value.trim(),
      ...(row.querySelector('[name=kind]').value === 'source-supported'
        ? { sourceSection: row.querySelector('[name=sourceSection]').value.trim() } : {}) }));
    const links = [...$('#teacher-case-links').children].map((row) => ({ ...row.original,
      topicId: row.querySelector('[name=topicId]').value, kind: row.querySelector('[name=kind]').value,
      reason: row.querySelector('[name=reason]').value.trim() }));
    const next = window.SkillLoopCaseEditor.updateCase(existing, {
      claims, links, title: formValue(form, 'title'), date: form.elements.date.value,
      summary: formValue(form, 'summary'), sourceTitle: formValue(form, 'sourceTitle'),
      sourceUrl: formValue(form, 'sourceUrl'), sourceDate: form.elements.sourceDate.value,
    }, draft.topics, `case-${crypto.randomUUID()}`, today);
    if (existing) Object.assign(existing, next); else draft.events.push(next);
    pendingForms.delete(form); changed(); renderCases(); form.reset(); delete form.dataset.editId;
    fillCaseArrays([{ kind: 'source-supported', text: '', sourceSection: '' },
      { kind: 'teaching-inference', text: '' }], [{ topicId: draft.topics[0]?.id || '', kind: 'application', reason: '' }]);
    form.querySelector('button[type=submit]').textContent = 'Add case';
    $('#teacher-case-cancel').hidden = true;
    hideEditor('cases');
  });
  for (const selector of ['#teacher-relation', '#teacher-question', '#teacher-case']) {
    const form = $(selector);
    form.addEventListener('input', () => staged(form));
  }
  async function saveDraft() {
    if (!draft || saving || publishing) return false;
    for (const form of pendingForms) {
      if (!form.checkValidity()) {
        const view = Object.keys(editorForms).find((key) => $(editorForms[key]) === form);
        showTask(view, taskView === view ? contextConceptId : null);
        revealEditor(view); form.reportValidity();
        msg('Complete or cancel the open form before saving.');
        return false;
      }
    }
    for (const form of [...pendingForms]) form.requestSubmit();
    if (pendingForms.size) { msg('Complete or cancel the open relationship, question or case form before saving.'); return false; }
    const payload = structuredClone(draft);
    saving = true; controls();
    const savingGraph = graphId, savingSequence = editSequence;
    try {
      const result = await K.api('draft', 'POST', { graphId: savingGraph, payload, expectedRevision: revision });
      if (savingGraph !== graphId) return false;
      revision = result.revision;
      dirty = editSequence !== savingSequence;
      $('#teacher-reviewed').checked = false;
      msg(dirty ? 'Saved an earlier revision. New changes are still unsaved.' : pendingForms.size
        ? `Saved private draft ${revision}; open form changes remain unapplied.`
        : `Saved private draft ${revision}. Review every page before publishing.`);
      return !dirty && !pendingForms.size;
    } catch (error) { msg(`Save failed: ${error.message}`); return false; }
    finally { saving = false; controls(); }
  }
  async function protectDraft() {
    if (saving || publishing || transitioning) { msg('Wait for the current request to finish.'); return false; }
    if (!dirty && !pendingForms.size) return true;
    const choice = window.prompt('Unsaved teacher draft. Type SAVE, DISCARD, or CANCEL.', 'CANCEL')?.trim().toUpperCase();
    if (choice === 'SAVE') return saveDraft();
    if (choice === 'DISCARD') return true;
    return false;
  }
  window.addEventListener('beforeunload', (event) => {
    if (window.KnowledgeSigningOut) return;
    if (!dirty && !pendingForms.size && !saving && !transitioning) return;
    event.preventDefault(); event.returnValue = '';
  });
  $('#teacher-save').addEventListener('click', saveDraft);
  function preview(page) {
    if (!draft) return;
    if (pendingForms.size) { msg('Apply or cancel the open form changes before previewing.'); return; }
    const query = { graph: graphId, draftPreview: '1' };
    if (page === 'concept') query.topic = selectedId || draft.topics[0]?.id;
    if (page === 'question') query.question = (draft.questions || []).find((item) => item.topicId === selectedId)?.id || draft.questions?.[0]?.id;
    if (page === 'case') {
      const item = (draft.events || []).find((event) => event.links.some((link) => link.topicId === selectedId)) || draft.events?.[0];
      query.case = item?.id; query.topic = item?.links[0]?.topicId;
    }
    if ((page === 'question' && !query.question) || (page === 'case' && !query.case)) {
      msg(`Add a ${page} before previewing it.`); return;
    }
    sessionStorage.setItem('skillloop.knowledge.preview', JSON.stringify(draft));
    const frame = $('#teacher-frame'); frame.hidden = false;
    frame.src = K.href(page, query);
    msg(`Private Draft Preview: current ${page} draft is visible only to this teacher account. Save this version before publishing.`);
  }
  for (const [id, page] of [['teacher-preview','graph'], ['teacher-preview-concept','concept'],
    ['teacher-preview-question','question'], ['teacher-preview-case','case']])
    $(`#${id}`).addEventListener('click', () => preview(page));
  $('#teacher-reviewed').addEventListener('change', controls);
  $('#teacher-publish').addEventListener('click', async () => {
    if (!revision || dirty || pendingForms.size || saving || publishing || !$('#teacher-reviewed').checked) return;
    publishing = true; controls();
    try {
      const result = await K.api('publish', 'POST', { graphId, revision, reviewed: true });
      $('#teacher-reviewed').checked = false;
      const graph = graphList.find((item) => item.id === graphId);
      if (graph) {
        graph.current_version = result.version;
        const option = [...$('#teacher-graphs').options].find((item) => item.value === graphId);
        if (option) option.textContent = `${graph.title} · ${result.version}`;
        const libraryItem = [...$('#teacher-graph-list').children].find((item) => item.dataset.graphId === graphId);
        if (libraryItem) libraryItem.textContent = `${graph.title} · Published ${result.version}`;
      }
      renderShareLink();
      msg(dirty || pendingForms.size
        ? `Published ${result.version}. New edits remain in this workspace and are not published; save them as a new draft.`
        : `Published ${result.version}. The share link now serves this version.`);
    } catch (error) { msg(`Publish failed: ${error.message}`); }
    finally { publishing = false; controls(); }
  });
  $('#teacher-discovery').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#teacher-discovery-status').textContent = 'Searching sources…';
    try {
      const result = await K.api('discover', 'POST', { query: formValue(event.currentTarget, 'query') });
      $('#teacher-research').textContent = result.summary;
      const list = $('#teacher-sources'); list.replaceChildren();
      for (const source of result.sources) {
        const item = K.make('li'); const a = K.make('a', '', source.title || source.url);
        a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; item.append(a); list.append(item);
      }
      $('#teacher-discovery-status').textContent = 'Private research note. Verify sources before writing a case.';
    } catch (error) { $('#teacher-discovery-status').textContent = error.message; }
  });
  showTask('concepts'); controls();
  try {
    const session = await K.api('session');
    backendAvailable = !!session.backendConfigured;
    controls();
    if (session.signedIn && session.role === 'teacher') {
      signedIn = true;
      try {
        await withWorkspaceTransition('Loading your graphs…', graphs);
        $('#teacher-status').textContent = `Signed in as ${session.email}.`;
      } catch (error) {
        $('#teacher-status').textContent = `Signed in, but graphs could not load: ${error.message}. Reload to retry.`;
      }
    } else if (session.signedIn) $('#teacher-status').textContent = 'Teacher role required.';
    else if (!session.backendConfigured) $('#teacher-status').textContent = 'Teacher editing needs the Supabase URL and publishable key configured in this deployment, plus a teacher account. You can explore the sample public graph without signing in.';
    else $('#teacher-status').textContent = 'Sign in with a teacher account to edit and publish graphs.';
  } catch { backendAvailable = false; controls(); $('#teacher-status').textContent = 'Teacher sign-in is unavailable. Check the knowledge backend deployment settings.'; }
})();
