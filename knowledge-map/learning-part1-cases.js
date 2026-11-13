/* Module 2 snapshot of the three Part 1 briefs in origin/feature/learning-path-ai-assessment:learning-path/data.js.
 * Handoff IDs/topic sets are authoritative. Reconcile this snapshot when Part 1's uncommitted code is merged. */
const SkillLoopPart1Cases = {
  'shopping-cart': { caseId: 'shopping-cart', title: 'Shopping cart total',
    summary: 'A cart total applies a coupon and tax. The learner reports a one-cent difference and an expired coupon that still works.',
    starterCode: "function cartTotal(items, coupon, taxRate) {\n  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const discount = coupon === 'SAVE10' ? subtotal * 0.1 : 0;\n  return (subtotal - discount) * (1 + taxRate);\n}",
    topicIds: ['requirements', 'code-reading', 'software-testing', 'edge-cases'] },
  'quiz-platform-permissions': { caseId: 'quiz-platform-permissions', title: 'Quiz platform permissions',
    summary: 'Teachers create quizzes, students take assigned quizzes and admins manage roles. A published quiz is visible to every signed-in account.',
    starterCode: "function canOpenQuiz(user, quiz) {\n  if (user.role === 'teacher') return true;\n  if (quiz.published) return true;\n  return user.id === quiz.ownerId;\n}",
    topicIds: ['requirements', 'code-reading', 'software-testing', 'communication'] },
  'note-saving': { caseId: 'note-saving', title: 'Note saving',
    summary: 'A note editor autosaves shortly after typing and syncs when the connection returns. A refresh can lose the last edit, and two tabs can overwrite each other.',
    starterCode: "let note = '';\nlet timer;\nfunction onInput(text) {\n  note = text;\n  clearTimeout(timer);\n  timer = setTimeout(() => save(note), 400);\n}\nwindow.addEventListener('beforeunload', () => save(note));",
    topicIds: ['code-reading', 'edge-cases', 'software-testing', 'ai-code-review'] },
};
if (typeof module === 'object' && module.exports) module.exports = SkillLoopPart1Cases;
if (typeof window !== 'undefined') window.SkillLoopPart1Cases = SkillLoopPart1Cases;
