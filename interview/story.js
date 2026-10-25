/** Shared conversation contract. Runs in the browser and in the interview API. */
(function (root, factory) {
  const story = factory();
  if (typeof module === 'object' && module.exports) module.exports = story;
  else root.SkillLoopStory = story;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const topics = [
    {
      id: 'testing',
      conceptId: 'software-testing',
      title: 'Testing code',
      icon: 'flask-conical',
      setting: 'You are reviewing a small feature before release.',
      goal: 'Connect requirements, test cases and release decisions.',
      question: 'An AI-written average function is ready to merge. What would you check first?',
      choices: [
        "I'd first clarify what the function should do…",
        "I'd check whether the existing tests cover…",
        "I'd try an input such as…",
      ],
      followup: 'It crashes on an empty list. What would you do first?',
      followChoices: [
        'For an empty list, I would expect…',
        "Before choosing a default result, I'd ask…",
        "To reproduce and isolate the error, I'd…",
      ],
      probe: 'The fix passes the empty-list test. What else would convince you?',
      probeChoices: [
        "Beyond an empty list, I'd test…",
        'The requirement tells me that…',
        'I would want evidence that…',
      ],
      close: 'The release is in an hour. What would you tell the team?',
      closeChoices: [
        'My release recommendation is…',
        'The evidence I would share is…',
        'One risk that remains is…',
      ],
      example:
        'I would confirm how empty input should behave, write a test for that rule, and check ordinary and boundary inputs. Before release I would share the evidence and any remaining risks.',
      nextStep: 'Name an expected result before choosing a test or a fix.',
    },
    {
      id: 'requirements',
      conceptId: 'requirements',
      title: 'Understanding a client',
      icon: 'messages-square',
      setting: 'You are meeting the owner of a campus events app.',
      goal: 'Clarify user needs, negotiate scope and define acceptance criteria.',
      question: 'Our campus events app needs to be “better”. Where would you start?',
      choices: [
        "I'd ask which students struggle with…",
        "Before proposing a feature, I'd clarify…",
        "To understand what 'better' means, I'd…",
      ],
      followup: 'Students keep missing registration deadlines. What would you propose?',
      followChoices: [
        "I'd find out why students miss deadlines by…",
        'One possible solution to test is…',
        "I'd walk through registration with a student and…",
      ],
      probe:
        'The client wants speed and personalisation, but we can ship only one improvement. What now?',
      probeChoices: [
        'The first-release priority should depend on…',
        'The trade-off I would explain is…',
        "Before promising a delivery date, I'd…",
      ],
      close: 'How would we know your first release succeeded?',
      closeChoices: [
        'We could measure success by…',
        'One acceptance criterion would be…',
        "To check the outcome with students, I'd…",
      ],
      example:
        'I would ask which students miss deadlines and why. Then I would agree on a small change and a measurable registration outcome with the client, and test the change with those students.',
      nextStep: 'Turn “better” into one observable user outcome.',
    },
    {
      id: 'ai-review',
      conceptId: 'ai-code-review',
      title: 'Working with AI',
      icon: 'git-pull-request',
      setting: 'An AI coding assistant has proposed a change to a shared service.',
      goal: 'Challenge assumptions, constrain revisions and verify evidence.',
      question: 'The AI says its solution is ready. What would you look at first?',
      choices: [
        "I'd compare the AI's assumptions with…",
        'The evidence I would want is…',
        "Before accepting the design, I'd ask…",
      ],
      followup: 'It assumes every user has a verified email. Some do not. How would you respond?',
      followChoices: [
        'My revision request would specify…',
        'A counterexample I could give is…',
        'The assumption I would challenge is…',
      ],
      probe: 'The revision changes a helper used by three other modules. Would you merge it?',
      probeChoices: [
        'The shared callers could be affected because…',
        'Before merging, I would verify…',
        'I would constrain the next revision by…',
      ],
      close: 'What would you leave for the next reviewer?',
      closeChoices: [
        "For the next reviewer, I'd record…",
        'What I verified myself was…',
        'One remaining uncertainty is…',
      ],
      example:
        'I would identify the incorrect email assumption, give a concrete counterexample, and request a focused change with tests. I would inspect shared callers myself and record verified results and remaining uncertainty.',
      nextStep: 'Separate an AI claim from evidence you have actually verified.',
    },
  ];
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const text = (value, max) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  function topic(id) {
    return topics.find((item) => item.id === id) || topics[0];
  }
  function create(topicId, mode, context = {}) {
    const now = new Date().toISOString();
    return {
      schemaVersion: 2,
      id: 'story-' + crypto.randomUUID(),
      topicId: topic(topicId).id,
      mode: mode === 'ai' ? 'ai' : 'demo',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      context: copy(context),
      turns: [],
      current: null,
      draft: '',
      draftIdea: null,
      review: null,
      suggestions: {},
      comparisons: {},
      revisionDrafts: {},
    };
  }
  function validTurn(turn) {
    return (
      turn &&
      typeof turn.done === 'boolean' &&
      typeof turn.acknowledgement === 'string' &&
      turn.acknowledgement.length <= 220 &&
      typeof turn.question === 'string' &&
      turn.question.length <= 400 &&
      Array.isArray(turn.choices) &&
      turn.choices.length <= 3 &&
      (turn.done || (text(turn.question, 400) && turn.choices.length >= 2)) &&
      turn.choices.every((choice) => text(choice, 180)) &&
      (!turn.feedback || validFeedback(turn.feedback)) &&
      (!turn.done || (turn.question === '' && turn.choices.length === 0))
    );
  }
  function validFeedback(value, answer) {
    const shape =
      value &&
      typeof value.observation === 'string' &&
      value.observation.length <= 170 &&
      typeof value.suggestion === 'string' &&
      value.suggestion.length <= 150 &&
      typeof value.quote === 'string' &&
      value.quote.length <= 120;
    if (!shape || answer === undefined) return Boolean(shape);
    if (!answer) return value.observation === '' && value.suggestion === '' && value.quote === '';
    return Boolean(
      text(value.observation, 170) &&
        text(value.suggestion, 150) &&
        text(value.quote, 120) &&
        answer.includes(value.quote)
    );
  }
  function accept(session, turn) {
    if (
      !validTurn(turn) ||
      (turn.done && session.turns.length < 3) ||
      (!turn.done && session.turns.length >= 5)
    )
      throw new Error('The interviewer returned an incomplete reply. Please retry.');
    session.current = copy(turn);
    if (session.turns.length && validFeedback(turn.feedback, session.turns.at(-1).answer))
      session.turns.at(-1).feedback = copy(turn.feedback);
    if (turn.done || session.turns.length >= 5) {
      session.status = 'completed';
      session.current.done = true;
    }
    session.updatedAt = new Date().toISOString();
  }
  function answer(session, response, choiceIndex = null) {
    if (
      session.status !== 'active' ||
      !session.current ||
      session.current.done ||
      session.turns.length >= 5
    )
      throw new Error('This interview is not waiting for an answer.');
    if (!text(response, 1500)) throw new Error('Add an answer of up to 1,500 characters.');
    const turn = copy(session.current);
    session.turns.push({
      question: turn.question,
      acknowledgement: turn.acknowledgement,
      choices: turn.choices,
      answer: response.trim(),
      choiceIndex,
      usedIdea: Boolean(session.draftIdea),
      feedback: null,
      at: new Date().toISOString(),
      revisions: [],
    });
    session.current = null;
    session.draft = '';
    session.draftIdea = null;
    session.updatedAt = new Date().toISOString();
  }
  function revise(session, index, response) {
    const record = session.turns[index];
    if (!record || !text(response, 1500))
      throw new Error('Add a revision of up to 1,500 characters.');
    if (record.revisions.length >= 8) throw new Error('This answer already has eight revisions.');
    if (response.trim() === (record.revisions.at(-1)?.text || record.answer)) return false;
    record.revisions.push({ text: response.trim(), at: new Date().toISOString() });
    if (session.revisionDrafts) delete session.revisionDrafts[index];
    delete session.comparisons[index];
    session.updatedAt = new Date().toISOString();
    return true;
  }
  function validReview(review, turns) {
    return (
      review &&
      text(review.summary, 260) &&
      text(review.nextStep, 220) &&
      Array.isArray(review.highlights) &&
      review.highlights.length >= 1 &&
      review.highlights.length <= 3 &&
      review.highlights.every(
        (item) =>
          item &&
          ['strength', 'improve'].includes(item.kind) &&
          text(item.title, 80) &&
          text(item.advice, 300) &&
          Number.isInteger(item.turn) &&
          item.turn >= 0 &&
          item.turn < turns.length &&
          text(item.quote, 180) &&
          turns[item.turn].answer.includes(item.quote)
      )
    );
  }
  function validSession(s) {
    return (
      s &&
      s.schemaVersion === 2 &&
      text(s.id, 100) &&
      topics.some((t) => t.id === s.topicId) &&
      ['ai', 'demo'].includes(s.mode) &&
      ['active', 'completed'].includes(s.status) &&
      Number.isFinite(Date.parse(s.createdAt)) &&
      Number.isFinite(Date.parse(s.updatedAt)) &&
      s.context &&
      typeof s.draft === 'string' &&
      s.draft.length <= 1500 &&
      Array.isArray(s.turns) &&
      s.turns.length <= 5 &&
      (s.status !== 'completed' || s.turns.length >= 3) &&
      s.turns.every(
        (t) =>
          t &&
          text(t.question, 400) &&
          text(t.answer, 1500) &&
          Array.isArray(t.choices) &&
          t.choices.length <= 3 &&
          t.choices.every((c) => text(c, 180)) &&
          Array.isArray(t.revisions) &&
          t.revisions.length <= 8 &&
          t.revisions.every((r) => r && text(r.text, 1500))
      ) &&
      (!s.current || validTurn(s.current)) &&
      (!s.review || validReview(s.review, s.turns)) &&
      s.suggestions &&
      typeof s.suggestions === 'object' &&
      s.comparisons &&
      typeof s.comparisons === 'object'
    );
  }
  function restore(value) {
    const sessions = Array.isArray(value?.sessions)
      ? value.sessions.filter(validSession).slice(0, 30).map(copy)
      : [];
    for (const session of sessions) {
      const drafts = {};
      for (const [index, draft] of Object.entries(session.revisionDrafts || {})) {
        if (
          /^[0-4]$/.test(index) &&
          session.turns[index] &&
          draft &&
          typeof draft.text === 'string' &&
          draft.text.length <= 1500
        )
          drafts[index] = { text: draft.text, assisted: draft.assisted === true };
      }
      session.revisionDrafts = drafts;
    }
    return {
      schemaVersion: 2,
      sessions,
      lastSessionId: typeof value?.lastSessionId === 'string' ? value.lastSessionId : '',
      lastView: value?.lastView === 'review' ? 'review' : 'room',
    };
  }
  function demoTurn(session) {
    const t = topic(session.topicId);
    const n = session.turns.length;
    const feedback = n
      ? {
          observation: 'Support your decision with an example.',
          suggestion: t.nextStep,
          quote: session.turns.at(-1).answer.slice(0, 100),
        }
      : { observation: '', suggestion: '', quote: '' };
    if (!n)
      return {
        done: false,
        acknowledgement: t.id === 'testing' ? '' : t.setting,
        feedback,
        question: t.question,
        choices: [...t.choices],
      };
    if (n >= 4)
      return {
        done: true,
        acknowledgement: 'Thank you. Let’s look back at your decisions.',
        feedback,
        question: '',
        choices: [],
      };
    const previous = session.turns.at(-1);
    let question = [t.followup, t.probe, t.close][n - 1];
    if (n === 1 && previous.choiceIndex === 1)
      question = {
        testing:
          'The existing tests pass, but a student tries an empty list and it crashes. What would you do first?',
        requirements:
          'We could build that feature, but students say they miss registration deadlines. What would you clarify first?',
        'ai-review':
          'The explanation is confident, but the code assumes every user has verified email. Some do not. What now?',
      }[t.id];
    return {
      done: false,
      acknowledgement: '',
      feedback,
      question,
      choices: [...[t.followChoices, t.probeChoices, t.closeChoices][n - 1]],
    };
  }
  function demoReview(session) {
    const t = topic(session.topicId);
    return {
      summary: 'Interview saved. Choose an answer to improve.',
      nextStep: t.nextStep,
      highlights: [
        {
          kind: 'improve',
          title: 'Explain the evidence',
          turn: 0,
          quote: session.turns[0].answer.slice(0, 130),
          advice: 'What specific example or expected result would support this answer?',
        },
        {
          kind: 'improve',
          title: 'Make your decision clear',
          turn: session.turns.length - 1,
          quote: session.turns.at(-1).answer.slice(0, 130),
          advice: 'Would a teammate know what you recommend and what still needs checking?',
        },
      ],
    };
  }
  return Object.freeze({
    topics,
    topic,
    create,
    answer,
    accept,
    revise,
    restore,
    validTurn,
    validFeedback,
    validReview,
    demoTurn,
    demoReview,
  });
});
