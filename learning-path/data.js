/**
 * Shared case data for the four learning-path parts.
 * The same file is loaded by the browser and required by the server, so the
 * case IDs, question IDs, option IDs and concept IDs cannot drift.
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.LearningPathDiagnosisData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Shared cases are kept separate so the original Part 1 practice cases stay
  // untouched. Only these shared cases participate in the Part 2-4 handoff.
  const sharedCases =
    typeof module === 'object' && module.exports
      ? require('./shared-cases.js').cases
      : typeof globalThis !== 'undefined' && globalThis.LearningPathSharedCases
        ? globalThis.LearningPathSharedCases.cases
        : [];

  const knowledgePoints = [
    { id: 'foundations', title: 'Programming foundations' },
    { id: 'requirements', title: 'Requirements and scope' },
    { id: 'code-reading', title: 'Code reading' },
    { id: 'software-testing', title: 'Testing and verification' },
    { id: 'communication', title: 'Communication' },
    { id: 'ai-code-review', title: 'AI code review' },
    { id: 'edge-cases', title: 'Edge cases' },
  ];

  const nextSteps = {
    foundations:
      'Trace one small program line by line and write down the value of each variable.',
    requirements:
      'Rewrite one vague sentence from the case as three testable acceptance criteria.',
    'code-reading':
      'Note the inputs, output and one hidden assumption in the case snippet.',
    'software-testing':
      'List one happy path, one boundary and one failure test before changing the code.',
    communication:
      'Report one bug with steps to reproduce, expected result and actual result.',
    'ai-code-review':
      'Ask an AI suggestion for its failure cases, then check one claim against the code.',
    'edge-cases':
      'Name the empty, duplicate, expired and offline states this case must handle.',
  };

  const legacyCases = [
    {
      id: 'shopping-cart',
      title: 'Shopping cart total',
      tagline: 'Pricing rules, discounts and rounding',
      summary:
        'A cart total applies a coupon and tax. The learner reports a one-cent difference and an expired coupon that still works.',
      snippet:
        "function cartTotal(items, coupon, taxRate) {\n  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const discount = coupon === 'SAVE10' ? subtotal * 0.1 : 0;\n  return (subtotal - discount) * (1 + taxRate);\n}",
      stack: 'JavaScript · pricing',
      knowledgePoints: ['requirements', 'code-reading', 'software-testing', 'edge-cases'],
      questions: [
        {
          id: 'cart-requirements',
          conceptId: 'requirements',
          prompt:
            "The brief says the cart must 'handle discounts fairly'. What is the best next step?",
          strength:
            'A strong answer asks for explicit pricing rules and a rounding policy before coding.',
          gap:
            'Turn expiry, stacking and rounding into testable acceptance criteria before changing the total.',
          options: [
            {
              id: 'clarify-rules',
              score: 2,
              label:
                'Ask for the exact rules: which coupons exist, when they expire, whether they stack, and how the total is rounded.',
              feedback:
                'You turn vague product language into testable rules before touching the code.',
            },
            {
              id: 'code-first',
              score: 1,
              label:
                'Start with a discount field and confirm the rules later when the design is clearer.',
              feedback:
                'You noticed that rules are missing, but coding first records guesses as behaviour.',
            },
            {
              id: 'assume-ten',
              score: 0,
              label:
                'Use 10% off for every coupon because that is the example in the brief.',
              feedback:
                'You treated one example as the whole rule set, which is how the expired-coupon bug survives.',
            },
          ],
        },
        {
          id: 'cart-code-reading',
          conceptId: 'code-reading',
          prompt: 'Which observation about the snippet is most useful for the bug report?',
          strength:
            'A strong answer traces the calculation and names the concrete rule that is missing.',
          gap:
            'Separate observable bugs from style preferences and trace the data path through the function.',
          options: [
            {
              id: 'order-expiry',
              score: 2,
              label:
                'The discount is applied before tax, and the function never checks whether the coupon has expired.',
              feedback:
                'You connect the code path to both reported symptoms instead of reviewing style first.',
            },
            {
              id: 'mixed-concerns',
              score: 1,
              label:
                'The function is short, but it mixes coupon rules and the total calculation in one place.',
              feedback:
                'You spotted a real design issue, though it does not explain the one-cent difference or the expired coupon.',
            },
            {
              id: 'reduce-wrong',
              score: 0,
              label:
                'reduce is the wrong method for summing a cart, so the total must be wrong.',
              feedback:
                'You rejected a correct construct without tracing an incorrect value.',
            },
          ],
        },
        {
          id: 'cart-testing',
          conceptId: 'software-testing',
          prompt: 'Which check would actually catch the one-cent rounding problem?',
          strength:
            'A strong answer compares the result with an independently calculated expected value.',
          gap:
            'Add an independent expected total instead of judging the rendered value by eye.',
          options: [
            {
              id: 'expected-total',
              score: 2,
              label:
                'Calculate an expected total independently for prices that produce fractions of a cent, then compare it with the displayed value.',
              feedback:
                'You verify an exact expected value, which is what exposes a rounding difference.',
            },
            {
              id: 'total-changes',
              score: 1,
              label: 'Check that the total changes when an item is added.',
              feedback:
                'You check a behaviour, but any total would change; this cannot detect a one-cent error.',
            },
            {
              id: 'looks-right',
              score: 0,
              label: 'Open the cart and confirm that the total looks reasonable.',
              feedback:
                'You rely on judgement by eye, which is exactly what a one-cent bug escapes.',
            },
          ],
        },
        {
          id: 'cart-edge-cases',
          conceptId: 'edge-cases',
          prompt: 'Which cart state is the most likely gap in the current tests?',
          strength:
            'A strong answer prioritises expired, empty and repeated-input states.',
          gap:
            'List empty, invalid, expired and repeated-input states before writing tests.',
          options: [
            {
              id: 'risky-states',
              score: 2,
              label:
                'An expired coupon, an empty cart, a quantity of zero and a coupon applied twice.',
              feedback:
                'You selected the states most likely to break the pricing rules.',
            },
            {
              id: 'empty-only',
              score: 1,
              label:
                'An empty cart, because the total should be zero and the page should not crash.',
              feedback:
                'You found one useful boundary but stopped before expired and repeated inputs.',
            },
            {
              id: 'normal-cart',
              score: 0,
              label: 'Two normal items with a valid SAVE10 coupon.',
              feedback:
                'You chose the happy path, which is usually the only state already covered.',
            },
          ],
        },
      ],
    },
    {
      id: 'quiz-platform-permissions',
      title: 'Quiz platform permissions',
      tagline: 'Roles, assignments and visibility',
      summary:
        'Teachers create quizzes, students take assigned quizzes and admins manage roles. A published quiz is visible to every signed-in account.',
      snippet:
        "function canOpenQuiz(user, quiz) {\n  if (user.role === 'teacher') return true;\n  if (quiz.published) return true;\n  return user.id === quiz.ownerId;\n}",
      stack: 'JavaScript · role-based access',
      knowledgePoints: ['requirements', 'code-reading', 'software-testing', 'communication'],
      questions: [
        {
          id: 'quiz-requirements',
          conceptId: 'requirements',
          prompt: 'Before you change canOpenQuiz, which missing requirement matters most?',
          strength:
            'A strong answer defines assignment, revocation and post-close visibility before coding.',
          gap:
            'Write the assignment and revocation rules, including what an unassigned student should see.',
          options: [
            {
              id: 'assignment-rules',
              score: 2,
              label:
                'How quizzes are assigned and revoked, what an unassigned student should see, and whether answers stay hidden after a quiz closes.',
              feedback:
                'You identified the rules that turn a role check into a real access policy.',
            },
            {
              id: 'auth-choice',
              score: 1,
              label: 'Whether the app should keep using email and password sign-in.',
              feedback:
                'You considered authentication, but the reported leak is about authorisation after sign-in.',
            },
            {
              id: 'badge-colour',
              score: 0,
              label: 'Which colour the role badge should use.',
              feedback:
                'You focused on presentation while the access rule is still undefined.',
            },
          ],
        },
        {
          id: 'quiz-code-reading',
          conceptId: 'code-reading',
          prompt: 'What is the most important flaw in canOpenQuiz?',
          strength:
            'A strong answer points to the exact branch that grants access without checking assignment.',
          gap:
            'Trace which branch runs for each role and state instead of reviewing only the function name.',
          options: [
            {
              id: 'published-leak',
              score: 2,
              label:
                'Any signed-in user can open any published quiz; neither assignment nor the student role is checked.',
              feedback:
                'You traced the published branch and connected it to the reported leak.',
            },
            {
              id: 'teacher-shortcut',
              score: 1,
              label:
                'The teacher shortcut is too permissive because teachers should only see their own quizzes.',
              feedback:
                'You found a related policy question, but the student leak is the urgent defect.',
            },
            {
              id: 'missing-title',
              score: 0,
              label: 'The function never validates the quiz title.',
              feedback:
                'You checked an input that does not decide who is allowed to open the quiz.',
            },
          ],
        },
        {
          id: 'quiz-testing',
          conceptId: 'software-testing',
          prompt: 'Which test set best checks the permission rules?',
          strength:
            'A strong answer tests the role-by-state matrix, including the negative cases.',
          gap:
            'Cover each role against assigned, unassigned and unpublished states, not just the happy path.',
          options: [
            {
              id: 'role-matrix',
              score: 2,
              label:
                'A role-by-state matrix covering teacher, admin, assigned student, unassigned student and an unpublished quiz.',
              feedback:
                'You test the combinations that decide access, including the cases that must be denied.',
            },
            {
              id: 'teacher-happy',
              score: 1,
              label: 'Log in as the teacher and open one published quiz.',
              feedback:
                'You verified one allowed path but not the restriction that failed.',
            },
            {
              id: 'login-page',
              score: 0,
              label: 'Check that the login page loads in a private window.',
              feedback:
                'You tested page delivery rather than the permission decision.',
            },
          ],
        },
        {
          id: 'quiz-communication',
          conceptId: 'communication',
          prompt:
            'You find that any student can open a published quiz. What is the most useful message to your team?',
          strength:
            'A strong report states the rule, reproduction steps and a concrete missing check.',
          gap:
            'Give the team a reproducible case and a proposed fix instead of only naming the symptom.',
          options: [
            {
              id: 'reproduce-and-propose',
              score: 2,
              label:
                'Describe the broken rule, give the exact steps and accounts that reproduce it, and propose the missing assignment check.',
              feedback:
                'You make the defect reproducible and give the team a concrete next step.',
            },
            {
              id: 'rewrite-silently',
              score: 1,
              label:
                'Rewrite the whole permission file silently and let the pull request explain itself.',
              feedback:
                'You may fix the code, but reviewers cannot see the broken behaviour or verify the intended rule.',
            },
            {
              id: 'vague-alert',
              score: 0,
              label: "Post 'permissions are broken' in the group chat.",
              feedback:
                'You reported a symptom without evidence, impact or a request for a decision.',
            },
          ],
        },
      ],
    },
    {
      id: 'note-saving',
      title: 'Note saving',
      tagline: 'Autosave, offline state and conflicts',
      summary:
        'A note editor autosaves shortly after typing and syncs when the connection returns. A refresh can lose the last edit, and two tabs can overwrite each other.',
      snippet:
        "let note = '';\nlet timer;\nfunction onInput(text) {\n  note = text;\n  clearTimeout(timer);\n  timer = setTimeout(() => save(note), 400);\n}\nwindow.addEventListener('beforeunload', () => save(note));",
      stack: 'JavaScript · local storage · sync',
      knowledgePoints: ['code-reading', 'edge-cases', 'software-testing', 'ai-code-review'],
      questions: [
        {
          id: 'note-code-reading',
          conceptId: 'code-reading',
          prompt: 'What risk does this autosave code leave open?',
          strength:
            'A strong answer links the pending timer and missing version check to data loss.',
          gap:
            'Trace what happens to the pending timer on unload and to two tabs writing the same note.',
          options: [
            {
              id: 'pending-tab-risk',
              score: 2,
              label:
                'A pending timer can be dropped when the page closes, and two tabs can overwrite each other because no version is checked.',
              feedback:
                'You connected the timer lifecycle and concurrent writes to the reported data loss.',
            },
            {
              id: 'save-every-key',
              score: 1,
              label: 'Saving on every keystroke would remove the need for a timer.',
              feedback:
                'You noticed the delay, but saving every keystroke adds load and does not solve unload or tab conflicts.',
            },
            {
              id: 'use-const',
              score: 0,
              label: 'note should be declared with const so the editor cannot change it.',
              feedback:
                'You applied a style rule that contradicts how the editor stores input.',
            },
          ],
        },
        {
          id: 'note-edge-cases',
          conceptId: 'edge-cases',
          prompt: 'Which scenario belongs at the top of the note-saving checklist?',
          strength:
            'A strong checklist covers offline, unload-before-save and concurrent-tab states.',
          gap:
            'Prioritise the states that lose data: offline, immediate reload and two editors.',
          options: [
            {
              id: 'offline-reload-tabs',
              score: 2,
              label:
                'Typing while offline, reloading before the 400 ms save fires, and editing the same note in two tabs.',
              feedback:
                'You selected the states that match the reported data-loss symptoms.',
            },
            {
              id: 'one-character',
              score: 1,
              label: 'Saving a note that contains exactly one character.',
              feedback:
                'You found a boundary case, but it is less likely to lose the learner edit described here.',
            },
            {
              id: 'wide-monitor',
              score: 0,
              label: 'Opening the editor on a very wide monitor.',
              feedback:
                'You tested layout rather than the save lifecycle.',
            },
          ],
        },
        {
          id: 'note-testing',
          conceptId: 'software-testing',
          prompt: 'How should you verify that a failed save is not silent?',
          strength:
            'A strong check forces a rejection and inspects the visible state and retry behaviour.',
          gap:
            'Simulate a rejected save and verify the error, draft retention and duplicate prevention.',
          options: [
            {
              id: 'rejected-save',
              score: 2,
              label:
                'Make save reject, then check that the UI shows an error, keeps the draft and retries without creating duplicates.',
              feedback:
                'You test the failure path and its user-visible consequences.',
            },
            {
              id: 'reload-only',
              score: 1,
              label: 'Reload the page and see whether the note is still there.',
              feedback:
                'You check persistence after success, but not what the learner sees when saving fails.',
            },
            {
              id: 'button-colour',
              score: 0,
              label: 'Check that the save button changes colour after a successful save.',
              feedback:
                'You inspected a success signal, which says nothing about a silent failure.',
            },
          ],
        },
        {
          id: 'note-ai-review',
          conceptId: 'ai-code-review',
          prompt:
            "An AI assistant suggests: 'Just call save() ten times on any error.' What is the best review response?",
          strength:
            'A strong review asks for failure modes, bounded retries and visible state before accepting AI code.',
          gap:
            'Test the AI suggestion against offline, oversized-note and exhausted-retry cases.',
          options: [
            {
              id: 'bounded-review',
              score: 2,
              label:
                'Ask what happens when the note is too large, the user is offline or every retry fails; require a bounded retry and visible state.',
              feedback:
                'You reviewed the suggestion against real failure modes instead of trusting repetition.',
            },
            {
              id: 'remove-catch',
              score: 1,
              label: 'Reject retries completely and remove the catch block.',
              feedback:
                'You avoided the bad suggestion but also removed the chance to report a failure.',
            },
            {
              id: 'more-retries',
              score: 0,
              label: 'Accept it because more retries always make saving more reliable.',
              feedback:
                'You accepted repetition as a reliability strategy without a failure limit or user feedback.',
            },
          ],
        },
      ],
    },
  ];

  const cases = [...legacyCases, ...sharedCases];
  const sharedCaseIds = sharedCases.map((item) => item.id);

  function isSharedCase(caseId) {
    return sharedCaseIds.includes(caseId);
  }

  function findCase(caseId) {
    return cases.find((item) => item.id === caseId) || null;
  }

  function findQuestion(caseData, questionId) {
    if (!caseData) return null;
    return caseData.questions.find((item) => item.id === questionId) || null;
  }

  function knowledgePoint(conceptId) {
    return knowledgePoints.find((item) => item.id === conceptId) || null;
  }

  return {
    schemaVersion: 1,
    knowledgePoints,
    nextSteps,
    cases,
    sharedCaseIds,
    isSharedCase,
    findCase,
    findQuestion,
    knowledgePoint,
  };
});
