/**
 * Server-only AI boundary for drafting correction cases. The API key never reaches the browser,
 * and provider errors are not passed through. Drafts must pass case-check.js and are only ever
 * shown to the teacher for review; nothing here publishes a case.
 */
const { check, TOPICS, CONCEPTS, FLUENCY } = require('./case-check.js');

const LIMITS = { notes: 6000, focus: 200 };
const PROVIDER_ERRORS = {
  400: 'The AI service rejected the request. Check the model ID setting.',
  401: 'The AI key was not accepted. Check the API key setting.',
  402: 'The AI account has no credit for this model.',
  404: 'The AI model or its provider is unavailable. Try another model.',
  429: 'The AI quota is used up for now. Try again later.',
  other: 'The AI service did not respond. Try again.',
};

/**
 * Vercel AI Gateway is used when AI_GATEWAY_MODEL is set; on Vercel it can authenticate with the
 * deployment's OIDC token. Otherwise OpenRouter, where a comma-separated OPENROUTER_MODEL lists
 * fallbacks for unreliable free providers.
 */
function provider(env = process.env, oidcToken = env.VERCEL_OIDC_TOKEN) {
  const gatewayToken = env.AI_GATEWAY_API_KEY || oidcToken;
  if (env.AI_GATEWAY_MODEL && gatewayToken) {
    return {
      name: 'AI Gateway',
      url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
      token: gatewayToken,
      models: { model: env.AI_GATEWAY_MODEL },
    };
  }
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL) {
    return {
      name: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      token: env.OPENROUTER_API_KEY,
      models: { models: env.OPENROUTER_MODEL.split(',').map((m) => m.trim()).filter(Boolean).slice(0, 3) },
    };
  }
  return null;
}

function configured(env = process.env, oidcToken) {
  return Boolean(env.CORRECTION_TEACHER_CODE && provider(env, oidcToken));
}

function readRequest(body) {
  const request = body && body.request;
  if (!body || body.action !== 'draft' || !request || typeof request !== 'object') {
    throw new Error('Unknown request.');
  }
  const topic = TOPICS.includes(request.topic) ? request.topic : TOPICS[0];
  const notes = typeof request.notes === 'string' ? request.notes.trim() : '';
  if (notes.length < 20) throw new Error('Add at least a short paragraph of lecture notes.');
  return {
    topic,
    notes: notes.slice(0, LIMITS.notes),
    focus: typeof request.focus === 'string' ? request.focus.trim().slice(0, LIMITS.focus) : '',
    audience: request.audience === 'cs' ? 'cs' : 'beginner',
    format: request.format === 'text' ? 'text' : 'code',
  };
}

