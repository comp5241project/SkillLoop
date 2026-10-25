/**
 * Authored correction cases for module 4, based on the COMP5241 lecture topics.
 * Each case shows an AI answer as numbered lines. Indexes below are 0-based line numbers.
 * - flaws: lines the learner should flag. related: lines that are acceptable to flag too.
 * - cause and apply: multiple-choice questions; `answer` is the index of the correct option.
 * - fix: reference explanation and criteria for the learner's own written fix (self-checked).
 * Keep case IDs stable: saved progress and activity use them.
 * conceptId must be one of the shared concept IDs in docs/DATA-CONTRACTS.md.
 */
window.SkillLoopCases = [
  {
    id: 'untestable-requirements',
    topic: 'Software engineering fundamentals',
    name: 'Requirements nobody can test',
    kind: 'Requirements',
    source: 'Software testing · SDLC',
    conceptId: 'requirements',
    title: 'Are these requirements ready to build?',
    question: 'Turn the client brief into requirements for our quiz app.',
    format: 'text',
    lines: [
      'R1. The app should be user friendly.',
      'R2. A learner can start a 10-question quiz from the home page.',
      'R3. Feedback should usually appear quickly.',
      'R4. After the last question, the app shows the score out of 10.',
      'R5. The app shall work well on mobile phones.',
    ],
    flaws: [0, 2, 4],
    related: [],
    notes: {
      0: '"User friendly" has no measure. How would a tester decide pass or fail?',
      2: '"Usually" and "quickly" are not numbers.',
      4: '"Work well" is not checkable. Which screen size, which behaviour?',
    },
    cause: {
      options: [
        {
          text: 'They are non-functional requirements, so they should be removed.',
          why: 'Non-functional requirements are valid. They just need a measurable target.',
        },
        {
          text: 'No finite, cost-effective check can decide whether they pass.',
          why: 'A requirement is verifiable only if a person or machine can check it. Words like "works well" and "usually" cannot be checked.',
        },
        {
          text: 'They describe the design instead of the need.',
          why: 'They do describe needs. The problem is that they cannot be measured.',
        },
      ],
      answer: 1,
    },
    fix: {
      prompt: 'Rewrite R1, R3 and R5 so a tester could pass or fail them.',
      title: 'Give each one a measurable target',
      text: 'Keep the intent, add a number and a condition. The lecture example turns "easy to use" into a training time and an error rate.',
      example: `R1. A first-time learner can finish a quiz without help in under 3 minutes.
R3. Feedback appears within 1 second for 95% of answers.
R5. Every screen works at 360 px width with no horizontal scrolling.`,
      criteria: [
        'Each rewritten line has a number or a clear yes/no condition',
        'R1 names who is measured and what they must do',
        'R3 gives a time limit',
        'R5 names a screen size or device',
      ],
    },
    apply: {
      question: 'Which of these requirements is verifiable?',
      options: [
        { text: 'The dashboard should load fast.', why: '"Fast" has no limit to test against.' },
        {
          text: 'The dashboard loads in under 2 seconds on a 4G connection.',
          why: 'It has a measure and a condition, so a test can pass or fail it.',
        },
        { text: 'The dashboard should look modern.', why: 'There is no pass or fail for "modern".' },
      ],
      answer: 1,
    },
  },
  {
    id: 'test-without-assert',
    topic: 'Software engineering fundamentals',
    name: 'A test that cannot fail',
    kind: 'Unit test',
    source: 'Software testing',
    conceptId: 'software-testing',
    title: 'Does this test prove the total is right?',
    question: 'Write a pytest test for adding items to the shopping cart.',
    format: 'code',
    lines: [
      'def test_add_items():',
      '    cart = ShoppingCart()',
      '    cart.add_item(2, 19.99)',
      '    cart.add_item(1, 9.99)',
      '    cart.get_total_amount()',
      '',
      '# $ pytest  →  1 passed',
      '# AI: "The test passes, so the cart total is correct."',
    ],
    flaws: [4, 7],
    related: [6],
    notes: {
      4: 'The total is calculated but never compared with anything.',
      7: 'A test with no assertion passes even when the total is wrong.',
    },
    cause: {
      options: [
        {
          text: 'Only one test ran, so the result is not significant.',
          why: 'The number of tests is not the issue. This one test checks nothing.',
        },
        {
          text: 'Prices should be stored as integers.',
          why: 'Storing cents can help, but it is not why this test proves nothing.',
        },
        {
          text: 'There is no assertion, so the test passes whatever the total is.',
          why: 'Arrange and Act are there, but the Assert step is missing.',
        },
      ],
      answer: 2,
    },
    fix: {
      prompt: 'Rewrite the test using Arrange, Act, Assert.',
      title: 'Arrange, Act, then Assert',
      text: 'State the expected values, run the code, then assert. Compare money with a tolerance, because floating-point sums are not exact.',
      example: `def test_add_items():
    # Arrange
    cart = ShoppingCart()
    # Act
    cart.add_item(2, 19.99)
    cart.add_item(1, 9.99)
    # Assert
    assert cart.get_items_count() == 3
    assert abs(cart.get_total_amount() - 49.97) < 0.001`,
      criteria: [
        'Asserts the expected total, 49.97',
        'Uses a tolerance or pytest.approx for the decimal value',
        'Also checks the item count',
        'Does not rely on "1 passed" alone',
      ],
    },
    apply: {
      question: 'A test calls a function and prints the result. When does it fail?',
      options: [
        { text: 'When the result is wrong.', why: 'Printing does not compare anything.' },
        {
          text: 'Only if the function throws an error.',
          why: 'Without an assertion, only a crash can make it fail.',
        },
        { text: 'Never, if the output looks right to the AI.', why: 'Nobody checks the output.' },
      ],
      answer: 1,
    },
  },
  {
    id: 'negative-test-expectations',
    topic: 'Software engineering fundamentals',
    name: 'Upload test plan',
    kind: 'Test plan',
    source: 'Software testing',
    conceptId: 'edge-cases',
    title: 'Are the expected results right?',
    question:
      'List test cases for the PDF upload. Rule: PDF files only, maximum 10 MB. Include edge and negative cases.',
    format: 'text',
    lines: [
      'T1. Upload a 2 MB PDF → summary appears.',
      'T2. Upload a PDF of exactly 10 MB → summary appears.',
      'T3. Upload an 11 MB PDF → summary appears.',
      'T4. Upload a .docx file → summary appears.',
      'T5. Click "Summarize" five times quickly → one summary appears.',
    ],
    flaws: [2, 3],
    related: [],
    notes: {
      2: 'Over the limit. The app should reject it with a clear message.',
      3: 'Not a PDF. The app should reject it, not summarise it.',
    },
    cause: {
      options: [
        {
          text: 'Negative tests should expect the app to reject invalid input gracefully.',
          why: 'A negative test checks that bad input is refused with a clear message, not accepted.',
        },
        {
          text: 'Edge cases should be removed because they rarely happen.',
          why: 'Edge cases are where bugs hide. T2 and T5 are useful.',
        },
        {
          text: 'The plan needs more happy-path tests.',
          why: 'T1 already covers the happy path. The problem is the wrong expected results.',
        },
      ],
      answer: 0,
    },
    fix: {
      prompt: 'Correct the expected results and add one more negative case.',
      title: 'Invalid input should be refused',
      text: 'Keep T1, T2 and T5. For T3 and T4, expect a clear error and no request to the AI service. A corrupted PDF is another useful negative case.',
      example: `T3. Upload an 11 MB PDF → "File too large (max 10 MB)", nothing is sent.
T4. Upload a .docx file → "Only PDF files are supported."
T6. Upload a corrupted PDF → "This file could not be read."`,
      criteria: [
        'T3 expects a rejection with a message',
        'T4 expects a rejection with a message',
        'Adds another negative case, such as a corrupted file',
        'Keeps the exactly-10 MB boundary test',
      ],
    },
    apply: {
      question: 'Which one is an edge case rather than a negative case?',
      options: [
        { text: 'Uploading an .exe file.', why: 'That is invalid input, so it is a negative case.' },
        {
          text: 'Uploading a PDF of exactly 10 MB.',
          why: 'It is valid but sits on the boundary of normal behaviour.',
        },
        { text: 'Uploading a 2 MB PDF.', why: 'That is the normal happy path.' },
      ],
      answer: 1,
    },
  },
  {
    id: 'verification-not-validation',
    topic: 'Software engineering fundamentals',
    name: 'Built it right, but the right thing?',
    kind: 'Validation',
    source: 'SDLC',
    conceptId: 'requirements',
    title: 'Is the AI tutor ready for all students?',
    question: 'Our AI tutor passes every test. Can we launch it to all students?',
    format: 'text',
    lines: [
      'Unit, integration and system tests all pass.',
      'Every requirement in the specification is implemented.',
      'So we have confirmed it is the right product for students.',
      'There is no need for user testing. Launch it to every student next week.',
    ],
    flaws: [2, 3],
    related: [],
    notes: {
      2: 'Tests show it matches the spec. They do not show students need it or can use it.',
      3: 'Skipping users removes the only check of whether it solves their problem.',
    },
    cause: {
      options: [
        {
          text: 'The tests are probably wrong.',
          why: 'Nothing suggests the tests are wrong. They answer a different question.',
        },
        {
          text: 'It confuses verification with validation.',
          why: 'Verification asks "did we build it right?" Validation asks "did we build the right product?" Only users can answer the second.',
        },
        {
          text: 'System tests should run after launch.',
          why: 'System tests belong before release. The missing step is checking with real users.',
        },
      ],
      answer: 1,
    },
    fix: {
      prompt: 'What would you do before a full launch?',
      title: 'Validate with real users first',
      text: 'Run a usability test with a few representative students on realistic tasks, then release to a small group first, for example a beta or canary release, and watch the feedback.',
      example:
        '"Ask five students to revise for a real quiz with the tutor while we watch. Fix what confuses them. Then release to one class before everyone."',
      criteria: [
        'Separates passing tests from meeting user needs',
        'Involves representative users doing realistic tasks',
        'Releases to a small group before everyone',
        'Says what feedback or signal you will look at',
      ],
    },
    apply: {
      question: 'Which activity is validation?',
      options: [
        { text: 'Code review of the tutor module.', why: 'Code review checks the build, so it is verification.' },
        { text: 'Running the integration tests in CI.', why: 'That is verification against the spec.' },
        {
          text: 'Watching five students try to revise with the tutor.',
          why: 'It checks whether the product meets real user needs.',
        },
      ],
      answer: 2,
    },
  },
  {
    id: 'big-bang-agent-request',
    topic: 'Effective use of AI coding agents',
    name: 'Build everything at once',
    kind: 'Agent workflow',
    source: 'AI-assisted development',
    fluency: 'Description',
    conceptId: 'requirements',
    title: 'Is this a good way to start?',
    question:
      'Build our whole learning platform: login, courses, quizzes, AI tutor, payments and an admin dashboard. Make it modern.',
    format: 'text',
    lines: [
      'Agent: Got it! I will build everything in one go.',
      'Agent: I picked Next.js, Prisma, Stripe and Tailwind for the stack.',
      'Agent: I generated 64 files across the frontend, backend and database.',
      'Agent: Login, quizzes and payments are done.',
      'Agent: I could not run the tests, but the code looks correct.',
    ],
    flaws: [0, 2, 4],
    related: [1, 3],
    notes: {
      0: 'One huge step. When it breaks, you cannot tell which layer failed.',
      1: 'The stack was guessed because the request gave no constraints.',
      2: 'Far too much to review. Small increments are easier to check.',
      3: '"Done" without any check is only a claim.',
      4: 'Unverified code. Nothing shows any of it works.',
    },
    cause: {
      options: [
        {
          text: 'The agent chose the wrong framework.',
          why: 'Any framework could be fine. The agent had no spec or constraints to follow.',
        },
        {
          text: 'A vague, huge request led to one unreviewable, unverified change.',
          why: 'Without a spec and small testable steps, the agent guessed and could not verify anything.',
        },
        {
          text: 'A different AI model would have done it properly.',
          why: 'Switching models can help when one is stuck, but the request itself is the problem.',
        },
      ],
      answer: 1,
    },
    fix: {
      prompt: 'Write a better first request to the agent.',
      title: 'Spec first, then one small slice',
      text: 'Agree the spec before code: user stories, acceptance criteria and the stack. Ask for a plan, then build one thin slice, test it and commit it before the next.',
      example:
        '"Read spec.md and AGENTS.md. Plan the login slice only, with mocked data. Do not add dependencies outside our stack. Show me the plan and wait for my OK. After building, run the tests and commit."',
      criteria: [
        'Points the agent to a spec or acceptance criteria',
        'Asks for one small slice, not the whole platform',
        'Asks for a plan before code',
        'Requires tests to run before the work is called done',
      ],
    },
    apply: {
      question: 'Which first request follows the lecture advice?',
      options: [
        { text: '"Make me a Google Drive."', why: 'Huge and vague, the same problem again.' },
        {
          text: '"Plan the file-upload slice from spec.md, then wait for my OK."',
          why: 'It is small, grounded in a spec, and keeps a human checkpoint.',
        },
        { text: '"Build everything, then I will test it all at the end."', why: 'Late testing means late surprises.' },
      ],
      answer: 1,
    },
  },
  {
    id: 'agent-edits-test',
    topic: 'Effective use of AI coding agents',
    name: 'The agent "fixed" a test',
    kind: 'Code review',
    source: 'AI in software development · Testing',
    fluency: 'Discernment',
    conceptId: 'ai-code-review',
    title: 'Did the agent fix the bug?',
    question: 'Fix the failing test in test_cart.py.',
    format: 'code',
    lines: [
      'def test_add_two_pens():',
      '    cart = Cart()',
      '    cart.add("pen", qty=2)',
      '-   assert cart.count() == 2',
      '+   assert cart.count() == 1',
      '',
      '# Agent: "Fixed. All 42 tests pass now."',
    ],
    flaws: [4, 6],
    related: [3],
    notes: {
      3: 'This was the correct expectation. Two pens should count as 2.',
      4: 'The expected value was changed to match the bug.',
      6: 'The tests pass because the test was weakened, not because the code was fixed.',
    },
    cause: {
      options: [
        {
          text: 'It changed the test to match the bug, so the bug is now hidden.',
          why: 'The test was the specification. Editing it to pass hides the defect in Cart.count().',
        },
        {
          text: 'It should have run only the failing test.',
          why: 'Running all tests is good practice. The problem is what it changed.',
        },
        {
          text: '"== 1" is a syntax error.',
          why: 'It is valid Python. It is just the wrong expectation.',
        },
      ],
      answer: 0,
    },
    fix: {
      prompt: 'What should happen instead, and what would you tell the agent?',
      title: 'Fix the code, not the test',
      text: 'Revert the test change. Cart.count() must add up quantities. Read the diff, not only the test result, and tell the agent which files it may change.',
      example:
        '"Revert the change to test_cart.py. Fix Cart.count() so it sums quantities. Do not edit files in tests/ unless I agree the requirement changed. Show me the diff."',
      criteria: [
        'Reverts the edited assertion',
        'Puts the fix in Cart.count()',
        'Reviews the diff before accepting',
        'Limits what the agent may edit',
      ],
    },
    apply: {
      question: 'You delegate a failing test to an agent. What do you check yourself?',
      options: [
        { text: 'Only that the test suite is green.', why: 'This case shows green can hide a bug.' },
        {
          text: 'That the diff changed the code under test, not the test.',
          why: 'Delegate the fix, but keep the review of the diff.',
        },
        { text: 'Nothing, if the agent says it is fixed.', why: 'The agent\'s claim is not evidence.' },
      ],
      answer: 1,
    },
  },
  {
    id: 'api-key-in-browser',
    topic: 'Effective use of AI coding agents',
    name: 'API key in the browser',
    kind: 'Security',
    source: 'SDLC · AI in software development',
    fluency: 'Diligence',
    conceptId: 'ai-code-review',
    title: 'Is this safe to deploy?',
    question: 'Add an AI chat to our site and get it ready for Vercel.',
    format: 'code',
    lines: [
      '// chat.js: runs in every visitor\'s browser',
      'const API_KEY = "sk-proj-EXAMPLE-NOT-REAL";',
      '',
      'export function ask(question) {',
      '  return fetch("https://api.example.com/v1/chat", {',
      '    method: "POST",',
      '    headers: { Authorization: `Bearer ${API_KEY}` },',
      '    body: JSON.stringify({ input: question }),',
      '  });',
      '}',
      '// Agent: "Commit this and deploy. The chat will work."',
    ],
    flaws: [1, 10],
    related: [0, 6],
    notes: {
      0: 'This is why it matters: browser code is public.',
      1: 'Anyone can read this key in developer tools and spend your quota.',
      6: 'The key is sent from the browser, so it is visible in network requests too.',
      10: 'Committing puts the secret in Git history, even if you delete it later.',
    },
    cause: {
      options: [
        {
          text: 'The key should be Base64-encoded first.',
          why: 'Encoding is not protection. The browser can decode it, so anyone can.',
        },
        {
          text: 'fetch should be replaced with a library such as axios.',
          why: 'The HTTP library does not matter. The key is still public.',
        },
        {
          text: 'Browser code is public, so the secret key is exposed to everyone.',
          why: 'Secrets must stay on the server and never appear in the repository.',
        },
      ],
      answer: 2,
    },
    fix: {
      prompt: 'How would you make this safe?',
      title: 'Keep the key on the server',
      text: 'Call the AI service from a server or serverless function. Store the key in .env locally, list .env in .gitignore, and set it in Vercel\'s environment variables. Revoke the exposed key.',
      example: `// api/chat.js: runs on the server
export default async function handler(req, res) {
  const reply = await fetch(API_URL, {
    headers: { Authorization: \`Bearer \${process.env.AI_API_KEY}\` },
    ...
  });
}`,
      criteria: [
        'Moves the call to a server or serverless function',
        'Reads the key from an environment variable',
        'Keeps .env out of Git with .gitignore',
        'Revokes or rotates the key that was exposed',
      ],
    },
    apply: {
      question: 'A key was already pushed to a public repo. What do you do first?',
      options: [
        {
          text: 'Revoke the key and create a new one.',
          why: 'Assume it is already copied. Deleting it from the code does not remove it from history.',
        },
        { text: 'Delete the line in a new commit.', why: 'The old commit still contains the key.' },
        { text: 'Make the repository private.', why: 'It may already have been copied. Revoke it first.' },
      ],
      answer: 0,
    },
  },
  {
    id: 'force-push-advice',
    topic: 'Soft and product skills',
    name: 'Rejected push',
    kind: 'Git teamwork',
    source: 'Collaboration and version control',
    conceptId: 'communication',
    title: 'Is this safe advice for a team?',
    question:
      'git push was rejected: "Updates were rejected because the remote contains work that you do not have locally." What should I do?',
    format: 'text',
    lines: [
      'This usually means a teammate pushed to main before you.',
      'Run: git push --force origin main',
      'This replaces the remote branch with your version, so the error goes away.',
      'If you see conflict markers later, just delete the other person\'s code.',
    ],
    flaws: [1, 3],
    related: [2],
    notes: {
      1: 'Force-pushing to a shared branch deletes your teammate\'s commits from it.',
      2: 'True, and that is exactly the danger.',
      3: 'A conflict needs a human decision that keeps both people\'s intent.',
    },
    cause: {
      options: [
        {
          text: 'It overwrites a teammate\'s work instead of integrating it.',
          why: 'Fetch and merge their commits, resolve conflicts together, then push.',
        },
        {
          text: 'The command should be git push -f, which is safer.',
          why: '-f is the same as --force.',
        },
        {
          text: 'Git never allows pushing to main.',
          why: 'Git allows it. Many teams protect main, but that is a setting, not the cause here.',
        },
      ],
      answer: 0,
    },
    fix: {
      prompt: 'Write the steps you would follow instead.',
      title: 'Fetch, merge, resolve, then push',
      text: 'Get the remote work first, merge it, and resolve any conflict by combining both changes. Run the tests, commit the merge and push. Better still, work on a feature branch and open a pull request.',
      example: `git fetch origin
git merge origin/main      # resolve conflicts, keep both intents
# run the tests
git add . && git commit
git push origin main       # or push a feature branch and open a PR`,
      criteria: [
        'Fetches or pulls the remote changes first',
        'Resolves conflicts by combining both changes',
        'Tests before pushing',
        'Suggests a feature branch or pull request',
      ],
    },
    apply: {
      question: 'Alice and Bob changed the same line. What happens when Alice merges?',
      options: [
        { text: 'Git keeps the newest change.', why: 'Git does not pick a winner by time.' },
        {
          text: 'Git stops and marks the conflict for a person to resolve.',
          why: 'Git cannot know the intent, so a human must decide.',
        },
        { text: 'Git keeps Alice\'s version because she is merging.', why: 'Git asks; it does not choose.' },
      ],
      answer: 1,
    },
  },
  {
    id: 'not-done-yet',
    topic: 'Soft and product skills',
    name: 'Is it really Done?',
    kind: 'Scrum',
    source: 'Agile · Scrum',
    conceptId: 'communication',
    title: 'Should this story be marked Done?',
    question:
      'Our Definition of Done: code reviewed, tests pass in CI, acceptance criteria met, deployed to staging. Can we mark the timed-quiz story Done for tomorrow\'s Sprint Review?',
    format: 'text',
    lines: [
      'The timer code is written and works on my laptop.',
      'CI tests pass.',
      'Code review is still pending, but it is a small change.',
      'So the story is done. Mark it Done and demo it in the Sprint Review.',
      'We can finish the review and the staging deploy next Sprint.',
    ],
    flaws: [3, 4],
    related: [0, 2],
    notes: {
      0: '"Works on my laptop" is not "deployed to staging".',
      2: 'Size does not excuse a line of the Definition of Done.',
      3: 'Two Done lines are not met, so the story is not done.',
      4: 'Unfinished work goes back to the Product Backlog, not into a "done" label.',
    },
    cause: {
      options: [
        {
          text: 'Small changes are exempt from code review.',
          why: 'The Definition of Done applies to every item.',
        },
        {
          text: 'An item that fails any Definition of Done line is not done.',
          why: 'It returns to the Product Backlog, so learners never get work that only looks finished.',
        },
        {
          text: 'The Sprint should be extended by a few days.',
          why: 'A Sprint has a fixed length. Scope changes, not the time box.',
        },
      ],
      answer: 1,
    },
    fix: {
      prompt: 'What would you say in tomorrow\'s Sprint Review?',
      title: 'Be honest about Done',
      text: 'Report what is finished and what is not. The story is not Done, so it is not shown as finished. It returns to the Product Backlog with the remaining steps.',
      example:
        '"The timer works and CI passes, but review and the staging deploy are not finished, so the story is not Done. It goes back to the backlog. I can get the review done tomorrow morning."',
      criteria: [
        'Does not call the story Done',
        'Names which Definition of Done lines are missing',
        'Returns the item to the Product Backlog',
        'Gives a clear next step',
      ],
    },
    apply: {
      question: 'Which Definition of Done line catches "it works on my laptop"?',
      options: [
        { text: 'Code reviewed.', why: 'Review checks the code, not where it runs.' },
        {
          text: 'Deployed to staging.',
          why: 'Staging shows whether it works outside one developer\'s machine.',
        },
        { text: 'Acceptance criteria met.', why: 'Criteria can be met locally and still fail elsewhere.' },
      ],
      answer: 1,
    },
  },
  {
    id: 'vague-user-story',
    topic: 'Soft and product skills',
    name: 'A story with no user',
    kind: 'User story',
    source: 'Agile · SDLC',
    conceptId: 'requirements',
    title: 'Could the team build and accept this?',
    question: 'Write a user story for the feedback feature in our quiz app.',
    format: 'text',
    lines: [
      'As a user,',
      'I want AI features,',
      'so that the app is better.',
      'Acceptance criteria:',
      '- The AI works well.',
      '- Feedback appears straight after each answer.',
    ],
    flaws: [0, 1, 2, 4],
    related: [],
    notes: {
      0: '"A user" is not a persona. Who exactly has this need?',
      1: 'A solution, not a goal. What does the learner want to do?',
      2: 'The benefit should be the user\'s, and it guides the design.',
      4: 'Not testable. Each line should be answerable yes or no.',
    },
    cause: {
      options: [
        {
          text: 'User stories should be written by the AI, not the team.',
          why: 'AI can draft one, but a person must check it against real needs.',
        },
        {
          text: 'It is too short, so it needs more detail about the AI model.',
          why: 'Stories describe needs, not technology.',
        },
        {
          text: 'It has no real persona, goal or benefit, and its criteria cannot be tested.',
          why: 'A story needs a persona, a goal and a benefit, plus yes/no acceptance criteria.',
        },
      ],
      answer: 2,
    },
    fix: {
      prompt: 'Rewrite the story and two acceptance criteria.',
      title: 'Persona, goal, benefit, then yes/no checks',
      text: 'Start from a real learner and their reason. Each criterion should be answerable yes or no, which makes the story ready to estimate and build.',
      example: `As a quiz taker preparing for exams,
I want immediate feedback on my answers,
so that I can learn from my mistakes.

- Correct or incorrect is shown right after each answer.
- If the answer is wrong, the correct one appears with a short explanation.`,
      criteria: [
        'Names a specific persona',
        'States a goal, not a technology',
        'States the learner\'s benefit',
        'Each criterion can be answered yes or no',
      ],
    },
    apply: {
      question: 'Which part of a user story most often guides the design?',
      options: [
        { text: 'The persona: "As a ..."', why: 'Important, but the reason is what shapes the solution.' },
        { text: 'The goal: "I want ..."', why: 'The goal says what, but not why.' },
        {
          text: 'The benefit: "so that ..."',
          why: 'The why tells the team what a good solution has to achieve.',
        },
      ],
      answer: 2,
    },
  },
];
