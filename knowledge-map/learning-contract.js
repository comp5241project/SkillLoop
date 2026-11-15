(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkillLoopLearningContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const levels = new Set(['foundation', 'developing', 'ready']);
  const text = (value, max = 1200) => typeof value === 'string' && !!value.trim() && value.length <= max;
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  const judgments = ['correct', 'incomplete', 'incorrect'];
  const ids = (value, allowed, min = 0, max = Infinity) => Array.isArray(value) && value.length >= min && value.length <= max &&
    new Set(value).size === value.length && value.every((id) => typeof id === 'string' && allowed.has(id));
  function validResult(result, selectedCase, samples) {
    if (!result || result.caseId !== selectedCase.caseId || !result.overall ||
        !levels.has(result.overall.level) || !text(result.overall.summary, 500)) return false;
    const allowed = new Set(selectedCase.topicIds);
    if (!Array.isArray(result.dimensions) || result.dimensions.length !== allowed.size ||
        !ids(result.dimensions.map((item) => item?.conceptId), allowed, allowed.size, allowed.size)) return false;
    if (!result.dimensions.every((item) => levels.has(item.level) && text(item.evidence, 240) &&
        text(item.strength, 220) && text(item.gap, 220))) return false;
    return ids(result.priorities, allowed, 1, 3) && Array.isArray(result.nextSteps) &&
      result.nextSteps.length >= 2 && result.nextSteps.length <= 4 && result.nextSteps.every((step) => text(step, 180)) &&
      selectedCase.topicIds.every((id) => samples.topics.some((topic) => topic.topicId === id));
  }
  function validInput(input, samples) {
    if (!input || !samples || !Array.isArray(samples.topics) || !input.case || !input.result) return false;
    const expected = samples.cases?.[input.case.caseId];
    const keys = ['caseId', 'title', 'summary', 'starterCode', 'topicIds'];
    return !!expected && keys.every((key) => JSON.stringify(input.case[key]) === JSON.stringify(expected[key])) &&
      validResult(input.result, expected, samples);
  }
  function validRecord(record, samples) {
    if (!record || record.schemaVersion !== 2 || !samples.cases?.[record.caseId] ||
        !['ai', 'authored'].includes(record.questionSource) || !['ai', 'local'].includes(record.source) ||
        !record.learner || !['beginner', 'student', 'graduate'].includes(record.learner.background) ||
        !['internship', 'build'].includes(record.learner.goal) || !Array.isArray(record.responses) ||
        record.responses.length !== 4 || !record.responses.every((item) => text(item?.questionId) &&
          text(item.optionId) && (item.explanation === undefined || typeof item.explanation === 'string' && item.explanation.length <= 400)) ||
        !text(record.updatedAt) || Number.isNaN(Date.parse(record.updatedAt)) ||
        new Set(record.responses.map((item) => item.questionId)).size !== 4) return false;
    if (record.questionSource === 'ai') {
      const allowed = new Set(samples.cases[record.caseId].topicIds);
      if (!Array.isArray(record.questions) || record.questions.length !== 4 ||
          !ids(record.questions.map((item) => item?.conceptId), allowed, 4, 4) ||
          new Set(record.questions.map((item) => item.id)).size !== 4 ||
          !record.questions.every((item) => text(item.id) && text(item.prompt, 420) &&
            text(item.strength, 220) && text(item.gap, 220) && Array.isArray(item.options) &&
            item.options.length === 3 && new Set(item.options.map((option) => option?.id)).size === 3 &&
            item.options.every((option) => text(option?.id) && text(option.label, 280) &&
              text(option.feedback, 220) && [0, 1, 2].includes(option.score)) &&
            new Set(item.options.map((option) => option.score)).size === 3)) return false;
      const byId = new Map(record.questions.map((item) => [item.id, item]));
      if (!record.responses.every((item) => byId.get(item.questionId)?.options.some((option) => option.id === item.optionId))) return false;
    }
    return validResult(record.result, samples.cases[record.caseId], samples);
  }
  function validLesson(lesson, topicId) {
    return exact(lesson, ['topicId', 'explanation', 'example', 'prompt']) && lesson.topicId === topicId &&
      text(lesson.explanation, 1200) && text(lesson.example, 1000) && text(lesson.prompt, 500);
  }
  function validLessons(lessons, priorities) {
    return Array.isArray(lessons) && lessons.length === priorities.length &&
      ids(lessons.map((lesson) => lesson?.topicId), new Set(priorities), priorities.length, priorities.length) &&
      lessons.every((lesson) => validLesson(lesson, lesson.topicId));
  }
  function validFeedback(result, mode) {
    return result?.aiSource === mode && judgments.includes(result.judgment) &&
      typeof result.needsPractice === 'boolean' &&
      (mode === 'api' ? text(result.explanation) && text(result.practiceFocus, 300) &&
        (result.followUp === null || result.followUp === '' || text(result.followUp, 300)) : text(result.message));
  }
  function validReflection(result, priorities) {
    return result?.aiSource === 'api' && text(result.reflection) &&
      ids(result.needsPractice, new Set(priorities)) && Array.isArray(result.practiceFocus) &&
      result.practiceFocus.length <= 6 && result.practiceFocus.every((item) => text(item, 300));
  }
  function validOutput(output, input, samples) {
    if (!validInput(input, samples) || !output || output.caseId !== input.case.caseId ||
        !['sample', 'api'].includes(output.aiSource) || !output.learning) return false;
    const allowed = new Set(input.case.topicIds);
    const { studiedTopics, needsPractice, practiceFocus, activities, courseSource } = output.learning;
    const summaryKeys = ['studiedTopics', 'needsPractice', 'practiceFocus'];
    return ids(studiedTopics, allowed) && ids(needsPractice, new Set(studiedTopics)) &&
      Array.isArray(practiceFocus) && practiceFocus.every((item) => text(item, 300)) &&
      exact(output, ['aiSource', 'caseId', 'learning']) &&
      (exact(output.learning, summaryKeys) ||
        (exact(output.learning, [...summaryKeys, 'activities', 'courseSource']) &&
          courseSource === (output.aiSource === 'api' ? 'ai-generated' : 'authored-fallback') &&
          studiedTopics.length === input.result.priorities.length &&
          studiedTopics.every((id, index) => id === input.result.priorities[index]) &&
          Array.isArray(activities) && activities.length === studiedTopics.length &&
          activities.every((item, index) => exact(item, ['topicId', 'judgment', 'feedback']) &&
            item.topicId === studiedTopics[index] && judgments.includes(item.judgment) && text(item.feedback, 300))));
  }
  function buildOutput(input, results, mode, reflection, content, samples, courseSource) {
    if (!validInput(input, samples) || !['sample', 'api'].includes(mode)) throw new Error('Invalid learning input or mode.');
    const selected = input.result.priorities;
    if (!(results instanceof Map) || !selected.every((id) => results.has(id))) throw new Error('Learning session is incomplete.');
    if (selected.some((id) => results.get(id)?.aiSource !== mode || typeof results.get(id)?.needsPractice !== 'boolean'))
      throw new Error('Learning feedback is invalid.');
    if (mode === 'api' && (!reflection || reflection.aiSource !== 'api' || !Array.isArray(reflection.needsPractice) ||
        !Array.isArray(reflection.practiceFocus))) throw new Error('AI reflection is incomplete.');
    const needsPractice = mode === 'api'
      ? selected.filter((id) => results.get(id).needsPractice || reflection.needsPractice.includes(id))
      : selected.filter((id) => results.get(id).needsPractice);
    const output = { caseId: input.case.caseId, aiSource: mode, learning: {
      studiedTopics: selected.filter((id) => results.has(id)),
      needsPractice,
      practiceFocus: mode === 'api' ? reflection.practiceFocus : selected.map((id) => content[input.case.caseId][id].focus),
    } };
    if (courseSource) {
      if (mode === 'api' && !output.learning.practiceFocus.length) {
        output.learning.practiceFocus = [...new Set(needsPractice.map((id) => results.get(id).practiceFocus))];
      }
      output.learning.courseSource = courseSource;
      output.learning.activities = selected.map((topicId) => {
        const { judgment, explanation, message } = results.get(topicId);
        return { topicId, judgment, feedback: (explanation || message || '').trim().slice(0, 300) };
      });
    }
    if (!validOutput(output, input, samples)) throw new Error('Learning output failed validation.');
    return output;
  }
  return { validInput, validRecord, validResult, validLesson, validLessons, validFeedback, validReflection, validOutput, buildOutput };
});
