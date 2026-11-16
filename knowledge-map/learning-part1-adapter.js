(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkillLoopPart1Adapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function catalog(topics, part1Data) {
    const cases = Object.fromEntries(part1Data.cases.map((item) => [item.id, {
      caseId: item.id, title: item.title, summary: item.summary,
      starterCode: item.snippet, topicIds: item.knowledgePoints,
    }]));
    return { topics, cases };
  }

  function priorityTarget(pageUrl, referrer, record) {
    if (!referrer || record?.schemaVersion !== 2 || !record.caseId ||
        record.caseId !== record.result?.caseId || !Array.isArray(record.result.priorities)) return null;
    const from = new URL(referrer);
    const page = new URL(pageUrl);
    if (from.origin !== page.origin || !['/learning-path', '/learning-path/', '/learning-path/index.html'].includes(from.pathname) ||
        page.searchParams.get('graph') !== 'software-development' || page.searchParams.has('version') ||
        page.searchParams.has('draftPreview')) return null;
    const topic = page.searchParams.get('topic');
    return /^[a-z][a-z0-9-]{0,63}$/.test(topic || '') && record.result.priorities.includes(topic)
      ? `/knowledge-map/#topic-${topic}` : null;
  }

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
  return { catalog, fromRecord, read, priorityTarget };
});
