# Correction lab - module 4

Work mainly in this folder.

- `index.html`: page layout and the four steps of a case.
- `cases.js`: authored cases, based on the COMP5241 lectures.
- `script.js`: case switching, line flagging, multiple-choice feedback, stars and saved progress.
- `style.css`: styles unique to this module, including its larger system-font type.

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

## Adding a case

Append an object to `cases.js` with a new stable `id`, a `topic` and a shared concept ID. Line indexes in `flaws`, `related` and `notes` are 0-based. `related` lines are acceptable to flag but are not required. Ask a teammate to review the explanation before merging.

## Saved state

State uses the `correction` key. The top-level `{draft, revealed, nextSeen, caseId}` describe the open case, as in [data contracts](../docs/DATA-CONTRACTS.md). This module adds a `cases` field that maps each case ID to `{draft, revealed, nextSeen, checks, flagged, spotChecked, causeTries, applyTries}`. `checks`, `flagged` and the `*Tries` fields are arrays of indexes: self-ticked criteria, flagged answer lines and chosen options. Activity events use the existing shape: `reference-opened` and `case-completed`, each with `conceptId` and `caseId`.

## Shared changes to discuss at merge

This branch only changes `correction-lab/`. These shared edits are proposed for whoever merges:

1. **Icon**: use `search-check` instead of `scan-line` for the correction lab. One line in `shared/navigation.js` (`['correction-lab', 'search-check', 'Correction lab']`) and one in the root `index.html` card (`data-lucide="search-check"`). The icon is in the bundled Lucide library.
2. **Data contract**: in `docs/DATA-CONTRACTS.md`, change the `correction` row to `{draft, revealed, nextSeen, caseId, cases}` and add the `cases` description above. The change is additive; no other module reads this key.

The page links to the team's [Code Review Bureau prototype](https://sonic-fiddle-gzb7c64.vercel.app/bureau.html). Its source code is separate and has not been imported.

Check line flagging and the empty-selection message, wrong and right choices, the empty-fix message, the reference and ticks, the apply question, starting a case again, reload persistence, the lesson link and phone layout. See [team tasks](../docs/MODULE-TASKS.md).
