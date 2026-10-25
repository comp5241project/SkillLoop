# Correction lab - module 4

Work mainly in this folder.

- `index.html`: page layout and the four steps of a case.
- `cases.js`: authored cases, based on the COMP5241 lectures.
- `script.js`: case switching, line flagging, multiple-choice feedback, stars and saved progress.
- `style.css`: styles unique to this module, including its larger system-font type.
- `case-check.js`: shape check for a case, shared by the browser and the server.
- `teacher.html`, `teacher.js`: case studio where a teacher drafts a case with AI, reviews it and publishes it.
- `server.cjs`: server-only AI drafting through OpenRouter, with validation and a demo sample.
- `dev-server.cjs`: local preview that also runs the API. `server.test.cjs`: tests with a mocked AI.

Open `/correction-lab/`, or `/correction-lab/?case=agent-edits-test` to open one case. Unknown case IDs fall back to the first case.

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

**Option 1, Vercel AI Gateway (preferred when set):** `AI_GATEWAY_MODEL`, for example `anthropic/claude-haiku-5.5`, plus `CORRECTION_TEACHER_CODE`. On Vercel the deployment's OIDC token is used, so no key is needed; locally set `AI_GATEWAY_API_KEY`. These are the same variable names as the interview module.

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

- **`api/correction.js`** (new, about 30 lines): Vercel only runs functions from the root `api/` folder, so this thin endpoint calls `correction-lab/server.cjs`. It follows the same pattern as `api/interview.js` and needs no npm packages.
- **AI provider**: the interview branch uses Vercel AI Gateway and the knowledge-map branch uses an OpenAI key. This module uses OpenRouter for the demo. The team should agree on one provider before release.

These shared edits are proposed for whoever merges:

1. **Icon**: use `search-check` instead of `scan-line` for the correction lab. One line in `shared/navigation.js` (`['correction-lab', 'search-check', 'Correction lab']`) and one in the root `index.html` card (`data-lucide="search-check"`). The icon is in the bundled Lucide library.
2. **Data contract**: in `docs/DATA-CONTRACTS.md`, change the `correction` row to `{draft, revealed, nextSeen, caseId, cases, teacherDraft?, authored?}` and add the descriptions above. The change is additive; no other module reads this key.

The page links to the team's [Code Review Bureau prototype](https://sonic-fiddle-gzb7c64.vercel.app/bureau.html). Its source code is separate and has not been imported.

Check line flagging and the empty-selection message, wrong and right choices, the empty-fix message, the reference and ticks, the apply question, starting a case again, reload persistence, the lesson link and phone layout. See [team tasks](../docs/MODULE-TASKS.md).
