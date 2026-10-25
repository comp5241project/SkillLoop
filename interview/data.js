/** Authored examples. Replace the provider separately when a live interview API is agreed. */
window.SkillLoopInterviewActivities = [
  {
    id: 'testing',
    topic: 'Software testing',
    shortTitle: 'Testing',
    icon: 'flask-conical',
    description: 'Check the reasoning behind a result.',
    conceptId: 'software-testing',
    title: 'Beyond “it runs.”',
    objective: 'Explain how you would check AI-generated code before relying on it.',
    prompts: [
      'AI-generated code runs successfully. How would you check that it is correct?',
      'Choose one normal input and one edge case. What should happen for each, and why?',
      'A test fails just before release. What would you investigate, and what evidence would you share with your team?',
    ],
    advancedPrompt:
      'An AI-generated change passes the existing test suite. What evidence would you need before approving it for release?',
    hints: [
      'Start with the requirement, then think about inputs and expected results.',
      'An empty list or a boundary value can reveal an assumption.',
      'Separate what you observed from what you still need to verify.',
    ],
    criteria: [
      'I connected my checks to a requirement.',
      'I gave examples with expected results.',
      'I explained the evidence behind my decision.',
    ],
    moves: [
      [
        {
          id: 'clarify',
          icon: 'message-circle-question',
          label: 'Ask what “correct” means',
          consequence:
            'The feature should return the average of a list. Empty input has not been specified.',
          nextPrompt:
            'The requirement does not define empty input. What would you clarify, and which examples would you test?',
        },
        {
          id: 'counterexample',
          icon: 'flask-conical',
          label: 'Try an unusual input',
          consequence: 'A normal list passes. An empty list causes a division-by-zero error.',
          nextPrompt:
            'The empty-list test fails. How would you choose the expected behaviour before suggesting a fix?',
        },
        {
          id: 'suite',
          icon: 'list-checks',
          label: 'Inspect the existing tests',
          consequence:
            'The suite covers ordinary lists, but has no empty-input or invalid-type cases.',
          nextPrompt: 'Which two missing tests would you add, and what should each one prove?',
        },
      ],
      [
        {
          id: 'ask',
          icon: 'messages-square',
          label: 'Clarify the missing rule',
          consequence:
            'The product owner agrees: empty input should produce a clear validation error.',
        },
        {
          id: 'trace',
          icon: 'scan-line',
          label: 'Trace the failure',
          consequence:
            'The calculation divides the total by the list length without checking whether it is zero.',
        },
      ],
      [
        {
          id: 'pause',
          icon: 'circle-pause',
          label: 'Pause the release',
          consequence: 'The team asks what evidence would make you confident enough to resume.',
        },
        {
          id: 'scope',
          icon: 'git-branch',
          label: 'Narrow the change',
          consequence: 'The team can ship a smaller change if its limits and checks are explicit.',
        },
      ],
    ],
  },
  {
    id: 'requirements',
    topic: 'Requirements',
    shortTitle: 'Requirements',
    icon: 'list-checks',
    description: 'Turn a vague request into a clear plan.',
    conceptId: 'requirements',
    title: 'Ask before you build.',
    objective: 'Clarify a feature request and describe what successful delivery would mean.',
    prompts: [
      'A client wants “a better campus events app.” What would you ask before proposing a feature?',
      'The client says both speed and personalisation are essential. How would you clarify the priority?',
      'Describe one acceptance criterion for your proposed feature. How would you check it with the client?',
    ],
    advancedPrompt:
      'Two stakeholders disagree about the most important outcome for a campus events app. How would you turn that disagreement into a testable requirement?',
    hints: [
      'Ask who uses the app, what they are trying to do, and what currently gets in the way.',
      'Explore a concrete use case and the cost of each trade-off.',
      'Describe an observable result rather than “easy to use.”',
    ],
    criteria: [
      'I asked about the user and their goal.',
      'I made an assumption or trade-off explicit.',
      'I described a testable acceptance criterion.',
    ],
    moves: [
      [
        {
          id: 'user',
          icon: 'users',
          label: 'Ask who uses it',
          consequence:
            'First-year students say they often discover events after registration has closed.',
          nextPrompt:
            'Students miss registration deadlines. Which outcome would you prioritise, and what would you ask next?',
        },
        {
          id: 'feature',
          icon: 'sparkles',
          label: 'Suggest recommendations',
          consequence:
            'The client likes the idea, but says the current event list is already too slow.',
          nextPrompt:
            'The client likes recommendations but complains about speed. How would you agree the first release scope?',
        },
        {
          id: 'success',
          icon: 'target',
          label: 'Define success first',
          consequence: 'The client wants more students to finish registration before the deadline.',
          nextPrompt:
            'How would you turn “more registrations before the deadline” into a measurable acceptance criterion?',
        },
      ],
      [
        {
          id: 'scenario',
          icon: 'route',
          label: 'Walk through a real task',
          consequence: 'A student checks the app between classes with only a minute to spare.',
        },
        {
          id: 'tradeoff',
          icon: 'scale',
          label: 'Discuss the trade-off',
          consequence:
            'The client agrees to basic filtering now and personal recommendations later.',
        },
      ],
      [
        {
          id: 'observable',
          icon: 'circle-check',
          label: 'Describe an observable result',
          consequence:
            'A teammate will need to test your criterion without guessing what “better” means.',
        },
        {
          id: 'confirm',
          icon: 'messages-square',
          label: 'Confirm with the client',
          consequence: 'The client asks you to show one example of a pass and one of a failure.',
        },
      ],
    ],
  },
  {
    id: 'ai-review',
    topic: 'AI code review',
    shortTitle: 'AI collaboration',
    icon: 'git-pull-request',
    description: 'Explain what you trust, and why.',
    conceptId: 'ai-code-review',
    title: 'Review before you trust.',
    objective: 'Explain how you would evaluate an AI-generated change and guide its revision.',
    prompts: [
      'An AI assistant proposes a confident solution. What would you inspect before accepting its code?',
      'You find an assumption that does not match your requirements. How would you ask the assistant to revise the solution?',
      'The revised code looks better. What would you verify yourself, and what would you record for the next reviewer?',
    ],
    advancedPrompt:
      'An AI coding agent proposes a large change across several modules. How would you decide what to delegate, constrain and verify?',
    hints: [
      'Compare the change with requirements, dependencies and failure cases.',
      'Name the incorrect assumption and give a concrete counterexample.',
      'Explain what was tested, what changed, and what remains uncertain.',
    ],
    criteria: [
      'I questioned an assumption in the AI output.',
      'I described a specific revision request.',
      'I identified checks I would perform myself.',
    ],
    moves: [
      [
        {
          id: 'diff',
          icon: 'git-compare-arrows',
          label: 'Inspect the change',
          consequence: 'The assistant has modified a shared helper used by three other modules.',
          nextPrompt:
            'A shared helper has changed. How would you constrain the revision and check its impact on other modules?',
        },
        {
          id: 'assumption',
          icon: 'scan-line',
          label: 'Challenge an assumption',
          consequence: 'The proposed solution assumes every user has a verified email address.',
          nextPrompt:
            'The verified-email assumption is wrong. What precise revision request and example would you give the assistant?',
        },
        {
          id: 'evidence',
          icon: 'flask-conical',
          label: 'Ask for evidence',
          consequence:
            'The assistant says “all tests passed” but provides no test names or results.',
          nextPrompt: 'How would you verify the test claim and ask for a more useful handover?',
        },
      ],
      [
        {
          id: 'example',
          icon: 'file-code-2',
          label: 'Give a counterexample',
          consequence:
            'Your example shows exactly where the proposed behaviour differs from the requirement.',
        },
        {
          id: 'boundary',
          icon: 'git-branch',
          label: 'Set a clear boundary',
          consequence:
            'The assistant is asked to change only the affected function and preserve its callers.',
        },
      ],
      [
        {
          id: 'run',
          icon: 'flask-conical',
          label: 'Verify the claim myself',
          consequence: 'A reviewer asks which checks you actually ran and which are still pending.',
        },
        {
          id: 'handover',
          icon: 'notebook-pen',
          label: 'Prepare the handover',
          consequence:
            'The next reviewer needs the reason for the change, evidence, and remaining uncertainty.',
        },
      ],
    ],
  },
];
