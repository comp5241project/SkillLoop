# Enhancement v3 verification

## Reproduce

1. Start the app with the existing course database, account and AI configuration described in DATA-CONTRACT.md. From the home page, open Teacher Studio with a teacher account.
2. Upload cart-checkout-source.txt, open the extracted paragraphs, and generate notes. Review the exact source quotes for the empty cart and inclusive discount. Save a draft, refresh, and reopen it.
3. Choose the trusted Cart Checkout match. Check both diagnostic targets against the material, approve the preview, and publish. Open the public library in another browser context.
4. Start the same published version in two learner accounts. In A's real Part 1, select the off-target answer for the question about dividing by count and the best options elsewhere. In B's, choose the off-target answer for the discount question and the best options elsewhere.
5. Use the new link in the diagnosis result or resume from My Learning. Generate AI Personalized Learning. A sees the empty-cart requirement and its mapped notes; B sees the discount requirement and its mapped notes. Refresh each tab to recover the same lesson. Enter reasoning in the practice form. Try again if feedback fails; the answer remains saved.
6. Continue to Case Learning. Finish the required practice, repair plan and verification. The eight checks are run by the registered Cart Checkout runner. My Learning reports the actual verification outcome. Publishing changed notes as a new version should leave both old attempts pinned.

On Windows with Chrome installed:

    $env:M4_CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    npm test
    node --test --test-concurrency=1 tests/m4-browser.mjs tests/m5-browser.mjs tests/enhancement-v3-browser.mjs
    $env:V3_LIVE_AI = '1'
    node --env-file=.env.local --test tests/enhancement-v3-browser.mjs

All tests above use a disposable migrated PostgreSQL database and a local auth fixture. The serial regression command uses an injected deterministic transport for the v3 model calls. The live command calls the real configured provider for notes, matching, lessons and feedback. Both run the real Journey and runner. Set V3_SCREENSHOTS to an output folder to keep the studio review and both lessons as screenshots.

## Evidence and phase status

| Phase | Implementation and measured evidence |
| --- | --- |
| 0 — Audit | G0-ARCHITECTURE-AUDIT.md. Baseline npm test: 314 passed. Baseline M4/M5 real Chrome: 2 passed. |
| 1 — Contract | DATA-CONTRACT.md, additive migration and compatible M4 transaction helpers. HTTP test using real PostgreSQL proved review is required, a rejected companion insert rolls back the official version too, retry releases both records, and published snapshots cannot be updated. |
| 2 — Import | import.mjs extracts real document text. Tests: valid PDF, DOCX, TXT; image-only PDF; macro marker; bad ZIP signature, malformed UTF-8, empty/oversized files; HTTPS HTML, 404, password wall, private IP/DNS/redirect, timeout and size. Live pinned TLS fetch of https://www.example.org/: “Example Domain”, 156 extracted characters. |
| 3 — Notes | ai.mjs, model.mjs and teacher editor. Live model deepseek/deepseek-v4.1-flash-1017 produced five cited notes and four objectives from the checked-in TXT sample. The browser demonstrates teacher editing and draft reload. Invalid JSON and citations are refused and preserve the saved extract. |
| 4 — Match | Trusted index: cart-checkout@1 and retry-queue@1, filtered by all capabilities and actual approved runner. Live sample matched empty-cart and discount on cart-checkout; a separate interpolation source with an embedded instruction yielded correctly grounded notes and no suitable case. Fixtures reject invented case/version/requirement IDs and candidates without runners. |
| 5 — Builder | Steps: import → review → match → approve/publish. Tests exercise private drafts, edits, ownership, exact preview review, idempotent publishing and version freeze. Reviewed desktop screenshot and keyboard-focus styles. |
| 6 — Learner space | Public library over latest real versions, versioned course overview, real start, owner-only My Learning and resume. Tested draft privacy, permissions, invalid/expired tokens, pinned version and shared course login. |
| 7 — Personalization | Two authenticated students against the same real v1 publication, with persisted different Part 1 evidence. Live model rendered different notes, explanations and practice. Cache refresh, cross-student replay, feedback failure and answer recovery verified separately. Only the approved shared diagnosis link changes protected code. |
| 8 — Regression | Site HTML checks and static build pass. npm test: 318 passed, 0 failed. Final serial M4 + M5 + fixture-driven v3 Chrome regression: 3 passed, 0 failed (54.9 s). The v3 fixture run completed both learner paths through all eight runner checks. Desktop and 375 px learner screenshots reviewed. |

