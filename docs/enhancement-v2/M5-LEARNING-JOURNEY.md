# M5 learning journey handoff

The published lesson links to the learning journey. The URL carries the course ID and publication version across the four existing student pages. Each page checks the signed-in learner's attempt for that exact version. Publishing a later revision leaves the learner on the original version.

## Demonstration

1. In the Course Studio, create a draft for **QuizShop checkout**. Choose the empty-cart template, edit the material, save it, review the saved revision and publish. For the second case, create a draft for **Retry queue backoff**, write a lesson for the backoff cap, review and publish it.
2. Open the published lesson and follow **Start or resume the four-stage learning journey**. Sign in as a learner. In Part 1, choose the incorrect answer to the empty-cart code-reading check and the best answers elsewhere. In another learner attempt, choose the incorrect discount-boundary answer. Part 2 shows a different requirement, explanation, code trace and exercise for each attempt.
3. Answer the teaching question and explain the reasoning. Part 3 starts with the issue identified by the diagnosis. Ask the local guide a question, then write a repair request and choose a change for each issue. Save the plan.
4. In Part 4, run verification. Try an incorrect repair to see a failing test, then repair it and rerun. The cart has eight checks. The decision about retry delay has three. Reopen the draft in the teacher view to see aggregate counts for the relevant publication.

## Content and identity

| Stage | Existing contract reused | Evidence stored |
| --- | --- | --- |
| Part 1 | Canonical M1 Student View and the existing local diagnosis model | Actual selected options, learner explanations and deterministic priority |
| Part 2 | M2 deterministic template for supported targets, proposal shape and factual checks, plus the M4 snapshot | Selected answer, explanation and authored feedback |
| Part 3 | Existing dialogue plan and case-specific acceptance checks | Local guide turns, learner repair requests and selections |
| Part 4 | Existing runner, with a hash-pinned fixture and ordered test IDs | Actual statuses and observations, run time and latest run count |

A matching published requirement uses the teacher explanation and activities. For an unmatched requirement, Part 2 uses a validated, repository-owned deterministic template where available. A failed template uses the authored fallback and shows the fallback status. The teacher's immutable lesson remains accessible. The server derives target identity from diagnosis selections, and code excerpts and requirement IDs from the canonical case. M2's synthetic review records grant no authority over a real learner attempt.

The fourth case uses the same selector, rendering, stage engine and runner. Its questions, requirement targets and feedback are authored case data. The approved fixture executes only source assembled from repository-owned repair options. No source code or test payload from a learner request is executed. The learner sees public test descriptions and actual results. Teacher reporting exposes aggregate activity for owned publications.

## Reproduce locally

From the feature worktree:

```powershell
npm test
$env:M4_CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node --test --test-concurrency=1 tests/m4-browser.mjs tests/m5-browser.mjs
node scripts/build-static.mjs
```

The tests use an isolated real PostgreSQL database and a Supabase Auth fixture. The M5 migration adds journey state to the existing attempts and grants the existing application role the necessary column update. The deployment build includes the shared student client and keeps the new case data, runner and server code out of the static artifact.

For independent read-only acceptance, replay both checkout diagnosis paths, the fourth case, and an account switch in the disposable environment. Inspect PostgreSQL for the exact attempt/version, confirm a wrong repair produces a real failure, and verify that the original URL still returns version 1 after version 2 is published.

## Deferred gates

Live generation for the integrated journey remains off until authorized with spending controls and a real-learner review policy. The local feedback distinguishes selected answers and does not grade free-text reasoning or establish the full R04 adaptive follow-up requirement. The legacy routes remain available in their existing modes. Real Supabase Auth, deployment, and production rollout remain separate. M3-05 remains CONDITIONAL PASS with the real-browser acceptance item on the final project checklist.
