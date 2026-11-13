# SkillLoop Enhancement v2 — Acceptance & Decision Log

**Status:** Active initial log, 2026-11-14.
**Evidence policy:** A task is not PASS unless supported by reproducible test or review evidence.

## 1. Status definitions

`NOT STARTED` — no work; `IN PROGRESS` — implementation or tests underway; `REVIEW` — submitted for approval; `PASS` — criteria verified; `FAIL` — criteria failed; `BLOCKED` — external dependency; `NOT RUN` — not tested.

## 2. Milestone register

| Stage | Status | Evidence / caveat |
|---|---|---|
| M0 — Read-only audit | REVIEW | Conversation audit reports `main` @ `392ff4f`; no fresh test, production deployment or live DB verification |
| M1 — Contract | IN PROGRESS | M1-01/02 conditionally approved; isolated M1-03–05 evidence below. Shared interface approval remains open. |
| M2 — Dynamic AI learning | NOT STARTED | No A/B teaching-generation experiment yet |
| M3 — Teacher drafts | NOT STARTED | Legacy teacher functionality does not establish new case editor acceptance |
| M4 — Persistence and permissions | NOT STARTED | Actual DB migrations, RLS and publishing unverified |
| M5 — New case | NOT STARTED | Requires module-owner cooperation and real fixture assessment |

## 3. M0 findings (reported; not independently re-tested)

- Baseline: `origin/main` at `392ff4f`; separate `feature/knowledge-map` work exists and is not merged here.
- Correction to the earlier M0 review: current `main` uses `cart-checkout`, `quiz-permissions`, `notes-save` in all four checked case sources. No current-main ID alias migration is needed.
- Existing architecture reportedly includes three built-in cases, four stages, browser-local handoffs, predefined Module 2 cards, real AI feedback, teacher Knowledge draft/publish facilities and Supabase migrations.
- Gaps: shared versioned case definition, AI-generated teaching content, teacher-published cases flowing through four stages, durable attempts and new case execution fixtures.
- Relevant reported files: `shared/cases.json`, `shared/flow.js`, `knowledge-map/learning-content.js`, `knowledge-map/learning-server.mjs`, `knowledge-map/teacher.js`, `api/knowledge.mjs`, `supabase/migrations/`.
- **NOT RUN:** `npm test`, deployed UI, real database write/read, security rejection, AI generation comparison.

## 4. M1 isolated implementation evidence

- Branch/worktree: `feature/enhancement-v2` at `392ff4f`, `C:\Users\chu\Documents\ChatGPT\SE_project\SkillLoop-enhancement-v2`.
- Baseline before changes: `npm test`, static checks passed, 158 tests passed, 0 failed.
- M1-03: `enhancement-v2/legacy-adapter.cjs` reads canonical and deployed case copies, checks equality, then converts all three cases. It creates separate Student and Evaluation projections. `enhancement-v2/case-contract.cjs` pins requirement text fingerprints to editorial IDs and validates identity, issue/test references, version and declared runner availability.
- M1-04: New test compares each converted case's requirements, starter code, `aiClaim`, topic IDs, full public issues and tests against the canonical source; fixture test IDs must match exactly.
- M1-05: Seven new tests cover source ID alignment, exact data conversion, changed/reordered requirements, duplicate IDs, dangling references, invalid version, absent/mismatched runner, private evaluation preservation and Student View secret exclusion. This is an isolated projection test, **not** a deployed API or database authorization test.
- Final full-suite command/results: `npm test`; static checks passed; **165 tests passed, 0 failed** (158 baseline + 7 new). No real AI, live DB or deployed browser test was performed.
- Status: REVIEW. Four module owners have not approved shared interface changes; none were made.

### M1-05 independent review and corrective follow-up

