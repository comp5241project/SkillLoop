/** Small handoff helpers. Feature pages keep their own UI and AI implementation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkillLoopFlow = api;
})(globalThis, function () {
  function learningRecord(store, caseId) {
    const diagnosis = store.read('learningPathDiagnosis', null);
    const learned = store.read('learningResult', null);
    if (!diagnosis || !learned || diagnosis.caseId !== caseId || learned.output?.caseId !== caseId ||
        learned.diagnosisUpdatedAt !== diagnosis.updatedAt) return null;
    return { diagnosis, learned };
  }
  function dialogueInput(store, catalog, caseId) {
    const record = learningRecord(store, caseId);
    if (!record || !catalog.cases[caseId]) return null;
    const { diagnosis, learned } = record;
    const result = diagnosis.result;
    return {
      case: catalog.cases[caseId],
      assessment: {
        summary: result.overall.summary + '\n' + result.dimensions.map(d => `${d.conceptId}: ${d.gap}`).join('\n'),
        // Diagnosis rates knowledge dimensions, not these four dialogue behaviors.
        // Preserve its evidence instead of inventing a skill-level conversion.
        skills: { detect: 'not_observed', explain: 'not_observed', instruct: 'not_observed', verify: 'not_observed' },
        weakTopics: result.priorities,
      },
      learning: learned.output.learning,
    };
  }
  function saveLearning(store, input, output) {
    const diagnosis = store.read('learningPathDiagnosis', null);
    if (!diagnosis || diagnosis.caseId !== output.caseId || JSON.stringify(diagnosis.result) !== JSON.stringify(input.result)) return false;
    return store.write('learningResult', { diagnosisUpdatedAt: diagnosis.updatedAt, completedAt: new Date().toISOString(), output });
  }
  function clearLearning(store, caseId) {
    if (store.read('learningResult', null)?.output?.caseId === caseId) store.write('learningResult', null);
  }
  function savePlan(store, output, learningCompletedAt = null) {
    const plans = store.read('repairPlans', {});
    plans[output.caseId] = { output, learningCompletedAt };
    return store.write('repairPlans', plans);
  }
  function invalidatePlan(store, caseId) {
    const plans = store.read('repairPlans', {});
    // Keep a tombstone so an older standalone plan cannot reappear as a fallback.
    plans[caseId] = null;
    return store.write('repairPlans', plans);
  }
  function readPlan(store, caseId) {
    const record = store.read('repairPlans', {})[caseId];
    if (!record) return null;
    if (record.learningCompletedAt && learningRecord(store, caseId)?.learned.completedAt !== record.learningCompletedAt) return null;
    return record.output;
  }
  return { learningRecord, dialogueInput, saveLearning, clearLearning, savePlan, invalidatePlan, readPlan };
});