function prompt(request, example) {
  const system = `You write practice cases for a software engineering course. Learners read an AI answer that contains planted mistakes, find the wrong lines, choose the cause, write a fix and answer a related question.

Return one JSON object only, no Markdown, with exactly these fields:
id (lowercase words joined by hyphens), topic, name (max 60 chars), kind (max 30), source (max 80, the lecture topic), conceptId, fluency (optional), title (a question, max 120), question (what the user asked the AI, max 400), format ("code" or "text"), lines (3 to 12 strings, the AI answer split into lines, max 160 chars each; "" for a blank line), flaws (0-based indexes of the 1 to 3 wrong lines), related (0-based indexes of lines that are acceptable to flag but not wrong, may be empty), notes (object from line index to a one-sentence note for every flaw and related line), cause ({options: 3 × {text, why}, answer: index}), fix ({prompt, title, text, example, criteria: 3 to 4 strings}), apply ({question, options: 3 × {text, why}, answer: index}).

Rules:
- topic must be: ${JSON.stringify(TOPICS)}.
- conceptId must be one of: ${JSON.stringify(CONCEPTS)}. fluency, if used, one of: ${JSON.stringify(FLUENCY)}.
- Plant realistic mistakes that AI assistants actually make. Every line not in flaws or related must be correct.
- The answer must sound confident, as a real AI answer would.
- Each "why" explains why that option is right or wrong. Do not start it with "Right" or "Correct".
- Stay within the teacher's lecture notes. Do not invent statistics, quotes or sources.
- Plain, clear English for university students.

Example of a complete case:
${JSON.stringify(example)}`;
  const user = `Topic group: ${request.topic}
Learners: ${request.audience === 'cs' ? 'computer science students and graduates' : 'beginners without a computer science background'}
Answer format: ${request.format === 'code' ? 'code, with comments for any AI claims' : 'prose'}
Mistake to plant: ${request.focus || 'choose the most important misconception in the notes'}

Lecture notes:
${request.notes}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function parse(content) {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in the reply.');
  return JSON.parse(content.slice(start, end + 1));
}

function finish(draft, request) {
  const slug = String(draft.id || draft.name || 'case')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return {
    ...draft,
    id: `ai-${slug || 'case'}-${Date.now().toString(36)}`,
    topic: request.topic,
    format: request.format,
    related: Array.isArray(draft.related) ? draft.related : [],
    notes: draft.notes && typeof draft.notes === 'object' ? draft.notes : {},
    origin: 'ai-draft',
  };
}

async function draft(body, { env = process.env, fetchImpl = fetch, example, oidcToken } = {}) {
  const request = readRequest(body);
  if (!configured(env, oidcToken)) return { result: demo(request), source: 'demo' };
  const ai = provider(env, oidcToken);
  if (body.teacherCode !== env.CORRECTION_TEACHER_CODE) {
    const error = new Error('The teacher code is not correct.');
    error.status = 403;
    throw error;
  }
  const messages = prompt(request, example);
  let problems = [];
  // One retry: the model gets the validation problems and corrects its own draft.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (problems.length) {
      messages.push({
        role: 'user',
        content: `That JSON has problems: ${problems.join(' ')} Return the corrected JSON object only.`,
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let reply;
    try {
      const response = await fetchImpl(ai.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${ai.token}`,
          'Content-Type': 'application/json',
          'X-Title': 'SkillLoop Correction Lab',
        },
        body: JSON.stringify({ ...ai.models, messages, temperature: 0.6, max_tokens: 3000 }),
      });
      if (!response.ok) {
        // Log the provider's reason for the Vercel logs; it never contains the API key.
        const detail = await response.text().catch(() => '');
        console.error(`${ai.name} ${response.status}: ${detail.slice(0, 1200)}`);
        const error = new Error(PROVIDER_ERRORS[response.status] || PROVIDER_ERRORS.other);
        error.status = 502;
        throw error;
      }
      const data = await response.json();
      reply = data && data.choices && data.choices[0] && data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
    try {
      const result = finish(parse(String(reply || '')), request);
      problems = check(result);
      if (!problems.length) return { result, source: 'ai' };
    } catch (_) {
      problems = ['The reply was not a valid JSON object.'];
    }
    messages.push({ role: 'assistant', content: String(reply || '') });
  }
  const error = new Error('The AI draft did not match the case format twice. Try again or shorten the notes.');
  error.status = 502;
  throw error;
}

/** Authored sample returned when no AI is configured, so the review flow can still be shown. */
function demo(request) {
  return {
    id: `demo-${Date.now().toString(36)}`,
    topic: request.topic,
    name: 'Sample: merge without review',
    kind: 'Sample draft',
    source: 'Collaboration and version control',
    conceptId: 'communication',
    title: 'Is this a good way to merge?',
    question: 'My feature branch is finished. How do I get it into main?',
    format: 'text',
    lines: [
      'Switch to main and run: git merge feature/quiz-timer',
      'Skip the pull request; it only slows the team down.',
      'If the tests fail after merging, fix them later.',
      'Then push main so everyone has your changes.',
    ],
    flaws: [1, 2],
    related: [],
    notes: {
      1: 'A pull request is where teammates review the change before it reaches main.',
      2: 'Main should stay working. Failing tests should block the merge.',
    },
    cause: {
      options: [
        { text: 'git merge is the wrong command.', why: 'The command works. The process around it is the problem.' },
        {
          text: 'It skips review and checks that protect the shared branch.',
          why: 'A pull request and passing tests let the team catch problems before main changes.',
        },
        { text: 'You should push before merging.', why: 'Order is not the issue. Review is missing.' },
      ],
      answer: 1,
    },
    fix: {
      prompt: 'Write the steps you would follow instead.',
      title: 'Open a pull request',
      text: 'Push the feature branch, open a pull request, ask a teammate to review, and merge only after the checks pass.',
      example: 'git push origin feature/quiz-timer\n# open a pull request, get a review, wait for checks, then merge',
      criteria: [
        'Pushes the feature branch instead of merging locally',
        'Asks a teammate to review',
        'Waits for tests or checks to pass',
      ],
    },
    apply: {
      question: 'What is the main purpose of a pull request?',
      options: [
        { text: 'To back up your code.', why: 'Pushing a branch already does that.' },
        { text: 'To let teammates review and discuss changes before merging.', why: 'That is its main role.' },
        { text: 'To run the code faster.', why: 'It does not change how code runs.' },
      ],
      answer: 1,
    },
    origin: 'demo',
  };
}

module.exports = { provider, configured, readRequest, prompt, parse, draft, demo };
