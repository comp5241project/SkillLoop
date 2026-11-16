# Learning path — part 1: AI capability diagnosis

This module is the first of four parts that share one student-chosen case:

1. **AI capability diagnosis** (this page)
2. AI correction learning
3. AI dialogue correction
4. AI-assisted verification

A student can pick one of the three shared cases (`cart-checkout`, `quiz-permissions`, `notes-save`) to continue into Parts 2–4, or one of the three original Part 1 practice cases (`shopping-cart`, `quiz-platform-permissions`, `note-saving`). Part 1 asks the selected AI provider to write a fresh set of four case-specific checks, one for each knowledge point, then diagnoses the answers. The diagnosis is a planning aid, not a grade, an interview decision or a claim of mastery. Only shared cases are accepted by the Parts 2–4 handoff.

Every new attempt (including **Retake**) asks for a new question set. The authored questions in `data.js` remain the explicit fallback when live AI is unavailable or the learner chooses them after a generation error.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Case selection, four checks, result view |
| `data.js` | Original Part 1 practice cases, authored fallback questions, options and concept mappings (browser + server) |
| `shared-cases.js` | Shared Part 2–4 case snapshots; kept separate so the original Part 1 cases remain unchanged |
| `diagnosis-model.js` | Pure local diagnosis and shared question/output validation |
| `script.js` | DOM flow, provider selection, question generation, API calls, storage, result rendering |
| `server/questions.cjs` | Server-only question prompt, validation, normalization and randomized option order |
| `server/diagnosis.cjs` | Server-only diagnosis prompt, request validation and JSON schema |
| `style.css` | Module styles |
| `diagnosis-model.test.cjs` | Data, local diagnosis and shared validator tests |
| `questions-server.test.cjs` | Generated-question prompt, validation and normalization tests |
| `diagnosis-server.test.cjs` | Request boundary, prompt and validator tests |
| `../api/learning-path.mjs` | `GET` provider availability, `POST diagnose` / `questions` with provider routing |
| `../server/ai.mjs` | Shared AI service for all four parts |

## Fixed IDs

Shared case IDs must match `knowledge-map/learning-samples.js` when parts 2–4 are connected:

- `cart-checkout`
- `quiz-permissions`
- `notes-save`

The original Part 1 practice cases remain available but do not enter the shared handoff:

- `shopping-cart`
- `quiz-platform-permissions`
- `note-saving`

Concept IDs reuse the repository-wide stable set from `docs/DATA-CONTRACTS.md`:

`foundations`, `requirements`, `code-reading`, `software-testing`, `communication`, `ai-code-review`, `edge-cases`.

Each case declares four concepts in `data.js`. Authored fallback questions map to exactly one concept and keep stable IDs. AI-generated questions receive server-owned IDs such as `shopping-cart-requirements-ai-1a2b3c4d`; they are validated by the same shared rules and must also contain exactly one question per concept. The browser sends the generated set back with the diagnosis so the server can use the same prompts, options and evidence rules.

## Request contract

### Generate fresh checks

`POST /api/learning-path`

```json
{
  "action": "questions",
  "caseId": "cart-checkout",
  "aiProvider": "deepseek"
}
```

`aiProvider` is optional and may be `deepseek` or `shared`. The page sends the
learner's selection explicitly. If omitted, the server prefers direct DeepSeek
when configured and otherwise uses the shared AI configuration.

The response contains four normalized questions:

```json
{
  "source": "ai",
  "caseId": "shopping-cart",
  "questions": [
    {
      "id": "shopping-cart-requirements-ai-1a2b3c4d",
      "conceptId": "requirements",
      "prompt": "...",
      "strength": "...",
      "gap": "...",
      "options": [
        { "id": "choice-1", "score": 2, "label": "...", "feedback": "..." },
        { "id": "choice-2", "score": 1, "label": "...", "feedback": "..." },
        { "id": "choice-3", "score": 0, "label": "...", "feedback": "..." }
      ]
    }
  ]
}
```

The server writes one question per case concept from a fresh prompt variation and a temperature of `1.15`. It validates the raw model output, maps `best`/`partial`/`off` to scores `2`/`1`/`0`, assigns non-semantic option IDs and shuffles option order. `questions.cjs` rejects missing concepts, duplicate concepts, missing quality levels, duplicate labels and overlong text before returning `502`.

### Diagnose answers

```json
{
  "action": "diagnose",
  "caseId": "shopping-cart",
  "learner": { "background": "student", "goal": "internship" },
  "responses": [
    {
      "questionId": "cart-requirements",
      "optionId": "clarify-rules",
      "explanation": "I would ask for expiry and rounding rules first."
    }
  ]
}
```

Rules enforced by `learning-path/server/diagnosis.cjs`:

- `action` must be `diagnose`; `caseId` must exist.
- `questions` is optional. When present it replaces the authored fallback and must pass the shared `validateQuestions` rules.
- Exactly one response per active question, with a known `questionId` and `optionId`.
- `explanation` is optional and capped at 400 characters.
- `background` is `beginner`, `student` or `graduate`; `goal` is `internship` or `build`. Invalid values fall back to the defaults.
- The server derives the concept for each question; clients must not send concepts or prompts.
- Request bodies over 20 KB are rejected.

