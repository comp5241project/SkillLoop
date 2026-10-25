/** Plain session data, independent of the page, shared account system and AI provider. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SkillLoopInterviewModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const clean = (value, limit = 100) => (typeof value === 'string' ? value.slice(0, limit) : '');
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function safeReturnPath(value) {
    if (typeof value !== 'string' || !value || value.length > 1500) return '';
    try {
      const base = new URL('https://skillloop.invalid/interview/');
      const url = new URL(value, base);
      if (
        url.origin !== base.origin ||
        !/^\/(knowledge-map|learning-path)(\/|$)/.test(url.pathname)
      )
        return '';
      return url.pathname + url.search + url.hash;
    } catch (_) {
      return '';
    }
  }

  function contextFromSearch(search) {
    const query = new URLSearchParams(search);
    return {
      courseId: clean(query.get('courseId')),
      activityId: clean(query.get('activityId')),
      conceptId: clean(query.get('conceptId') || query.get('topic')),
      graphId: clean(query.get('graphId') || query.get('graph')),
      publicationVersion: clean(query.get('publicationVersion') || query.get('version')),
      returnTo: safeReturnPath(query.get('returnTo')),
    };
  }

  function validActivity(activity) {
    return (
      activity &&
      typeof activity.id === 'string' &&
      activity.id.length <= 100 &&
      typeof activity.title === 'string' &&
      activity.title.trim() &&
      activity.title.length <= 100 &&
      typeof activity.objective === 'string' &&
      activity.objective.trim() &&
      activity.objective.length <= 300 &&
      typeof activity.conceptId === 'string' &&
      activity.conceptId.length <= 100 &&
      Array.isArray(activity.prompts) &&
      activity.prompts.length === 3 &&
      activity.prompts.every(
        (prompt) => typeof prompt === 'string' && prompt.trim() && prompt.length <= 700
      ) &&
      Array.isArray(activity.criteria) &&
      activity.criteria.length > 0 &&
      activity.criteria.length <= 3 &&
      activity.criteria.every(
        (item) => typeof item === 'string' && item.trim() && item.length <= 170
      ) &&
      Array.isArray(activity.hints) &&
      activity.hints.length === 3 &&
      activity.hints.every((item) => typeof item === 'string') &&
      (!activity.moves ||
        (Array.isArray(activity.moves) &&
          activity.moves.length <= 3 &&
          activity.moves.every(
            (choices) =>
              Array.isArray(choices) &&
              choices.length <= 3 &&
              choices.every(
                (choice) =>
                  choice &&
                  typeof choice.id === 'string' &&
                  typeof choice.label === 'string' &&
                  typeof choice.icon === 'string' &&
                  typeof choice.consequence === 'string' &&
                  (!choice.nextPrompt ||
                    (typeof choice.nextPrompt === 'string' && choice.nextPrompt.length <= 700))
              )
          )))
    );
  }

  function createSession(activity, context = {}, level = 'guided', now = new Date().toISOString()) {
    if (!validActivity(activity)) throw new Error('Invalid practice activity.');
    const selected = clone(activity);
    if (level === 'independent' && selected.advancedPrompt)
      selected.prompts[0] = selected.advancedPrompt;
    return {
      schemaVersion: 1,
      id:
        'iv-' +
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now() + '-' + Math.random().toString(36).slice(2)),
      status: 'active',
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      provider: 'sample',
      level: level === 'independent' ? 'independent' : 'guided',
      activity: selected,
      context: { ...context, conceptId: context.conceptId || selected.conceptId },
      draft: '',
      answers: [],
      hints: [],
      checklist: [],
      reflection: '',
      decisions: [],
    };
  }

  function submitAnswer(session, text, now = new Date().toISOString()) {
    if (session.status !== 'active') throw new Error('This session has already finished.');
    if (typeof text !== 'string' || !text.trim() || text.length > 5000)
      throw new Error('Write your approach first (up to 5,000 characters).');
    const index = session.answers.length;
    if (index >= session.activity.prompts.length) throw new Error('No question remains.');
    session.answers.push({
      question: session.activity.prompts[index],
      original: text.trim(),
      submittedAt: now,
      revisions: [],
    });
    session.draft = '';
    session.updatedAt = now;
    if (session.answers.length === session.activity.prompts.length) {
      session.status = 'completed';
      session.completedAt = now;
    }
    return session;
  }

  function reviseAnswer(session, index, text, now = new Date().toISOString()) {
    const answer = session.answers[index];
    if (!answer || typeof text !== 'string' || !text.trim() || text.length > 5000)
      throw new Error('Write a revision before saving.');
    const latest = answer.revisions.length ? answer.revisions.at(-1).text : answer.original;
    if (text.trim() === latest) return false;
    if (answer.revisions.length >= 10)
      throw new Error('This answer already has ten saved revisions.');
    answer.revisions.push({ text: text.trim(), at: now });
    session.updatedAt = now;
    return true;
  }

  function chooseMove(session, choiceId, now = new Date().toISOString()) {
    if (session.status !== 'active') throw new Error('This session has already finished.');
    const turn = session.answers.length;
    const choice = session.activity.moves?.[turn]?.find((item) => item.id === choiceId);
    if (!choice) throw new Error('Unknown practice move.');
    session.decisions = (session.decisions || []).filter((item) => item.turn !== turn);
    session.decisions.push({
      turn,
      choiceId,
      label: choice.label,
      consequence: choice.consequence,
      at: now,
    });
    if (choice.nextPrompt && turn < 2) session.activity.prompts[turn + 1] = choice.nextPrompt;
    session.updatedAt = now;
    return choice;
  }

  function validSession(session) {
    return (
      session &&
      session.schemaVersion === 1 &&
      typeof session.id === 'string' &&
      ['active', 'completed'].includes(session.status) &&
      validActivity(session.activity) &&
      typeof session.startedAt === 'string' &&
      Number.isFinite(Date.parse(session.startedAt)) &&
      typeof session.updatedAt === 'string' &&
      Number.isFinite(Date.parse(session.updatedAt)) &&
      session.context &&
      typeof session.context === 'object' &&
      typeof session.draft === 'string' &&
      session.draft.length <= 5000 &&
      typeof session.reflection === 'string' &&
      session.reflection.length <= 1000 &&
      Array.isArray(session.answers) &&
      session.answers.length <= 3 &&
      (session.status === 'completed'
        ? session.answers.length === 3
        : session.answers.length < 3) &&
      session.answers.every(
        (answer) =>
          answer &&
          typeof answer.question === 'string' &&
          typeof answer.original === 'string' &&
          answer.original.length <= 5000 &&
          Array.isArray(answer.revisions) &&
          answer.revisions.length <= 10 &&
          answer.revisions.every(
            (revision) =>
              revision && typeof revision.text === 'string' && revision.text.length <= 5000
          )
      ) &&
      Array.isArray(session.hints) &&
      session.hints.every((value) => Number.isInteger(value) && value >= 0 && value < 3) &&
      Array.isArray(session.checklist) &&
      session.checklist.every((value) => Number.isInteger(value) && value >= 0 && value < 3) &&
      (!session.decisions ||
        (Array.isArray(session.decisions) &&
          session.decisions.length <= 3 &&
          session.decisions.every(
            (decision) =>
              decision &&
              Number.isInteger(decision.turn) &&
              decision.turn >= 0 &&
              decision.turn < 3 &&
              typeof decision.choiceId === 'string' &&
              typeof decision.label === 'string' &&
              typeof decision.consequence === 'string'
          )))
    );
  }

  function restore(value) {
    const state = value && typeof value === 'object' ? value : {};
    const sessions = Array.isArray(state.sessions)
      ? state.sessions.filter(validSession).slice(0, 12).map(clone)
      : [];
    const custom = {};
    if (state.custom && typeof state.custom === 'object') {
      for (const id of ['testing', 'requirements', 'ai-review']) {
        if (validActivity(state.custom[id]) && state.custom[id].id === id)
          custom[id] = clone(state.custom[id]);
      }
    }
    return { schemaVersion: 1, sessions, custom };
  }

  return Object.freeze({
    createSession,
    submitAnswer,
    reviseAnswer,
    chooseMove,
    restore,
    contextFromSearch,
    safeReturnPath,
    validActivity,
  });
});
