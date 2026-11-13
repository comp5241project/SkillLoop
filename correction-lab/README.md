# Correction lab - module 4

Work mainly in this folder. `/correction-lab/` opens part 4 of the team flow (verification); see the next section for its files. The files below belong to the extra practice page and the teacher studio.

- `practice.html`: extra practice, the four steps of a reading case.
- `cases.js`: authored reading cases, based on the COMP5241 lectures.
- `script.js`: case switching, line flagging, multiple-choice feedback, stars and saved progress.
- `style.css`: styles unique to this module, including its larger system-font type.
- `case-check.js`: shape check for a case, shared by the browser and the server.
- `teacher.html`, `teacher.js`: case studio where a teacher drafts a case with AI, reviews it and publishes it.
- `server.cjs`: server-only AI code: teacher drafting (earlier provider settings) and the part 4 review (shared helper).
- `dev-server.cjs`: local preview that also runs the API. `server.test.cjs`: tests with a mocked AI.

Open `/correction-lab/practice.html`, or add `?case=agent-edits-test` to open one case. Unknown case IDs fall back to the first case.

## Part 4: AI-assisted verification

Open `/correction-lab/` (`index.html`), or add `?case=quiz-permissions` or `?case=notes-save`. This is part 4 of the team flow described in [docs/team-samples](../docs/team-samples/README.md): the learner applies the repair plan they confirmed in the repair dialogue and verifies it with real tests.

**Input** `{ case, dialogue, testSpecs }`. The case and its fixed tests come from the shared materials. The dialogue is the confirmed plan from part 3. `readPart3` at the top of `break.js` reads the current handoff through `shared/flow.js`, which rejects stale plans after upstream changes. For older standalone reviews it reads part 3's `codeReview` browser store and takes the output `{ caseId, aiSource, dialogue }` of the most recently confirmed review for this case (`latestPart3` in `break-runner.js`). Both parts must be served from the same site, because browser storage is per site. Without a confirmed plan the page says so and offers the labelled sample plan. `checkDialogue` in `break-runner.js` accepts it only when it is for the same case, `confirmed` is `true`, every issue of the case has one plan item, every check uses a test ID of the case, and each text field has 1 to 1000 characters (the same limit as part 3; the AI review receives the change requests up to that length). A plan that fails the check is not used, and the page lists the reasons. A new or changed plan clears this case's earlier choices, results and review.

**Flow**

1. **Your repair plan**: the plan as an acceptance checklist, with each check's live status.
2. **Try the app**: the app runs in a sandboxed frame; an issue is marked as reproduced when the learner really triggers it.
3. **Apply the plan**: for each issue the learner chooses the change that does what they asked for, or switches to editing the code. A wrong request leads to a wrong change, which the tests expose.
4. **Test results**: every shared test runs in a Web Worker (stopped after 3 seconds) and reports `pass`, `fail`, `error` or `not_run` with an actual result. `fail` means the behaviour is wrong; `error` means the code could not load or finish. Any change to the code makes earlier results `not_run`.
5. **AI review**: `POST /api/correction` with `action: "review"` sends the real results to the shared helper `server/ai.mjs`. The model returns only `aiReview` and `reviewTopics`; statuses and the outcome stay as the runner produced them. Without AI configuration, or after an error, the learner can show a labelled sample review built from the same results.
6. **Explain the fix**: one question per issue once every test passes.

**Output** `{ caseId, aiSource, verification: { testSource, tests, outcome, aiReview, reviewTopics } }`, shown on the page and stored under `verify` in the `correction` key. `testSource` is always `runner` here; `aiSource` is `api` only when the AI service answered. `outcome` follows the team rule: any fail is `needs_revision`, otherwise any error or not_run is `inconclusive`, otherwise `passed`.

| File | Purpose |
| --- | --- |
| `shared-samples.js` | Derived copy of the shared cases, tests and sample plans (`docs/` is not deployed). Regenerate with `node correction-lab/sync-shared.cjs`; a test fails when it is out of date |
| `levels.js` | What is needed to run each case here: app shell, issue detectors, an executable check per test ID, repair choices and questions |
| `index.html`, `break.js` | Page, sandbox harness, plan, results, review and output |
| `break-runner.js`, `break-worker.js` | Test runner, outcome rule and repair assembly, shared by the worker, the API and the Node tests |
| `break.test.cjs` | IDs match the shared materials; starter code needs revision; the shared reference passes; every wrong repair leaves a failing test |

AI configuration for the review uses the team variables `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` (see [AI setup](../docs/team-samples/AI-SETUP.md)). Teacher drafting below still uses its earlier provider settings until it is migrated. The review endpoint needs no teacher code, so the project owner should watch the shared quota.

The earlier reading cases (`practice.html`, `script.js`, `cases.js`) and the teacher studio (`teacher.html`) remain as extra practice outside the four-part flow. Their sections below describe them.

## How a case works

Each case shows a question and an AI answer split into numbered lines.

1. **Spot the problem**: tap the wrong lines, then check. Each marked line shows a note.
2. **Why is it wrong?**: choose the cause. Wrong choices explain why and can be retried.
3. **Fix it**: write a fix, then compare it with a reference answer and tick the criteria it covers.
4. **Apply it**: answer a related question to finish the case.

Steps 1, 2 and 4 are checked against the authored answer key and give up to three stars when right first time. The written fix in step 3 is not scored; the ticks are a self-check. Nothing calls an AI service or runs code.