## Response contract

```json
{
  "source": "ai",
  "result": {
    "caseId": "shopping-cart",
    "overall": { "level": "developing", "summary": "..." },
    "dimensions": [
      {
        "conceptId": "requirements",
        "level": "ready",
        "evidence": "Ask for the exact rules...",
        "strength": "...",
        "gap": "..."
      }
    ],
    "priorities": ["edge-cases", "code-reading"],
    "nextSteps": ["...", "..."]
  }
}
```

`level` is one of `foundation`, `developing`, `ready`. `dimensions` must contain exactly one entry per case concept. `priorities` contains 1–3 case concepts. `nextSteps` contains 2–4 actions of at most 180 characters.

Evidence must be an **exact quote** from the selected option label or the learner explanation. `diagnosis-model.js` validates this in the browser and again on the server; a paraphrase or invented quote is rejected rather than displayed.

## AI service

All four parts call `server/ai.mjs`. Part 1 offers two providers in the page:

- **DeepSeek (Part 1 direct)** — the default, using the original Part 1
  settings and `https://api.deepseek.com/chat/completions`.
- **Team shared AI** — the same `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`
  client used by Parts 2–4.

```bash
# Direct DeepSeek provider
DEEPSEEK_API_KEY=...
# optional; defaults to the DeepSeek V4.1 Flash model id
DEEPSEEK_MODEL=deepseek-flash
# optional per-module override
LEARNING_PATH_AI_MODEL=...

# Team shared provider (same variables as Parts 2-4)
AI_BASE_URL=https://provider.example/v1
AI_API_KEY=...
AI_MODEL=...
```

`AI_GATEWAY_API_KEY` remains a migration fallback for the direct DeepSeek
provider when `DEEPSEEK_API_KEY` is not set. Both paths request a JSON object
and validate it against the Part 1 schema and evidence rules before returning
it. Question generation additionally sends `temperature: 1.15` and a random
variation token so each attempt gets a different set.

`GET /api/learning-path` returns `{ available, provider, model, contractVersion,
aiProviders, defaultAiProvider }` without exposing credentials. `POST` returns
`503` with `code: "ai-not-configured"` when the selected provider is unavailable.

The page never silently swaps modes:

- If `available` is `false`, the page loads **Authored sample checks**, labels them clearly, and the button says **Run sample diagnosis**. The result is labelled **Local sample diagnosis** and is not an AI judgment.
- If question generation fails or returns an invalid set, the page shows a retry error and offers **Use authored checks**. It does not render a hidden fallback.
- If a diagnosis request fails or returns invalid output, the page shows an error and keeps the learner's answers. It does not silently fall back to the local sample.
- A `503 ai-not-configured` response is the only automatic switch, and it is visibly labelled. A `503` after AI checks were already generated still keeps those checks for a labelled local diagnosis.

## Browser-local storage

The latest diagnosis is stored under `skillloop.v1.learningPathDiagnosis` via `shared/storage.js`:

```json
{
  "schemaVersion": 2,
  "caseId": "shopping-cart",
  "questionSource": "ai",
  "questions": [
    {
      "id": "shopping-cart-requirements-ai-1a2b3c4d",
      "conceptId": "requirements",
      "prompt": "...",
      "strength": "...",
      "gap": "...",
      "options": [
        { "id": "choice-1", "score": 2, "label": "...", "feedback": "..." }
      ]
    }
  ],
  "learner": { "background": "student", "goal": "internship" },
  "responses": [],
  "result": {},
  "source": "ai",
  "updatedAt": "2026-11-13T00:00:00.000Z"
}
```

The stored example is abridged; a real set has four questions with three options each.

`questions` stores the exact AI-generated set used for the attempt when `questionSource` is `ai`; authored records omit it. On restore the page validates the stored question set and revalidates every evidence quote against it before showing the result. Version 1 records with authored questions still restore. Invalid, incomplete or AI-labelled records without their question set are ignored; nothing is silently upgraded or claimed as AI-generated. The previous `skillloop_learning_path_data_v10` record is left untouched.

## Run and verify

```bash
npm ci
npm run dev          # open /learning-path/
npm run test:learning-path
npm test             # site + all module tests
```

`scripts/check.cjs` includes `learning-path/*.test.*`. The tests cover case/ID integrity, local diagnosis, shared question validation, generated-question normalization, evidence checks, request rejection, prompt isolation, the question action and the direct DeepSeek request/response path with a mock fetch. No live credentials are required.

## Notes for parts 2–4

- Import the same `data.js`; do not duplicate case or concept IDs.
- Call `server/ai.mjs` with your own prompt and validator.
- Read the saved diagnosis for the selected `caseId` and use its `priorities` as the starting focus.
- Keep AI output schema-specific and validate before rendering. Student text is untrusted data in every prompt.
- Do not add numeric grades, percentages, mastery claims or hiring predictions.
