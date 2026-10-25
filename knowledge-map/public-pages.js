(async function () {
  const K = window.KnowledgeNetwork;
  const $ = K.$;
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);
  const link = (label, href) => { const a = K.make('a', '', label); a.href = href; return a; };
  const status = (message) => { $('#kn-status').textContent = message; };
  function renderActivities(host, activities) {
    host.replaceChildren();
    for (const activity of activities) {
      const form = K.make('form', 'kn-activity');
      const fieldset = K.make('fieldset');
      fieldset.append(K.make('legend', '', activity.prompt));
      activity.options.forEach((option, index) => {
        const label = K.make('label', 'kn-choice');
        const input = K.make('input');
        input.type = 'radio'; input.name = `activity-${activity.id}`; input.value = String(index);
        label.append(input, document.createTextNode(option));
        fieldset.append(label);
      });
      const check = K.make('button', 'sl-btn', 'Check answer'); check.type = 'submit';
      const feedback = K.make('p'); feedback.setAttribute('role', 'status');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const checked = form.querySelector('input:checked');
        feedback.textContent = checked
          ? `${Number(checked.value) === activity.answerIndex ? 'Correct. ' : 'Try again. '}${activity.feedback}`
          : 'Choose an answer first.';
      });
      form.append(fieldset, check, feedback); host.append(form);
    }
  }
  try {
    const { graph, preview, sample } = await K.loadGraph();
    const topics = new Map(graph.topics.map((topic) => [topic.id, topic]));
    const active = graph.topics.filter((topic) => !topic.archived);
    const questions = graph.questions || [];
    const events = graph.events || [];
    const relations = graph.relations || [];
    const breadcrumbs = $('#kn-breadcrumbs');
    breadcrumbs.append(link('Explore', '/knowledge-map/explore.html'));
    if (page !== 'graph') breadcrumbs.append(link(graph.publication.title, K.href('graph')));
    status(`${preview ? 'Private draft preview' : sample ? 'Curated sample' : 'Published'} · version ${graph.publication.version}`);
    if (page === 'graph') {
      $('#kn-title').textContent = graph.publication.title;
      const canvas = new K.Canvas($('#kn-canvas'), { onSelect: showSelection, onSelectEdge: showRelationship });
      canvas.set(active, relations.filter((relation) => topics.has(relation.source) && topics.has(relation.target)));
      $('#kn-zoom-in').addEventListener('click', () => canvas.zoom(1.2));
      $('#kn-zoom-out').addEventListener('click', () => canvas.zoom(1 / 1.2));
      $('#kn-reset').addEventListener('click', () => canvas.resetView());
      const list = $('#kn-list');
      function renderList() {
        const query = $('#kn-search').value.trim().toLowerCase();
        list.replaceChildren();
        const fragment = document.createDocumentFragment();
        for (const topic of active) {
          if (query && !`${topic.title} ${topic.description}`.toLowerCase().includes(query)) continue;
          const button = K.make('button', 'kn-list-button', topic.title);
          button.type = 'button';
          button.addEventListener('click', () => canvas.focus(topic.id));
          fragment.append(button);
        }
        list.append(fragment);
        canvas.highlight(query);
        if (!list.childElementCount) list.textContent = 'No matching concepts.';
      }
      $('#kn-search').addEventListener('input', renderList);
      renderList();
      function showSelection(id) {
        const topic = topics.get(id);
        if (!topic) return;
        $('#kn-selected-title').textContent = topic.title;
        const selected = $('#kn-selected');
        selected.replaceChildren(K.make('p', '', topic.description), link('Open knowledge page →', K.href('concept', { topic: id })));
        const details = $('#kn-relations');
        details.replaceChildren();
        for (const relation of relations.filter((item) => item.source === id || item.target === id)) {
          const otherId = relation.source === id ? relation.target : relation.source;
          const other = topics.get(otherId);
          if (!other) continue;
          const button = K.make('button', 'kn-list-button', `${topics.get(relation.source)?.title} → ${topics.get(relation.target)?.title}: ${relation.reason}`);
          button.type = 'button';
          button.addEventListener('click', () => canvas.selectEdge(relation.id));
          details.append(button);
        }
      }
      function showRelationship(relation) {
        const from = topics.get(relation.source), to = topics.get(relation.target);
        const details = $('#kn-relations');
        const focusFromList = details.contains(document.activeElement);
        const heading = $('#kn-selected-title');
        heading.textContent = `${from?.title || relation.source} → ${to?.title || relation.target}`;
        const selected = $('#kn-selected');
        selected.replaceChildren(
          K.make('p', '', `Type: ${relation.type}. Direction: ${from?.title || relation.source} to ${to?.title || relation.target}.`),
          K.make('p', '', `Why connected: ${relation.reason}`),
          K.make('p', '', `Source: ${preview ? 'private teacher draft' : sample ? 'curated sample' : 'teacher published graph'} · version ${graph.publication.version}.`),
          link(`Open ${from?.title || relation.source}`, K.href('concept', { topic: relation.source })),
          link(`Open ${to?.title || relation.target}`, K.href('concept', { topic: relation.target })));
        const relatedActivities = (graph.activities || []).filter((activity) => activity.relationId === relation.id);
        if (relatedActivities.length) renderActivities(details, relatedActivities);
        else details.replaceChildren(K.make('p', '', 'Choose a concept to browse its other connections.'));
        if (focusFromList) { heading.tabIndex = -1; heading.focus(); }
      }
      if (active.length) canvas.focus(active[0].id);
      return;
    }
    if (page === 'concept') {
      const topic = topics.get(params.get('topic'));
      if (!topic) throw new Error('Concept not found.');
      breadcrumbs.append(link(topic.title, K.href('concept', { topic: topic.id })));
      $('#kn-title').textContent = topic.title;
      $('#kn-description').textContent = topic.description;
      $('#kn-goal').textContent = topic.lesson.goal;
      $('#kn-explanation').textContent = topic.lesson.explanation;
      $('#kn-example').textContent = topic.lesson.example;
      $('#kn-next').textContent = topic.lesson.nextAction;
      if (topic.archived) status(`Archived concept · source version ${graph.publication.version}`);
      const pages = $('#kn-next-pages');
      for (const question of questions.filter((item) => item.topicId === topic.id && !item.archived))
        pages.append(link(`Practice: ${question.prompt}`, K.href('question', { question: question.id })));
      for (const event of events.filter((item) => !item.archived && item.links.some((entry) => entry.topicId === topic.id)))
        pages.append(link(`Case: ${event.title}`, K.href('case', { case: event.id, topic: topic.id })));
      const practice = $('#kn-practice-link');
      if (topic.practiceHref) {
        practice.href = new URL(topic.practiceHref, `${location.origin}/knowledge-map/`).href;
        practice.hidden = false;
      }
      const activities = (graph.activities || []).filter((activity) => activity.topicIds.includes(topic.id));
      $('#kn-activities-section').hidden = !activities.length;
      if (activities.length) renderActivities($('#kn-activities'), activities);
      if (!pages.childElementCount) pages.textContent = 'More materials will appear when the teacher publishes them.';
      const referenceButton = $('#kn-reference');
      referenceButton.addEventListener('click', async () => {
        referenceButton.disabled = true;
        try {
          const session = await K.api('session');
          if (!session.signedIn || session.role !== 'student') {
            status(session.signedIn ? 'This action is available in a student account.' : 'Sign in to a student account to save this concept.');
            if (!session.signedIn) window.KnowledgeAccount.open();
            return;
          }
          const result = await K.api('reference', 'POST', { graphId: graph.publication.id,
            conceptId: topic.id, sourceVersion: graph.publication.version });
          status(result.created ? 'Referenced in your account network.' : 'Already in your account network.');
        } catch (error) {
          status(`Reference was not saved: ${error.message} No browser knowledge record was written.`);
        } finally { referenceButton.disabled = false; }
      });
      return;
    }
    if (page === 'question') {
      const question = questions.find((item) => item.id === params.get('question'));
      if (!question) throw new Error('Question not found.');
      const topic = topics.get(question.topicId);
      breadcrumbs.append(link(topic.title, K.href('concept', { topic: topic.id })));
      breadcrumbs.append(link('Question', K.href('question', { question: question.id })));
      $('#kn-title').textContent = `${topic.title}: practice`;
      $('#kn-prompt').textContent = question.prompt;
      question.options.forEach((option, index) => {
        const label = K.make('label', 'kn-choice');
        const input = K.make('input');
        input.type = 'radio'; input.name = 'answer'; input.value = String(index);
        label.append(input, document.createTextNode(option));
        $('#kn-options').append(label);
      });
      $('#kn-answer').addEventListener('submit', (event) => {
        event.preventDefault();
        const checked = document.querySelector('input[name="answer"]:checked');
        $('#kn-feedback').textContent = checked
          ? `${Number(checked.value) === question.answerIndex ? 'Correct. ' : 'Try again. '}${question.feedback}`
          : 'Choose an answer first.';
      });
      return;
    }
    if (page === 'case') {
      const event = events.find((item) => item.id === params.get('case'));
      if (!event) throw new Error('Case not found.');
      const related = event.links.find((item) => item.topicId === params.get('topic')) || event.links[0];
      if (related) breadcrumbs.append(link(topics.get(related.topicId)?.title || related.topicId,
        K.href('concept', { topic: related.topicId })));
      breadcrumbs.append(link('Case', K.href('case', { case: event.id, ...(related ? { topic: related.topicId } : {}) })));
      $('#kn-title').textContent = event.title;
      $('#kn-case-date').textContent = `Event date: ${event.date}`;
      $('#kn-summary').textContent = event.summary;
      for (const claim of event.claims) $('#kn-claims').append(K.make('li', '',
        `${claim.kind === 'source-supported' ? 'Source-supported' : 'Teaching inference'}: ${claim.text}${claim.sourceSection ? ` (${claim.sourceSection})` : ''}`));
      const source = event.source;
      $('#kn-source').append(`Source: ${source.title}; published ${source.publishedDate}; checked ${source.checkedDate}. `,
        link('Open source ↗', source.url));
      for (const connection of event.links) $('#kn-case-links').append(link(
        `${topics.get(connection.topicId)?.title || connection.topicId}: ${connection.reason}`,
        K.href('concept', { topic: connection.topicId })));
    }
  } catch (error) {
    $('#kn-title').textContent = 'This page is unavailable';
    status(error.message);
    const main = $('#main-content');
    for (const section of main.querySelectorAll(':scope > section, :scope > .kn-explorer-layout')) section.hidden = true;
    const recovery = K.make('section', 'sl-card');
    recovery.append(K.make('h2', '', 'Continue exploring'),
      K.make('p', '', 'The requested knowledge content could not be loaded. Check the link or try another published resource.'),
      link('Browse Explore', '/knowledge-map/explore.html'));
    main.append(recovery);
  }
})();
