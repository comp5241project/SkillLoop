(async function () {
  const K = window.KnowledgeNetwork;
  const $ = K.$;
  let signedIn = false;
  let data = { nodes: [], edges: [] };
  let selectedId = null;
  let selectedRelationshipId = null;
  let teacherEdges = [];
  let adding = false;
  let edgeSelectionTouched = false;
  let creating = false;
  const noteDrafts = new Map();
  const connectionDrafts = new Map();
  let pendingWrites = 0;
  function hasCreationDraft() {
    if (!adding) return false;
    const note = $('#kn-add-note').elements;
    const edge = $('#kn-add-edge').elements;
    return !!(note.title.value.trim() || note.body.value.trim() || edge.reason.value.trim() || edgeSelectionTouched);
  }
  const canvas = new K.Canvas($('#kn-canvas'), { editable: true, onSelect: select,
    onSelectEdge: selectRelationship, onMove: move });
  function status(message) { $('#kn-account-state').textContent = message; }
  function writeError(error, message = error.message) {
    status(error.status === 401 ? 'Your session expired. Sign in again to open your account network.' : message);
  }
  const savePosition = window.SkillLoopPositionWrites.create(
    (id, position) => K.api('personal-position', 'POST', { id, ...position }),
    (id, position) => {
      const stored = data.nodes.find((item) => item.id === id);
      if (stored) Object.assign(stored, position);
      const displayed = canvas.items.find((item) => item.id === id);
      if (displayed) { Object.assign(displayed, position); canvas.place(displayed); canvas.lines(); }
    },
    (error) => status(`Position not saved: ${error.message}`));
  function title(node) { return node.title || node.titleSnapshot || node.id; }
  function key(node) { return node.id; }
  async function refreshTeacherEdges() {
    const ids = [...new Set(data.nodes.filter((node) => node.kind === 'reference').map((node) => node.graphId))];
    const graphs = await Promise.all(ids.map(async (graphId) => {
      try { return { id: graphId, graph: (await K.api('public', 'GET', undefined, { graph: graphId })).graph }; }
      catch { return { id: graphId, graph: graphId === K.sampleId ? window.SkillLoopGraph : null }; }
    }));
    const present = new Set(data.nodes.map(key));
    teacherEdges = graphs.flatMap(({ id, graph }) => (graph?.relations || []).filter((edge) =>
      present.has(`${id}:${edge.source}`) && present.has(`${id}:${edge.target}`)).map((edge) => ({
      id: `${id}:${edge.id}`, source: `${id}:${edge.source}`, target: `${id}:${edge.target}`,
      kind: 'teacher', type: edge.type, reason: edge.reason,
      currentVersion: graph.publication.version,
    })));
  }
  function options(select, nodes) {
    select.replaceChildren();
    for (const node of nodes) {
      const option = K.make('option', '', title(node));
      option.value = node.id;
      select.append(option);
    }
  }
  function renderList() {
    const list = $('#kn-list');
    const query = $('#kn-search').value.trim().toLowerCase();
    list.replaceChildren();
    for (const node of data.nodes) {
      if (query && !`${title(node)} ${node.body || node.note || ''}`.toLowerCase().includes(query)) continue;
      const button = K.make('button', 'kn-list-button', title(node));
      button.type = 'button';
      button.addEventListener('click', () => canvas.focus(node.id));
      list.append(button);
    }
    if (!list.childElementCount) list.textContent = 'No matching nodes.';
  }
  function render() {
    const present = new Set(data.nodes.map(key));
    $('#kn-empty').hidden = data.nodes.length > 0;
    $('#kn-graph-section').hidden = data.nodes.length === 0;
    $('#kn-add-section').hidden = !adding;
    $('#kn-add-edge').hidden = data.nodes.length < 2;
    $('#kn-context-section').hidden = data.nodes.length === 0;
    canvas.set(data.nodes, [...teacherEdges, ...data.edges.filter((edge) => present.has(edge.source) && present.has(edge.target))]);
    renderList();
    const selects = $('#kn-add-edge').querySelectorAll('select');
    selects.forEach((select) => {
      const value = select.value;
      options(select, data.nodes);
      if ([...select.options].some((option) => option.value === value)) select.value = value;
    });
    if (selectedRelationshipId && [...teacherEdges, ...data.edges].some((edge) => edge.id === selectedRelationshipId))
      canvas.selectEdge(selectedRelationshipId);
    else if (selectedId && present.has(selectedId)) canvas.select(selectedId);
    else select(null);
  }
  function select(id) {
    selectedId = id;
    selectedRelationshipId = null;
    const node = data.nodes.find((item) => item.id === id);
    const connectionForm = $('#kn-add-edge');
    if (node && connectionForm.dataset.pickingTarget === 'true' && node.id !== connectionForm.elements.source.value) {
      connectionForm.elements.target.value = node.id;
      edgeSelectionTouched = true;
      $('#kn-connect-status').textContent = `Target selected: ${title(node)}. Enter a reason, then connect the nodes.`;
    }
    const box = $('#kn-selected');
    const backlinks = $('#kn-backlinks');
    box.replaceChildren(); backlinks.replaceChildren();
    $('#kn-selected-title').textContent = node ? title(node) : 'Select a node';
    if (!node) { box.textContent = 'Choose a node to see its source, notes and connections.'; return; }
    if (node.kind === 'reference') {
      box.append(K.make('p', '', node.descriptionSnapshot || 'Teacher concept'));
      const origin = K.make('a', '', `Teacher source · ${node.graphId} · version ${node.sourceVersion}`);
      origin.href = K.href('concept', { graph: node.graphId, topic: node.conceptId,
        ...(node.sourceVersion && node.sourceVersion !== 'unknown' ? { version: node.sourceVersion } : {}) });
      box.append(origin);
    }
    const field = node.kind === 'note' ? 'body' : 'note';
    const savedValue = () => node[field] || '';
    const form = K.make('form', 'kn-note-form');
    const label = K.make('label', '', node.kind === 'note' ? 'My note' : 'Personal note about this reference');
    const textarea = K.make('textarea');
    textarea.maxLength = 1000;
    textarea.value = noteDrafts.get(node.id) ?? savedValue();
    const save = K.make('button', 'sl-btn', 'Save note'); save.type = 'submit';
    const cancel = K.make('button', 'sl-btn', 'Cancel'); cancel.type = 'button';
    const updateButtons = () => { save.disabled = cancel.disabled = !noteDrafts.has(node.id); };
    textarea.addEventListener('input', () => {
      if (textarea.value === savedValue()) noteDrafts.delete(node.id);
      else noteDrafts.set(node.id, textarea.value);
      updateButtons();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!noteDrafts.has(node.id)) return;
      const value = textarea.value;
      save.disabled = cancel.disabled = textarea.disabled = true;
      pendingWrites += 1;
      try {
        await K.api(node.kind === 'note' ? 'personal-note' : 'note', 'POST', node.kind === 'note'
          ? { id: node.id, title: node.title, body: value, x: node.x, y: node.y }
          : { graphId: node.graphId, conceptId: node.conceptId, note: value });
        node[field] = value;
        noteDrafts.delete(node.id);
        status('Note saved to your account.');
      } catch (error) { writeError(error, `Note not saved: ${error.message}. Your text is still here; retry or Cancel.`); }
      finally { pendingWrites -= 1; textarea.disabled = false; updateButtons(); }
    });
    cancel.addEventListener('click', () => {
      noteDrafts.delete(node.id); textarea.value = savedValue(); updateButtons(); status('Note changes discarded.');
    });
    label.append(textarea); form.append(label, save, cancel); box.append(form);
    updateButtons();
    const remove = K.make('button', 'sl-btn', 'Remove node');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove ${title(node)} and its personal connections?`)) return;
      try {
        await K.api(node.kind === 'note' ? 'remove-personal-note' : 'unreference', 'POST',
          node.kind === 'note' ? { id: node.id } : { graphId: node.graphId, conceptId: node.conceptId });
        data.nodes = data.nodes.filter((item) => item.id !== node.id);
        noteDrafts.delete(node.id);
        for (const edge of data.edges) {
          if (edge.source === node.id || edge.target === node.id) connectionDrafts.delete(edge.id);
        }
        data.edges = data.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
        teacherEdges = teacherEdges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
        render();
        status('Node removed from your account.');
      } catch (error) { writeError(error); }
    });
    box.append(remove);
    if (data.nodes.length > 1) {
      const connect = K.make('button', 'sl-btn', 'Connect from this node');
      connect.type = 'button';
      connect.addEventListener('click', () => {
        if (creating) return;
        const form = $('#kn-add-edge');
        if ((form.elements.reason.value.trim() || edgeSelectionTouched) &&
            !window.confirm('Discard the unfinished connection and start a new one?')) return;
        form.reset(); edgeSelectionTouched = false;
        adding = true; render();
        form.elements.source.value = node.id;
        form.dataset.pickingTarget = 'true';
        $('#kn-connect-status').textContent = 'Choose a target on the graph or from search results, or use the To menu.';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        form.elements.target.focus();
      });
      box.append(connect);
    }
    const connected = [...teacherEdges, ...data.edges].filter((edge) => edge.source === node.id || edge.target === node.id);
    for (const edge of connected) {
      const source = data.nodes.find((item) => item.id === edge.source);
      const target = data.nodes.find((item) => item.id === edge.target);
      const button = K.make('button', 'kn-list-button', `${source ? title(source) : edge.source} → ${target ? title(target) : edge.target}: ${edge.reason}`);
      button.type = 'button'; button.addEventListener('click', () => canvas.selectEdge(edge.id));
      backlinks.append(button);
    }
    if (!connected.length) backlinks.textContent = 'No connections yet.';
  }
  function selectRelationship(edge) {
    const focusFromList = $('#kn-backlinks').contains(document.activeElement);
    selectedRelationshipId = edge.id;
    selectedId = null;
    const source = data.nodes.find((node) => node.id === edge.source);
    const target = data.nodes.find((node) => node.id === edge.target);
    const heading = $('#kn-selected-title');
    heading.textContent = `${source ? title(source) : edge.source} → ${target ? title(target) : edge.target}`;
    const box = $('#kn-selected'); box.replaceChildren();
    box.append(K.make('p', '', edge.kind === 'teacher' ? `Published relationship · type: ${edge.type}` : 'Personal connection'),
      K.make('p', '', `Direction: ${source ? title(source) : edge.source} to ${target ? title(target) : edge.target}.`),
      K.make('p', '', `Why connected: ${edge.reason}`));
    if (edge.kind === 'teacher') {
      box.append(K.make('p', '', `Current published graph version: ${edge.currentVersion}. Referenced concepts may originate from another version.`));
    } else {
      const form = K.make('form');
      const label = K.make('label', '', 'Edit my connection reason');
      const input = K.make('input'); input.name = 'reason'; input.maxLength = 280; input.required = true;
      input.value = connectionDrafts.get(edge.id) ?? edge.reason;
      const save = K.make('button', 'sl-btn', 'Save reason'); save.type = 'submit';
      const cancel = K.make('button', 'sl-btn', 'Cancel'); cancel.type = 'button';
      const updateButtons = () => { save.disabled = cancel.disabled = !connectionDrafts.has(edge.id); };
      input.addEventListener('input', () => {
        if (input.value === edge.reason) connectionDrafts.delete(edge.id);
        else connectionDrafts.set(edge.id, input.value);
        updateButtons();
      });
      label.append(input); form.append(label, save, cancel);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!connectionDrafts.has(edge.id)) return;
        save.disabled = cancel.disabled = input.disabled = true;
        pendingWrites += 1;
        try {
          const reason = input.value.trim();
          if (!reason) { status('Enter a connection reason.'); return; }
          await K.api('update-personal-edge', 'POST', { id: edge.id, reason });
          edge.reason = reason;
          connectionDrafts.delete(edge.id);
          render();
          status('Connection reason saved to your account.');
        } catch (error) { writeError(error, `Connection reason not saved: ${error.message}`); }
        finally { pendingWrites -= 1; input.disabled = false; updateButtons(); }
      });
      cancel.addEventListener('click', () => {
        connectionDrafts.delete(edge.id); input.value = edge.reason; updateButtons(); status('Connection changes discarded.');
      });
      updateButtons();
      const remove = K.make('button', 'sl-btn', 'Remove my connection'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Remove this personal connection?')) return;
        try {
          await K.api('remove-personal-edge', 'POST', { id: edge.id });
          data.edges = data.edges.filter((item) => item.id !== edge.id);
          connectionDrafts.delete(edge.id);
          selectedRelationshipId = null; render();
        } catch (error) { writeError(error, `Connection was not removed: ${error.message}`); }
      });
      box.append(form, remove);
    }
    $('#kn-backlinks').replaceChildren(K.make('p', '', 'Choose a node to browse its other connections.'));
    if (focusFromList) { heading.tabIndex = -1; heading.focus(); }
  }
  async function move(node, previous) {
    const target = { x: node.x, y: node.y };
    if (target.x === previous.x && target.y === previous.y) return;
    const stored = data.nodes.find((item) => item.id === node.id);
    if (stored) Object.assign(stored, target);
    if (!signedIn) return;
    pendingWrites += 1;
    try { await savePosition(node.id, previous, target); }
    finally { pendingWrites -= 1; }
  }
  async function loadAccount() {
    const response = await K.api('personal');
    data = { nodes: response.nodes || [], edges: response.edges || [] };
    await refreshTeacherEdges();
    render();
  }
  window.addEventListener('beforeunload', (event) => {
    if (window.KnowledgeSigningOut) return;
    if (!noteDrafts.size && !connectionDrafts.size && !hasCreationDraft() && !pendingWrites) return;
    event.preventDefault(); event.returnValue = '';
  });
  window.KnowledgeBeforeSignOut = async () => {
    if (pendingWrites) { status('Wait for the account save to finish before signing out.'); return false; }
    return !noteDrafts.size && !connectionDrafts.size && !hasCreationDraft() ||
      window.confirm('Discard unsaved personal changes and sign out?');
  };
  document.addEventListener('knowledge-auth-expired', () => {
    signedIn = false;
    data = { nodes: [], edges: [] }; teacherEdges = [];
    $('#kn-graph-section').hidden = true;
    $('#kn-context-section').hidden = true;
    $('#kn-add-section').hidden = true;
    $('#kn-empty').hidden = false;
    $('#kn-create-first').hidden = true;
    $('#kn-sign-in').hidden = false;
    status('Your session expired. Sign in again to open your account network.');
  });
  $('#kn-create-first').addEventListener('click', () => {
    delete $('#kn-add-edge').dataset.pickingTarget;
    adding = true; $('#kn-add-section').hidden = false;
    $('#kn-add-note [name=title]').focus();
  });
  $('#kn-sign-in').addEventListener('click', () => window.KnowledgeAccount.open());
  $('#kn-add-open').addEventListener('click', () => {
    delete $('#kn-add-edge').dataset.pickingTarget;
    adding = true; $('#kn-add-section').hidden = false;
    $('#kn-add-note [name=title]').focus();
  });
  $('#kn-add-cancel').addEventListener('click', () => {
    if (creating) return;
    $('#kn-add-note').reset(); $('#kn-add-edge').reset();
    edgeSelectionTouched = false;
    delete $('#kn-add-edge').dataset.pickingTarget;
    $('#kn-connect-status').textContent = 'Choose a target on the graph or from search results, or use the To menu.';
    adding = false; $('#kn-add-section').hidden = true;
  });
  $('#kn-add-edge').addEventListener('change', (event) => {
    if (event.target.matches('select')) edgeSelectionTouched = true;
  });
  $('#kn-search').addEventListener('input', () => { renderList(); canvas.highlight($('#kn-search').value); });
  $('#kn-zoom-in').addEventListener('click', () => canvas.zoom(1.2));
  $('#kn-zoom-out').addEventListener('click', () => canvas.zoom(1 / 1.2));
  $('#kn-reset').addEventListener('click', () => canvas.resetView());
  $('#kn-add-note').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (creating) return;
    const form = event.currentTarget;
    const formControls = [...form.elements];
    const title = form.elements.title.value.trim();
    const body = form.elements.body.value.trim();
    const node = { id: `note:${crypto.randomUUID()}`, kind: 'note', title, body,
      x: 80 + data.nodes.length % 4 * 220, y: 80 + Math.floor(data.nodes.length / 4) * 130 };
    creating = true; pendingWrites += 1;
    $('#kn-add-cancel').disabled = true;
    formControls.forEach((control) => { control.disabled = true; });
    $('#kn-add-edge button[type=submit]').disabled = true;
    try {
      await K.api('personal-note', 'POST', node);
      data.nodes.push(node);
      form.reset(); adding = hasCreationDraft(); render();
      if (!adding) canvas.focus(node.id);
      if (adding) status('Node saved to your account. Your unfinished connection remains in the Add and connect form.');
      else status('Node created and saved.');
    } catch (error) { writeError(error); }
    finally {
      pendingWrites -= 1; creating = false;
      $('#kn-add-cancel').disabled = false;
      formControls.forEach((control) => { control.disabled = false; });
      $('#kn-add-edge button[type=submit]').disabled = false;
    }
  });
  $('#kn-add-edge').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (creating) return;
    const form = event.currentTarget;
    const formControls = [...form.elements];
    const source = form.elements.source.value, target = form.elements.target.value;
    if (source === target) { status('Choose two different nodes.'); return; }
    if (data.edges.some((edge) => edge.source === source && edge.target === target)) { status('This personal connection already exists.'); return; }
    const edge = { id: crypto.randomUUID(), source, target, reason: form.elements.reason.value.trim(), kind: 'personal' };
    creating = true; pendingWrites += 1;
    $('#kn-add-cancel').disabled = true;
    $('#kn-add-note button[type=submit]').disabled = true;
    formControls.forEach((control) => { control.disabled = true; });
    try {
      await K.api('personal-edge', 'POST', edge);
      data.edges.push(edge);
      form.reset(); edgeSelectionTouched = false; delete form.dataset.pickingTarget;
      adding = hasCreationDraft(); render(); canvas.focus(target);
      status('Connection saved to your account.');
    } catch (error) { writeError(error); }
    finally {
      pendingWrites -= 1; creating = false;
      $('#kn-add-cancel').disabled = false;
      $('#kn-add-note button[type=submit]').disabled = false;
      formControls.forEach((control) => { control.disabled = false; });
    }
  });
  try {
    const session = await K.api('session');
    if (session.signedIn && session.role === 'student') {
      signedIn = true;
      await loadAccount();
      status(`Account network for ${session.email}.`);
    } else {
      $('#kn-empty').hidden = false;
      $('#kn-empty').querySelector('h2').textContent = session.signedIn ? 'Student workspace only' : 'Sign in to use My Knowledge';
      $('#kn-create-first').hidden = true;
      $('#kn-sign-in').hidden = session.signedIn || !session.backendConfigured;
      status(session.signedIn ? 'This account opens in Teaching Studio.' :
        session.backendConfigured ? 'Sign in to save personal knowledge to your account.' : 'Account service is unavailable. Explore public knowledge instead.');
    }
  } catch (error) {
    signedIn = false; data = { nodes: [], edges: [] };
    $('#kn-empty').hidden = false;
    $('#kn-create-first').hidden = true;
    status(`Account network is unavailable: ${error.message} No browser data was loaded or written.`);
  }
})();
