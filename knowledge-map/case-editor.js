(function (root) {
  function updateCase(existing, values, topics, id, checkedDate) {
    const claims = Array.isArray(values.claims) ? structuredClone(values.claims) : existing ? structuredClone(existing.claims) : [];
    if (!Array.isArray(values.claims)) {
    const factIndex = claims.findIndex((claim) => claim.kind === 'source-supported');
    const inferenceIndex = claims.findIndex((claim) => claim.kind === 'teaching-inference');
    const fact = { ...(factIndex >= 0 ? claims[factIndex] : {}), kind: 'source-supported',
      text: values.fact, sourceSection: values.sourceSection };
    const inference = { ...(inferenceIndex >= 0 ? claims[inferenceIndex] : {}), kind: 'teaching-inference',
      text: values.inference };
    if (factIndex >= 0) claims[factIndex] = fact; else claims.push(fact);
    if (inferenceIndex >= 0) claims[inferenceIndex] = inference; else claims.push(inference);
    }

    const links = Array.isArray(values.links) ? structuredClone(values.links) : existing ? structuredClone(existing.links) : [];
    if (!Array.isArray(values.links)) {
    if (links.length) links[0] = { ...links[0], topicId: values.topicId };
    else links.push({ topicId: values.topicId, kind: 'application',
      reason: `This case illustrates ${topics.find((topic) => topic.id === values.topicId)?.title || values.topicId} in practice.` });
    }

    return { ...existing, id: existing?.id || id, title: values.title, date: values.date,
      summary: values.summary, source: { ...existing?.source, title: values.sourceTitle,
        url: values.sourceUrl, publishedDate: values.sourceDate, checkedDate }, claims, links };
  }
  root.SkillLoopCaseEditor = Object.freeze({ updateCase });
})(globalThis);
