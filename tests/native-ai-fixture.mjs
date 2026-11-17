import './enhancement-v3-ai-fixture.mjs';
import { nativeCase } from '../enhancement-v3/native/cases.mjs';

const inherited = globalThis.fetch;
const reply = value => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
const shapedCase = id => nativeCase({ caseId: id, caseVersion: 1, conceptId: 'edge-cases' });
globalThis.fetch = async (url, init) => {
  if (url !== 'https://v3-fixture.invalid/v1/chat/completions') return inherited(url, init);
  const { messages } = JSON.parse(init.body);
  const system = messages[0].content;
  const user = messages[1].content;
  if (user.startsWith('Write a fresh set') || user.startsWith('Diagnose part 1')) {
    const delimiter = user.startsWith('Write') ? '\n\nGeneration rules:' : '\n\nOutput requirements:';
    const task = JSON.parse(user.slice(user.indexOf('{'), user.indexOf(delimiter)));
    if (user.startsWith('Write')) {
      const native = shapedCase(task.case.caseId);
      return reply({ caseId: task.case.caseId, questions: native.diagnosis.questions.map(q => ({
        conceptId: q.conceptId, prompt: q.prompt, strength: q.strength, gap: q.gap,
        options: q.options.map(({ score, label, feedback }) => ({ quality: ['off','partial','best'][score], label, feedback })),
      })) });
    }
    const first = task.case.caseId === 'retry-queue' ? 'edge-cases' : 'code-reading';
    const priorities = [first, task.knowledgePointsInScope.find(t => t.conceptId !== first).conceptId];
    return reply({ caseId: task.case.caseId, overall: { level: 'developing', summary: 'Review the boundary inputs using the published requirements.' },
      dimensions: task.studentResponses.map(r => ({ conceptId: r.conceptId, level: 'developing', evidence: r.selectedOption,
        strength: 'The answer focuses on an observable behavior.', gap: 'Explain how a boundary differs from an ordinary input.' })),
      priorities, nextSteps: ['Trace a boundary input.', 'Explain the expected result.'] });
  }
  let input;
  try { input = JSON.parse(user); } catch { input = null; }
  if (input?.fragments?.some(f => f.text.includes('first retry is attempt zero'))) {
    const count = input.fragments.find(f => f.text.includes('Only nonnegative'));
    const cap = input.fragments.find(f => f.text.includes('capped at 1,000 milliseconds'));
    return reply({ title: 'Retry queue boundaries', summary: 'Check the delay cap and reject invalid counts in the queue.',
      level: 'beginner', objectives: ['Compute the retry delay at the cap.', 'Reject invalid attempt counts.'],
      notes: [{ id: 'note-cap', heading: 'Delay cap', text: 'The exponential delay cannot exceed one thousand milliseconds.',
        citations: [{ fragmentId: cap.id, quote: 'capped at 1,000 milliseconds.' }] },
      { id: 'note-count', heading: 'Valid attempt counts', text: 'Only nonnegative integer attempt counts, starting from zero, are valid.',
        citations: [{ fragmentId: count.id, quote: 'Only nonnegative integers are valid attempt counts' }] }],
      questions: [] });
  }
  if (input?.candidates && input.notes.some(note => note.id === 'note-count')) {
    return reply({ matches: [{ caseId: 'retry-queue', reason: 'Both retry boundaries are directly supported by the notes.',
      mapping: [{ objectiveIndex: 0, requirementId: 'backoff-cap', noteIds: ['note-cap'], reason: 'The note states the delay cap.' },
        { objectiveIndex: 1, requirementId: 'attempt-count', noteIds: ['note-count'], reason: 'The note explains valid attempt counts.' }], concerns: [] }] });
  }
  if (input?.topics && input.case?.caseId) return reply({ lessons: Object.fromEntries(input.topics.map(({ topicId, approvedNotes }) => [topicId, {
    explanation: approvedNotes[0].text, example: input.case.scenario,
    prompt: 'Compare one ordinary input and one boundary case using the teacher notes.',
  }])) });
  if (system.includes('Review the answer against the pinned case')) {
    if (input.answer === 'Force model failure') return new Response('{}', { status: 503 });
    return reply({ judgment: 'correct', explanation: 'You linked the input to the expected behavior.', followUp: null,
      needsPractice: false, practiceFocus: 'Explain one boundary test.' });
  }
  if (input?.observations && system.includes('validated observations')) return reply({
    reflection: 'Compare the observations with the case requirements.',
  });
  if (system.includes('Generate the FIRST message')) return reply({
    reply: 'I delivered this starter implementation for review. The public requirements describe the behavior expected from this code. Please select one input and walk me through what the current implementation does.',
    code: '',
  });
  if (system.includes('Continue the actual conversation')) return reply({
    intent: 'explain', reply: 'Compare that boundary input with the requirement and write the expected behavior in your repair request.',
    coach: '', proposal: '', proposalCode: '', updates: [], rejected: [],
  });
  if (system.includes('Summarize a completed SkillLoop')) return reply({
    feedback: 'The review compared boundary behavior with the published requirements. Confirm that the requests cover each issue before running verification.',
  });
  if (system.includes('Review only these recorded test results')) return reply({
    aiReview: 'The saved test run compared the submitted JavaScript with the case requirements.', reviewTopics: [],
  });
  return inherited(url, init);
};
