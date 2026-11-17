(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('native') !== '1' || params.get('journey') === '1') return;
  const query = { course: params.get('course') ?? '', version: params.get('version') ?? '' };
  const publication = { courseId: query.course, version: Number(query.version) };
  let progress;
  let loading;
  let pending = Promise.resolve();
  const copy = value => structuredClone(value);

  const url = (route, extra = {}) => route + '?' + new URLSearchParams({ native: '1', ...query, ...extra });
  const overview = '/enhancement-v3/web/course.html?' + new URLSearchParams(query);
  const personalized = '/enhancement-v3/web/lesson.html?' + new URLSearchParams(query);

  async function request(op, data) {
    const response = await fetch('/api/courses/?' + new URLSearchParams({ op, ...query }), data === undefined ? {} : {
      method: 'POST',
      keepalive: ['learning-draft', 'feedback'].includes(data.action),
      headers: { 'Content-Type': 'application/json', 'X-SkillLoop-Course': '1' },
      body: JSON.stringify(data),
    });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || 'The course service is unavailable.'),
      { status: response.status, code: value.code });
    return value;
  }
  function notice(message) {
    let element = document.getElementById('native-course-notice');
    if (!element) {
      element = document.createElement('p');
      element.id = 'native-course-notice';
      element.setAttribute('role', 'status');
      document.querySelector('main').prepend(element);
    }
    element.textContent = message;
    return element;
  }
  function showUnavailable(error) {
    const status = notice(error.message);
    const link = document.createElement('a');
    link.href = overview;
    link.textContent = error.status === 401 ? ' Sign in from the course page' : ' Open your course';
    status.append(link);
    for (const control of document.querySelectorAll('main button, main input, main select')) control.disabled = true;
  }
  function initialize(value) {
    progress = value;
    const original = window.SkillLoop;
    const caseId = value.case.caseId;
    const local = new Map([
      ['learningPathDiagnosis', value.diagnosis],
      ['learningResult', value.learning],
      ['learningProgress', value.deck ? {
        caseId, diagnosisUpdatedAt: value.diagnosis.updatedAt, id: value.deck.id,
        source: value.deck.aiSource === 'api' ? 'ai-generated' : 'authored-fallback',
        lessons: value.deck.lessons, entries: value.feedback, reflection: value.reflection,
      } : null],
      ['repairPlans', value.plan ? { [caseId]: value.plan } : {}],
      ['codeReview', value.dialogue ? [{ ...value.dialogue, draft: value.draft ?? '' }] : []],
      ['correction', value.correction ?? {}],
    ]);
    window.SkillLoop = Object.freeze({
      read: (key, fallback) => copy(local.has(key) ? local.get(key) : fallback),
      write: (key, item) => { local.set(key, copy(item)); return true; },
      appendEvent() {},
      icons: original.icons,
      storageAvailable: () => true,
    });
    const badges = document.querySelectorAll('#site-header .sl-badge');
    badges.forEach(badge => { badge.textContent = 'Published course'; });
    for (const link of document.querySelectorAll('#site-navigation a')) {
      const path = new URL(link.href).pathname;
      if (['/learning-path/', '/knowledge-map/', '/interview/', '/correction-lab/'].includes(path))
        link.href = url(path, { case: caseId, ...(path === '/interview/' ? { flow: '1' } : {}) });
    }
    return value;
  }

  window.SkillLoopNative = {
    url, overview, personalized,
    open: () => loading ??= request('native-open').then(initialize).catch(error => { showUnavailable(error); return null; }),
    get progress() { return progress; },
    async refresh() {
      const latest = await request('native-open');
      if (latest.attemptId !== progress.attemptId) throw new Error('This course attempt changed. Reload before saving.');
      progress = latest;
      return latest;
    },
    data(original) {
      const item = progress.diagnosticCase;
      return { ...original, cases: [item], findCase: id => id === item.id ? item : null, isSharedCase: id => id === item.id };
    },
    act(action, input) {
      const operation = pending.then(async () => {
        try {
          const updated = await request('native-save', { ...publication, attemptId: progress.attemptId,
            revision: progress.revision, action, input });
          progress = updated.progress;
          return updated.data;
        } catch (error) {
          // Some actions save the pending answer before asking the provider.
          if (error.status !== 409 && error.status !== 401) {
            const latest = await request('native-open').catch(() => null);
            if (latest?.attemptId === progress.attemptId) progress = latest;
          }
          throw error;
        }
      });
      pending = operation.catch(() => {});
      return operation;
    },
    warn(message) { notice(message); },
  };
})();
