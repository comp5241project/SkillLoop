/**
 * Pure diagnosis logic shared by the browser and the server tests.
 * No DOM, storage or network access belongs in this file.
 */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.LearningPathDiagnosisModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEVELS = ['foundation', 'developing', 'ready'];
  const MAX_EXPLANATION = 400;
  const MAX_EVIDENCE = 240;
  const MAX_FEEDBACK = 220;
  const MAX_STEP = 180;
  const MAX_QUESTION_ID = 120;
  const MAX_OPTION_ID = 60;
  const MAX_PROMPT = 420;
  const MAX_OPTION = 280;

  function normalize(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripWrappingQuotes(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/^["'“”‘’]+/, '')
      .replace(/["'“”‘’]+$/, '')
      .trim();
  }

  function truncate(value, limit) {
    const text = String(value == null ? '' : value).trim();
    return text.length <= limit ? text : text.slice(0, limit - 1).trimEnd() + '…';
  }

  function levelFromScore(score) {
    if (score >= 2) return 'ready';
    if (score === 1) return 'developing';
    return 'foundation';
  }

  function levelRank(level) {
    return LEVELS.indexOf(level);
  }

  function findResponse(caseData, responses, conceptId) {
    const question = caseData.questions.find((item) => item.conceptId === conceptId);
    if (!question) return null;
    const response = (responses || []).find((item) => item && item.questionId === question.id);
    if (!response) return null;
    const option = question.options.find((item) => item.id === response.optionId);
    if (!option) return null;
    return { question, option, response };
  }

  function buildLocalDiagnosis(caseData, responses) {
    const dimensions = caseData.questions.map((question) => {
      const response = (responses || []).find((item) => item && item.questionId === question.id);
      const option = response
        ? question.options.find((item) => item.id === response.optionId)
        : null;
      if (!option) {
        throw new Error('Every question needs a valid option before diagnosis.');
      }
      const explanation = String(response.explanation || '').trim();
      const evidence = truncate(explanation || option.label, MAX_EVIDENCE);
      return {
        conceptId: question.conceptId,
        level: levelFromScore(option.score),
        evidence,
        strength:
          option.score === 2
            ? truncate(option.feedback, MAX_FEEDBACK)
            : truncate('Not yet evidenced. ' + question.strength, MAX_FEEDBACK),
        gap:
          option.score === 2
            ? 'No gap flagged by this check. Confirm it with a hands-on task.'
            : truncate(option.feedback + ' ' + question.gap, MAX_FEEDBACK),
      };
    });

    const total = caseData.questions.reduce((sum, question) => {
      const response = (responses || []).find((item) => item && item.questionId === question.id);
      const option = response
        ? question.options.find((item) => item.id === response.optionId)
        : null;
      return sum + (option ? option.score : 0);
    }, 0);
    const ratio = total / (caseData.questions.length * 2);
    const level = ratio >= 0.75 ? 'ready' : ratio >= 0.35 ? 'developing' : 'foundation';
    const summaries = {
      ready:
        'Your answers give consistent evidence across the four checks in "' +
        caseData.title +
        '". Use the correction task to defend the same decisions against a flawed AI answer.',
      developing:
        'You have a workable start on "' +
        caseData.title +
        '", but the evidence is uneven across the four checks. Close the priority gaps before the correction task.',
      foundation:
        'The four checks expose several gaps in "' +
        caseData.title +
        '". Start with the priority knowledge points, then retry this diagnosis.',
    };

    const priorities = dimensions
      .slice()
      .sort((a, b) => levelRank(a.level) - levelRank(b.level))
      .slice(0, 2)
      .map((item) => item.conceptId);
    const nextSteps = priorities.map((conceptId) => {
      const found = findResponse(caseData, responses, conceptId);
      return truncate(found ? found.question.gap : 'Revisit this knowledge point.', MAX_STEP);
    });
    nextSteps.push(
      'Open the priority concept in the skill map, then bring this case to part 2.'
    );

    return {
      caseId: caseData.id,
      overall: { level, summary: truncate(summaries[level], 500) },
      dimensions,
      priorities,
      nextSteps,
    };
  }

  function validText(value, limit) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
  }

  /**
   * Validate any question set used by a diagnosis: the authored fallback or an
   * AI-generated set sent back by the browser. The same rules run in the browser
   * and on the server so neither side can diagnose against a malformed set.
   */
  function validateQuestions(questions, caseData) {
    const fail = (error) => ({ ok: false, error });
    if (!caseData || !Array.isArray(caseData.knowledgePoints)) {
      return fail('Case data is missing knowledge points.');
    }
    if (!Array.isArray(questions)) {
      return fail('Questions must be an array.');
    }
    if (questions.length !== caseData.knowledgePoints.length) {
      return fail('The question set must contain exactly one check per knowledge point.');
    }

    const seenConcepts = new Set();
    const seenIds = new Set();
    const seenPrompts = new Set();
    for (const question of questions) {
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        return fail('Each question must be an object.');
      }
      if (
        !validText(question.id, MAX_QUESTION_ID) ||
        !/^[a-z0-9][a-z0-9-]*$/i.test(question.id)
      ) {
        return fail('Each question needs a stable ID of 1-120 letters, numbers or hyphens.');
      }
      if (seenIds.has(question.id)) {
        return fail('Question IDs must be unique.');
      }
      seenIds.add(question.id);
      if (!caseData.knowledgePoints.includes(question.conceptId)) {
        return fail('Each question needs a conceptId from this case.');
      }
      if (seenConcepts.has(question.conceptId)) {
        return fail('Each knowledge point can only have one question.');
      }
      seenConcepts.add(question.conceptId);
      if (!validText(question.prompt, MAX_PROMPT)) {
        return fail('Each question prompt must be 1-420 characters.');
      }
      const promptKey = normalize(question.prompt);
      if (seenPrompts.has(promptKey)) {
        return fail('Question prompts must be unique.');
      }
      seenPrompts.add(promptKey);
      for (const field of ['strength', 'gap']) {
        if (!validText(question[field], MAX_FEEDBACK)) {
          return fail('Question strength and gap must be 1-220 characters.');
        }
      }
      if (!Array.isArray(question.options) || question.options.length !== 3) {
        return fail('Each question must have exactly three options.');
      }

      const seenOptionIds = new Set();
      const seenLabels = new Set();
      const scores = new Set();
      for (const option of question.options) {
        if (!option || typeof option !== 'object' || Array.isArray(option)) {
          return fail('Each option must be an object.');
        }
        if (
          !validText(option.id, MAX_OPTION_ID) ||
          !/^[a-z0-9][a-z0-9-]*$/i.test(option.id)
        ) {
          return fail('Each option needs a stable ID of 1-60 letters, numbers or hyphens.');
        }
        if (seenOptionIds.has(option.id)) {
          return fail('Option IDs must be unique within a question.');
        }
        seenOptionIds.add(option.id);
        if (!validText(option.label, MAX_OPTION)) {
          return fail('Each option label must be 1-280 characters.');
        }
        const labelKey = normalize(option.label);
        if (seenLabels.has(labelKey)) {
          return fail('Option labels must be distinct within a question.');
        }
        seenLabels.add(labelKey);
        if (!validText(option.feedback, MAX_FEEDBACK)) {
          return fail('Each option needs feedback of 1-220 characters.');
        }
        if (![0, 1, 2].includes(option.score)) {
          return fail('Each option score must be 0, 1 or 2.');
        }
        if (scores.has(option.score)) {
          return fail('Each question needs one best, one partial and one off-target option.');
        }
        scores.add(option.score);
      }
      if (!scores.has(2)) {
        return fail('Each question needs one best option.');
      }
    }
    if (seenConcepts.size !== caseData.knowledgePoints.length) {
      return fail('Every knowledge point needs exactly one question.');
    }
    return { ok: true };
  }

  function validateResult(result, caseData, responses) {
    const fail = (error) => ({ ok: false, error });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return fail('Diagnosis must be a JSON object.');
    }
    if (result.caseId !== caseData.id) {
      return fail('Diagnosis caseId does not match the selected case.');
    }
    if (!result.overall || typeof result.overall !== 'object') {
      return fail('Diagnosis overall field is missing.');
    }
    if (!LEVELS.includes(result.overall.level)) {
      return fail('Diagnosis overall level is invalid.');
    }
    if (
      typeof result.overall.summary !== 'string' ||
      result.overall.summary.trim().length === 0 ||
      result.overall.summary.length > 500
    ) {
      return fail('Diagnosis overall summary must be 1-500 characters.');
    }
    if (!Array.isArray(result.dimensions)) {
      return fail('Diagnosis dimensions must be an array.');
    }
    if (result.dimensions.length !== caseData.knowledgePoints.length) {
      return fail('Diagnosis must contain exactly one dimension per knowledge point.');
    }

    const seen = new Set();
    const evidenceByConcept = {};
    for (const conceptId of caseData.knowledgePoints) {
      const found = findResponse(caseData, responses, conceptId);
      if (found) {
        evidenceByConcept[conceptId] = {
          option: normalize(found.option.label),
          explanation: normalize(found.response.explanation),
        };
      }
    }

    for (const dimension of result.dimensions) {
      if (!dimension || typeof dimension !== 'object') {
        return fail('Each diagnosis dimension must be an object.');
      }
      if (!caseData.knowledgePoints.includes(dimension.conceptId)) {
        return fail('Diagnosis contains an unknown conceptId.');
      }
      if (seen.has(dimension.conceptId)) {
        return fail('Diagnosis contains a duplicate conceptId.');
      }
      seen.add(dimension.conceptId);
      if (!LEVELS.includes(dimension.level)) {
        return fail('Diagnosis dimension level is invalid.');
      }
      if (
        typeof dimension.evidence !== 'string' ||
        dimension.evidence.trim().length === 0 ||
        dimension.evidence.length > MAX_EVIDENCE
      ) {
        return fail('Diagnosis evidence must be a quote of 1-240 characters.');
      }
      const source = evidenceByConcept[dimension.conceptId];
      const quote = normalize(stripWrappingQuotes(dimension.evidence));
      const quoted =
        source && (source.option.includes(quote) || source.explanation.includes(quote));
      if (!quote || !quoted) {
        return fail('Diagnosis evidence must quote the selected option or the learner explanation.');
      }
      for (const field of ['strength', 'gap']) {
        if (
          typeof dimension[field] !== 'string' ||
          dimension[field].trim().length === 0 ||
          dimension[field].length > MAX_FEEDBACK
        ) {
          return fail('Diagnosis strength and gap must be 1-220 characters.');
        }
      }
    }

    if (
      !Array.isArray(result.priorities) ||
      result.priorities.length < 1 ||
      result.priorities.length > 3
    ) {
      return fail('Diagnosis priorities must contain 1-3 concept IDs.');
    }
    const prioritySet = new Set(result.priorities);
    if (prioritySet.size !== result.priorities.length) {
      return fail('Diagnosis priorities must be unique.');
    }
    for (const conceptId of result.priorities) {
      if (!caseData.knowledgePoints.includes(conceptId)) {
        return fail('Diagnosis priorities contain an unknown conceptId.');
      }
    }

    if (
      !Array.isArray(result.nextSteps) ||
      result.nextSteps.length < 2 ||
      result.nextSteps.length > 4
    ) {
      return fail('Diagnosis nextSteps must contain 2-4 actions.');
    }
    for (const step of result.nextSteps) {
      if (typeof step !== 'string' || step.trim().length === 0 || step.length > MAX_STEP) {
        return fail('Each next step must be 1-180 characters.');
      }
    }

    return { ok: true };
  }

  return {
    LEVELS,
    MAX_EXPLANATION,
    MAX_EVIDENCE,
    MAX_FEEDBACK,
    MAX_STEP,
    MAX_QUESTION_ID,
    MAX_OPTION_ID,
    MAX_PROMPT,
    MAX_OPTION,
    normalize,
    stripWrappingQuotes,
    truncate,
    levelFromScore,
    levelRank,
    buildLocalDiagnosis,
    validateQuestions,
    validateResult,
  };
});