## Acceptance checklist

| ID | Result |
| --- | --- |
| A01 | Passed in the local test environment: pinned real HTTPS and actual PDF/DOCX/TXT extraction. |
| A02 | Passed with the live model and the browser's save/reopen flow. |
| A03 | Passed: two supported cases in the checked registry, correct live match and an unrelated source declined. |
| A04 | Passed with disposable PostgreSQL: authorized review, idempotent atomic release and strict immutable snapshots. |
| A05 | Passed: anonymous discovery, authenticated start, persisted owned progress, and pinned resume. |
| A06 | Passed with live AI: two real diagnoses in the same version yielded different topics, explanations and exercises. Refresh restored the generated content. |
| A07 | Passed: supplemental practice leaves the formal prerequisites intact. Each live learner finished canonical Case Learning, repair and all eight registered checks. |
| A08 | Approved link is the only protected diff. Baseline and final regression counts are recorded below. |
| A09 | Passed for tested import and auth failures, invalid AI output and citations, wrong-topic matching, version conflict, rollback and replay. Users can retry model failures without losing saved data. |
| A10 | Passed locally: this script, command list and evidence distinguish fixture transport, live AI and executable checks. Hosted setup is still a deployment step. |

## Live Chromium result

The final live run passed (1/1, 41.5 s) using deepseek/deepseek-v4.1-flash-1017 with the documented project TXT, disposable PostgreSQL and local auth fixture. Student A's practice concerned what to do before division to handle an empty cart; B's asked how a 150% discount differs from the valid 100% endpoint. Both resumed the same saved lessons after refresh and completed the same runner's eight checks. No fixture model was present in that run.

Earlier runs exposed two different matters. The browser originally expected “pass” while the actual persisted runner outcome is “passed”; the assertion was corrected. Some live model responses failed validation or feedback was unavailable; the tests now capture HTTP results, and the matching protocol keeps version and concept identity on the server to reduce model output complexity. Failure still leaves the draft or answer available for retry.

## Change inventory

- New implementation: enhancement-v3/{api,ai,import,model,store}.mjs and enhancement-v3/web/{index,studio,learning,course,lesson}.html, app.js, studio.js, styles.css.
- Course integration: api/courses.mjs (v3 operations and reuse of auth), enhancement-v2/m4-courses.mjs (teacher-only transaction helpers and isolation of managed courses).
- Entry and hosting: index.html, scripts/dev.mjs, scripts/build-static.mjs, vercel.json; extraction dependencies in package.json and package-lock.json.
- Protected exception: shared/course-journey.js, only the explicitly approved formal diagnosis link. No Part directory, stage API logic, runner or graph files changed.
- Schema and tests: supabase/migrations/20261116205059_enhancement_v3.sql; tests/enhancement-v3-{ai-fixture,browser,course.test,import.test}.mjs and tests/v3-fixtures/.

## Traceability and limitations

Source excerpt → cited teacher draft → approved immutable v3 and M4 version → authenticated learner's saved diagnosis target → approved notes mapped to that target → generated teaching and separately persisted practice → canonical Case Learning → repair → registered runner.

The sample document is a real project-authored TXT used for the demo; the user did not supply a separate upload for this run. PDF and DOCX tests use small real-format fixtures. Semantic review of source/claim alignment is the teacher's responsibility. Large documents must be excerpted; scan-only PDFs need a text edition. Catalog and personal list show the most recent 100 entries. AI coaching is supplemental: the formal practice, repair prerequisites and verification outcome remain controlled by the existing stage code.

No commit, push, merge, hosted migration, or deployment performed.
