// Teaching Studio view state. Forms stay mounted when a task is hidden.
(function () {
  const views = ['library', 'concepts', 'relationships', 'questions', 'cases', 'research', 'review'];
  function relatedCounts(draft, conceptId) {
    return {
      relationships: (draft?.relations || []).filter((item) => item.source === conceptId || item.target === conceptId).length,
      questions: (draft?.questions || []).filter((item) => item.topicId === conceptId && !item.archived).length,
      cases: (draft?.events || []).filter((item) => !item.archived && item.links?.some((link) => link.topicId === conceptId)).length,
    };
  }
  function matchesConcept(view, item, conceptId) {
    if (!conceptId) return true;
    if (view === 'relationships') return item.source === conceptId || item.target === conceptId;
    if (view === 'questions') return item.topicId === conceptId;
    if (view === 'cases') return !!item.links?.some((link) => link.topicId === conceptId);
    return false;
  }
  window.SkillLoopStudioUI = { views, relatedCounts, matchesConcept };
})();