- Independent review: **FAIL**. `studentView` copied unknown nested requirement fields, and executable capability trusted a caller-supplied `{ reviewed:true, runner:true, testIds }` object. R01/R02 and M1 were not marked PASS.
- Corrective change: Student projection now validates its input and rebuilds every included nested object/array from named fields. Structural validation is separated from executable capability validation. The latter consults an internal registry pinned to the reviewed Module 4 runner source hash, three exact `caseId@1` keys and ordered test IDs; caller fixture objects cannot authorize a case or a new version.
- Corrective tests: nested secret injection, nested array/object rejection, malformed inputs, projection independence, ordinary projections for all three cases, forged fixture and changed-version rejection.
- Reverification: `npm test` static checks passed, **167 tests passed, 0 failed** (158 original baseline + 9 isolated tests); `git diff --check` passed. `git status --short` lists only `docs/enhancement-v2/`, `enhancement-v2/` and `tests/enhancement-v2-case-contract.test.mjs` as untracked. This remains a local isolation and source-integrity check, not deployed API authorization, server-side hidden-test execution or four-stage version handoff.
- Status: REVIEW pending independent acceptance. Earlier FAIL retained above.

### M1-03–05 final independent acceptance and foundation delivery

- M1-03: **PASS** — read-only conversion of the three current case IDs; source records remain unchanged.
- M1-04: **PASS** — requirements, starter code, `aiClaim`, topics, issues and tests checked against the canonical cases; private reference material retained in the separate Evaluation View.
- M1-05: **PASS** — Student View validates and projects nested public fields; local Runner registration rejects forged approval, mismatched version/test IDs and changed reviewed source.
- Verification: `npm test` static checks passed; **167/167 tests PASS**. No blockers for isolated foundation delivery.
- R01/R02: **IN PROGRESS**. Published-version lifecycle, formal API authorization, cross-module version handoff and module-owner integration remain pending. This acceptance does not mark the entire M1 milestone PASS.
- Delivery authorization: commit only the eight named foundation files; no push, merge, migration or M2 implementation.

## 5. Open decisions

| ID | Decision needed | Default proposal | Status |
|---|---|---|---|
| D01 | Learning-only case publication | Allowed, without Part 4 claims | OPEN |
| D02 | Publish authorization | Teacher owner reviews and publishes | OPEN |
| D03 | Knowledge v0.4 reuse | Selective after migration audit | OPEN |
| D04 | Conflicting historical case IDs | No silent renames | OPEN |
| D05 | Learner privacy/retention | Minimize stored data, define policy | OPEN |

## 6. Review entry template

```md
### [Mx-xx] Task name
- Date:
- Requirement IDs:
- Base commit / branch:
- Approved plan / reviewer:
- Files changed:
- Automated tests: command, count, output/evidence:
- Browser test: URL, viewport, steps, screenshots:
- Real AI test: provider/model, number, outcomes, latency, errors (no keys):
- Real DB test: identity, read/write, authorization/denial, evidence:
- Legacy regression:
- Failures and remediation:
- Unverified assumptions:
- Status: REVIEW / PASS / FAIL / BLOCKED
- Commit / PR (only after approval):
```

## 7. M2 AI teaching evaluation

| Dimension | Question | Status |
|---|---|---|
| Structural validity | Correct schema and references? | NOT RUN |
| Case fidelity | No invented requirements or hidden facts? | NOT RUN |
| Personalization | Two diagnosis records lead to relevant different teaching? | NOT RUN |
| Teaching quality | Exercises and feedback fit target learner? | NOT RUN |
| Transparency | Real API vs fixture, failures and limitations labeled? | NOT RUN |
| Reliability | Latency, retry, failures and costs recorded? | NOT RUN |

## 8. Pre-merge checklist

- [ ] PRD numbering frozen and consistent with tasks.
- [ ] Shared contract reviewed by four module owners.
- [ ] Stable `main` unaffected; old cases regress successfully.
- [ ] No credentials, private answers or sensitive records committed.
- [ ] New tests reproducible through documented commands.
- [ ] AI real calls distinguished from mocks; failures visible.
- [ ] Real database read/write and negative permission tests passed.
- [ ] Teacher review, publication and version behavior verified.
- [ ] New cases without execution fixtures labeled correctly.
- [ ] Reviewer, commit, PR and known limitations recorded.
