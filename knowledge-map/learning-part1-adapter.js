(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkillLoopPart1Adapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fromRecord(record, samples, contract, part1Data) {
    if (!contract.validRecord(record, samples)) throw new Error('Part 1 diagnosis is missing or invalid. Return to My path and complete the diagnosis.');
    const selectedCase = samples.cases[record.caseId];
    if (part1Data?.findCase) {
      const current = part1Data.findCase(record.caseId);
      if (!current || current.summary !== selectedCase.summary || current.snippet !== selectedCase.starterCode ||
          JSON.stringify(current.knowledgePoints) !== JSON.stringify(selectedCase.topicIds))
        throw new Error('Part 1 case materials differ from this learning module. Update the case snapshot before continuing.');
    }
    return { case: selectedCase, result: record.result };
  }
  function read(storage, samples, contract, part1Data) {
    if (!storage || typeof storage.read !== 'function') throw new Error('Part 1 diagnosis storage is unavailable.');
    return fromRecord(storage.read('learningPathDiagnosis', null), samples, contract, part1Data);
  }
  return { fromRecord, read };
});
