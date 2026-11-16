window.SkillLoopLearningFeedback = {
  async request(body) {
    const response = await fetch('/api/knowledge-learning', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('The learning service returned an unreadable response.'); }
    if (!response.ok) throw new Error(payload.message || 'The learning service is unavailable.');
    return payload.result;
  },
  async generateLessons(input) {
    return this.request({ action: 'generate-lessons', input });
  },
  async evaluate({ exercise, answer, mode = 'sample', input, topicId, lesson, authored = false }) {
    if (mode === 'api') return this.request({
      action: 'feedback', input, topicId, answer: String(answer), observations: null, ...(lesson ? { lesson } : {}),
    });
    const normalized = String(answer).trim().toLowerCase();
    const correct = exercise.kind === 'choice'
      ? Number(answer) === exercise.correct
      : exercise.terms.every((group) => group.some((term) => normalized.includes(term)));
    const label = authored ? 'Prewritten feedback: ' : 'Sample feedback: ';
    return { aiSource: 'sample', judgment: correct ? 'correct' : 'incomplete', needsPractice: !correct,
      followUp: null, practiceFocus: '',
      message: label + (correct ? 'Your answer addresses the key check. Explain how it follows from the case brief.'
        : 'Revisit the requirement and the code example. This topic is marked for further practice.') };
  },
  async reflect({ mode, input, observations }) {
    if (mode !== 'api') throw new Error('Live AI mode required.');
    return this.request({ action: 'reflection', input, topicId: null, answer: null, observations });
  },
};
