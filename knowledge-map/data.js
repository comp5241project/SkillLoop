/** Curated sample content. Public topic IDs are links used by other modules. */
window.SkillLoopGraph = {
  publication: {
    id: 'software-development',
    version: '2026-10-21.1',
    title: 'Software development',
    publishedAt: '2026-10-21',
  },
  topics: [
    {
      id: 'foundations', title: 'Foundations', icon: 'blocks', category: 'foundation',
      pathRole: 'core', order: 1, position: { column: 1, row: 2 },
      description: 'From an idea to a working application.',
      lesson: {
        goal: 'Name the main steps between a user need and a useful first release.',
        explanation: 'Start with a specific user need. Describe what the application should do, choose a small first version, implement it, and check the result against the original request. Development includes requirements, design, implementation, testing and deployment.',
        example: 'For an assignment tracker, the first release might let a student add a title and deadline, then mark an assignment complete.',
        nextAction: 'Write down one user, one task and one observable result for an app idea.',
      },
    },
    {
      id: 'requirements', title: 'Requirements', icon: 'list-checks', category: 'foundation',
      pathRole: 'core', order: 2, position: { column: 2, row: 1 },
      description: 'Turn an idea into clear requirements.',
      lesson: {
        goal: 'Turn a vague request into a checkable outcome.',
        explanation: 'A request such as “help me manage assignments” leaves many questions open. Ask who will use it, what information each assignment needs, and which actions matter most. Write acceptance criteria, such as “a student can add a title and deadline, then mark an assignment complete.”',
        example: '“The app is easy to use” is difficult to check. “A student can add an assignment in under three steps” gives the team something to observe.',
        nextAction: 'Rewrite one vague feature request as a user action with a visible result.',
      },
    },
    {
      id: 'code-reading', title: 'Code reading', icon: 'code-xml', category: 'capability',
      pathRole: 'core', order: 3, position: { column: 2, row: 2 },
      description: 'Predict behavior. Explain what the code does.',
      lesson: {
        goal: 'Trace one input through a small program before running it.',
        explanation: 'Identify the inputs and expected outputs before running a program. Trace one example through the code, including branches and loops. Predict the output, run the example, and investigate any difference between the prediction and the result.',
        example: 'For a loop that sums a list, trace both [2, 3] and []: the empty input may skip the loop entirely.',
        nextAction: 'Choose a short function and write down its output for two inputs before executing it.',
      },
    },
    {
      id: 'software-testing', title: 'Software testing', icon: 'flask-conical', category: 'quality',
      pathRole: 'core', order: 4, position: { column: 2, row: 3 },
      description: 'Check behavior, not just whether code runs.', practiceHref: '../correction-lab/',
      lesson: {
        goal: 'Choose tests that compare actual behavior with a stated expectation.',
        explanation: 'Running without an error does not prove that a program is correct. Compare actual and expected results. Include ordinary inputs, empty inputs, boundary values and invalid inputs. An average function, for example, needs a defined rule for an empty list.',
        example: 'For average([2, 4]), expect 3. For average([]), first decide whether to return a value or raise a clear error.',
        nextAction: 'Write one normal case and one failure case for a function you know.',
      },
    },
    {
      id: 'communication', title: 'Communication', icon: 'messages-square', category: 'workflow',
      pathRole: 'extension', order: 7, position: { column: 3, row: 1 },
      description: 'Ask better questions. Explain your decisions.',
      lesson: {
        goal: 'Explain assumptions and confirm what success means.',
        explanation: 'Clarify the user and scenario before proposing a solution. Ask about priorities and constraints, explain the options you considered, and check that both sides agree on what success means. In an interview, explain your assumptions and approach as well as your final answer.',
        example: 'Before building an assignment reminder, ask whether deadlines use the student’s time zone and when reminders should arrive.',
        nextAction: 'Ask two clarifying questions before proposing a solution to a vague request.',
      },
    },
    {
      id: 'ai-code-review', title: 'AI code review', icon: 'scan-line', category: 'quality',
      pathRole: 'core', order: 5, position: { column: 3, row: 2 },
      description: 'Challenge assumptions in generated code.', practiceHref: '../correction-lab/',
      lesson: {
        goal: 'Find a claim about generated code that still needs evidence.',
        explanation: 'Compare generated code with the actual requirements. Check the assumptions it makes, the cases it omits, and the APIs it uses. Create a counterexample and use tests or documentation to verify a proposed fix. A confident explanation is not evidence that the code is correct.',
        example: 'If an AI says an average function handles every list, try [] before accepting the claim.',
        nextAction: 'Take one generated-code claim and write a test that could disprove it.',
      },
    },
    {
      id: 'edge-cases', title: 'Edge cases', icon: 'split', category: 'quality',
      pathRole: 'extension', order: 6, position: { column: 3, row: 3 },
      description: 'Explore empty, extreme and invalid inputs.', practiceHref: '../correction-lab/',
      lesson: {
        goal: 'Identify inputs at and beyond a function’s boundaries.',
        explanation: 'Consider the boundaries of the input: no items, one item, repeated items, and values at the allowed minimum or maximum. Also consider invalid types. State what should happen for each input before checking the implementation.',
        example: 'For items[0], an empty list is a boundary case. Decide its expected behavior before testing.',
        nextAction: 'List three boundary or invalid inputs for a function you recently used.',
      },
    },
  ],
  relations: [
    { id: 'foundations-requirements', source: 'foundations', target: 'requirements', type: 'enables', reason: 'Understanding the development cycle helps you see where requirements guide later decisions.' },
    { id: 'foundations-code-reading', source: 'foundations', target: 'code-reading', type: 'enables', reason: 'A basic view of implementation gives context when tracing what code does.' },
    { id: 'foundations-testing', source: 'foundations', target: 'software-testing', type: 'enables', reason: 'The development cycle includes checking a result against the original need.' },
    { id: 'requirements-communication', source: 'requirements', target: 'communication', type: 'related', reason: 'Clarifying a requirement requires questions and agreement with the people involved.' },
    { id: 'code-reading-review', source: 'code-reading', target: 'ai-code-review', type: 'prerequisite', reason: 'To challenge generated code, first trace its behavior and identify its assumptions.' },
    { id: 'testing-review', source: 'software-testing', target: 'ai-code-review', type: 'supports', reason: 'Tests and counterexamples provide evidence for a code review finding.' },
    { id: 'testing-edge-cases', source: 'software-testing', target: 'edge-cases', type: 'supports', reason: 'Boundary and invalid inputs make a test set more revealing.' },
  ],
  events: [
    {
      id: 'crowdstrike-content-update-2024',
      title: 'A content update caused Windows crashes', date: '2024-07-19',
      summary: 'CrowdStrike reported that a Rapid Response Content configuration update for its Windows sensor led to system crashes. The incident offers a concrete case for discussing validation and testing of changes.',
      source: {
        title: 'CrowdStrike preliminary post-incident review',
        url: 'https://www.crowdstrike.com/en-us/blog/falcon-content-update-preliminary-post-incident-report/',
        publishedDate: '2024-07-24', checkedDate: '2026-10-21',
      },
      claims: [
        { kind: 'source-supported', text: 'The 19 July 2024 content configuration update for Windows sensors resulted in crashes.', sourceSection: 'What Happened?' },
        { kind: 'source-supported', text: 'CrowdStrike said a Content Validator bug let problematic content pass validation.', sourceSection: 'What Happened on July 19, 2024?' },
        { kind: 'teaching-inference', text: 'When a release can affect many users, tests, validation and staged rollout deserve explicit attention.' },
      ],
      links: [
        { topicId: 'software-testing', kind: 'application', reason: 'The report describes validation, testing and deployment checks around the update.' },
        { topicId: 'edge-cases', kind: 'context', reason: 'Problematic content that passed validation is a useful prompt to consider untested inputs.' },
      ],
    },
  ],
  questions: [
    { id: 'foundations-check', topicId: 'foundations', prompt: 'What should guide the first version of an application?', options: ['The largest possible feature list', 'A specific user need and observable result', 'A choice of programming language alone'], answerIndex: 1, feedback: 'Start with the user, their task and a result you can check.' },
    { id: 'requirements-check', topicId: 'requirements', prompt: 'Which requirement can a team check directly?', options: ['The app feels modern', 'The app is simple', 'A student can add an assignment with a title and deadline'], answerIndex: 2, feedback: 'A concrete user action and visible result make the requirement testable.' },
    { id: 'code-reading-check', topicId: 'code-reading', prompt: 'What is a useful first step when reading an unfamiliar function?', options: ['Predict an output for a specific input', 'Rename every variable', 'Assume the comments are always correct'], answerIndex: 0, feedback: 'Trace a concrete input before running the function, then compare the result.' },
    { id: 'software-testing-check', topicId: 'software-testing', prompt: 'What makes a test more useful than simply running the program?', options: ['It has a stated expected result', 'It only uses ordinary inputs', 'It always passes'], answerIndex: 0, feedback: 'A test compares actual behavior with an expected result.' },
    { id: 'communication-check', topicId: 'communication', prompt: 'A request for reminders is vague. What should you ask first?', options: ['Which framework is popular?', 'When should reminders arrive and in which time zone?', 'Can the interface be made blue?'], answerIndex: 1, feedback: 'Clarify the user scenario and constraints before choosing an implementation.' },
    { id: 'ai-code-review-check', topicId: 'ai-code-review', prompt: 'An AI claims a function handles every list. What is good evidence?', options: ['The confident explanation', 'A counterexample such as an empty list and a test', 'The function name'], answerIndex: 1, feedback: 'A counterexample and test can challenge a broad claim.' },
    { id: 'edge-cases-check', topicId: 'edge-cases', prompt: 'Which input is a boundary case for reading the first list item?', options: ['A list with ten items', 'An empty list', 'A list with five ordinary items'], answerIndex: 1, feedback: 'An empty list has no first item, so the expected behavior needs an explicit rule.' },
  ],
  activities: [
    {
      id: 'testing-edge-relation', kind: 'relation-judgment',
      topicIds: ['software-testing', 'edge-cases'], relationId: 'testing-edge-cases',
      prompt: 'Why are edge cases connected to software testing in this map?',
      options: [
        'They prove that every possible input has been tested.',
        'They help reveal behavior at boundaries and for invalid inputs.',
        'They make expected results unnecessary.',
      ],
      answerIndex: 1,
      feedback: 'A boundary case can expose behavior that ordinary inputs miss. You still need to state the expected result and cannot test every possible input.',
    },
  ],
};