## Cases

| Topic | Cases | Lecture |
| --- | --- | --- |
| Software engineering fundamentals | untestable requirements, a test with no assertion, wrong expectations for negative tests, verification versus validation | SDLC, Software testing |
| Effective use of AI coding agents | a big-bang request (Description), an agent editing a test to pass (Discernment, Delegation), an API key in browser code (Diligence) | AI in software development, AI-assisted practices |
| Soft and product skills | force-push advice, a story that is not Done, a user story with no user | Version control, Agile, Scrum |

The AI Fluency labels follow Anthropic's 4D framework mentioned in the project brief.

## Teacher case studio

Open `/correction-lab/teacher.html`. The teacher chooses a topic, learners and format, pastes lecture notes and names a mistake to plant. The server asks the AI for a draft in the same format as `cases.js` and rejects drafts that fail `case-check.js`, retrying once with the problems.

The teacher then edits every line, marks lines as Correct, Wrong or Related, and checks the options, fix and criteria. Publishing stays locked until the format check passes and all four review items are ticked. Any edit clears the ticks. AI never publishes.

In this prototype, **Publish** saves the case in this browser only, so it can be tried immediately as a student; it shows an "AI-drafted · Teacher-reviewed" label. **Export JSON** downloads the case so it can be added to `cases.js` through a pull request. Sharing with every student needs the team backend.

### AI configuration

The API key stays on the server. Set these in Vercel (Production and Preview) or in an uncommitted `.env.local`.

**Option 1, Vercel AI Gateway (preferred when set):** `AI_GATEWAY_MODEL`, for example `anthropic/claude-haiku-5.5`, plus `CORRECTION_TEACHER_CODE`. On Vercel the deployment's OIDC token is used, so no key is needed; locally set `AI_GATEWAY_API_KEY`. Set `CORRECTION_AI_MODEL` to override the shared model for this module. The interview can use its own `INTERVIEW_AI_MODEL`.

**Option 2, OpenRouter:**

| Variable | Value |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter key |
| `OPENROUTER_MODEL` | Up to three model IDs from [openrouter.ai/models](https://openrouter.ai/models), separated by commas, for example free ones ending in `:free`. OpenRouter tries the next one when a provider is down. |
| `CORRECTION_TEACHER_CODE` | Code a teacher types before drafting, so visitors cannot use the quota |

Without a teacher code and one complete provider, the studio runs in demo mode and loads a labelled sample draft. Free models have daily limits and may log prompts, so only send course material, never student data.

### Run locally

```sh
node --env-file-if-exists=.env.local correction-lab/dev-server.cjs
node --test correction-lab/*.test.cjs
```

The first command serves the site with the API at `http://localhost:8010/`. `python -m http.server` still works for the student page, but the studio then reports that the case server is not running.

## Adding a case

Append an object to `cases.js` with a new stable `id`, a `topic` and a shared concept ID. Line indexes in `flaws`, `related` and `notes` are 0-based. `related` lines are acceptable to flag but are not required. Ask a teammate to review the explanation before merging.

## Saved state

State uses the `correction` key. The top-level `{draft, revealed, nextSeen, caseId}` describe the open case, as in [data contracts](../docs/DATA-CONTRACTS.md). This module adds a `cases` field that maps each case ID to `{draft, revealed, nextSeen, checks, flagged, spotChecked, causeTries, applyTries}`. `checks`, `flagged` and the `*Tries` fields are arrays of indexes: self-ticked criteria, flagged answer lines and chosen options. Activity events use the existing shape: `reference-opened` and `case-completed`, each with `conceptId` and `caseId`. The teacher studio also stores `teacherDraft` (the case being reviewed) and `authored` (up to 20 cases published in this browser) under the same key.

## Shared changes to discuss at merge

Apart from one new file, this branch only changes `correction-lab/`.

- **`api/correction.js`** (new, about 30 lines): Vercel only runs functions from the root `api/` folder, so this thin endpoint calls `correction-lab/server.cjs`. It follows the same pattern as `api/dialogue.js` and needs no npm packages.
- **AI provider**: the interview branch uses Vercel AI Gateway and the knowledge-map branch uses an OpenAI key. This module uses OpenRouter for the demo. Each module may retain its own provider and model.

These shared edits are proposed for whoever merges:

1. **Icon**: use `search-check` instead of `scan-line` for the correction lab. One line in `shared/navigation.js` (`['correction-lab', 'search-check', 'Correction lab']`) and one in the root `index.html` card (`data-lucide="search-check"`). The icon is in the bundled Lucide library.
2. **Data contract**: in `docs/DATA-CONTRACTS.md`, change the `correction` row to `{draft, revealed, nextSeen, caseId, cases, teacherDraft?, authored?}` and add the descriptions above. The change is additive; no other module reads this key.
3. **Code Review Bureau**: the old prototype link has been removed from this module, which now replaces it. Remove the remaining mentions in the root `README.md` (Current behavior), `THIRD-PARTY-NOTICES.md` and the correction lab task in `docs/MODULE-TASKS.md`.

Check line flagging and the empty-selection message, wrong and right choices, the empty-fix message, the reference and ticks, the apply question, starting a case again, reload persistence, the lesson link and phone layout. See [team tasks](../docs/MODULE-TASKS.md).

The integrated project also runs all three API routes with `npm run dev` from the repository root. Shared setup and data contracts have been reconciled in the root documentation.
