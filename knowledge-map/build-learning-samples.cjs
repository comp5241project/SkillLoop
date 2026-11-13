/* Module 2 standalone fixtures; never used as a fallback for a missing Part 1 record. */
const fs = require('node:fs');
const path = require('node:path');
const cases = require('./learning-part1-cases.js');
const { topics } = require('../docs/team-samples/samples.json');
const priorities = {
  'cart-checkout': ['requirements', 'software-testing'],
  'quiz-permissions': ['ai-code-review', 'communication'],
  'notes-save': ['edge-cases', 'code-reading'],
};
const samples = Object.fromEntries(Object.values(cases).map((item) => [item.caseId, { part2: { input: {
  case: item,
  result: {
    caseId: item.caseId, overall: { level: 'developing', summary: `Sample diagnosis for ${item.title}.` },
    dimensions: item.topicIds.map((conceptId) => ({ conceptId, level: 'developing',
      evidence: 'Sample learner response', strength: 'A relevant idea was observed.', gap: `Apply ${conceptId} to this case.` })),
    priorities: priorities[item.caseId], nextSteps: ['Explain the expected behavior.', 'Ask for a check that could reveal a remaining defect.'],
  },
} } }]));
const target = path.join(__dirname, 'learning-samples.js');
fs.writeFileSync(target, `/* Generated Module 2 standalone Sample data. Not a Part 1 diagnosis record. */\nwindow.SkillLoopSamples = ${JSON.stringify({ topics, cases, samples }, null, 2)};\n`);
