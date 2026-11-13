# SkillLoop Enhancement v2 — Implementation Plan

**Status:** Draft v0.1; requires approval.
**Inputs:** `PRD.md`, `CASE-CONTRACT.md`, M0 read-only audit.
**Baseline:** `origin/main` @ `392ff4f` verified after fetch; isolated `feature/enhancement-v2` worktree baseline passed 158 tests.

## 1. Engineering constraints

Work in an isolated worktree and `feature/enhancement-v2` (or another approved name), not directly on the stable `main` or a dirty Knowledge feature branch. Do not modify shared four-stage interfaces without owner approval. No production database migration without a reviewed plan and rollback. No keys in Git. Do not push, merge or claim acceptance without authorization and evidence.

## 2. Milestones

| Milestone | Requirements | Deliverable | Gate |
|---|---|---|---|
| M0 — Read-only audit | All | Existing functionality, risks and gap report | Completed as read-only review; tests not rerun |
| M1 — Case contract | R01 R02 R12 | Schema, legacy read-only adapter, version/visibility tests | Owner approval and regression |
| M2 — AI dynamic learning | R03 R04 R05 | One case, two diagnosis profiles, distinct grounded AI cards | Real AI sample, validation, fallback |
| M3 — Teacher drafts | R06 R07 | AI draft, edit, preview, validation UI | Teacher can review without fake publishing |
| M4 — DB, roles, publish | R08 R09 R10 R11 base | Real persisted publish and learner attempts, authorization | DB read/write, RLS and negative tests |
| M5 — Fourth case | R12 R13; R14 optional | Data-driven case and declared stage integration | Existing cases regress, no fake runner |

## 3. Detailed tasks

### M0 — Audit (already reported)

- M0-01: Confirm Git branch, baseline and untracked files.
- M0-02: Inventory case data, four modules, shared handoffs, teacher UI, AI endpoints and Supabase migrations.
- M0-03: Identify legacy Knowledge branch reuse and migration hazards.
- M0-04: Record observed facts separately from unrun tests.

### M1 — Contract and compatibility (next)

- M1-01: Review PRD IDs and decisions D01/D04 with module owners. The current three IDs agree across all four checked sources; historical-branch aliases are deferred.
- M1-02: Define machine-validated public case and Student projection now; private evaluation, material and attempt storage schemas remain design-only until owner review.
- M1-03: Implement an **isolated read-only** adapter for all three legacy cases, preserving actual IDs and content. No existing module, `shared/flow.js`, API, migration or case source is edited.
- M1-04: Diff requirements, starter code, issue IDs and test IDs against source fixtures.
- M1-05: Test invalid references, duplicate IDs, invalid versions, unbacked executable capability and Student projection leakage. The corrective pass adds nested-field and mutation tests plus a local, source-pinned Runner registry; caller-provided fixture approval is ignored. Cross-stage version mismatch and formal API authorization remain for later approval gates.
- M1-06: Prepare interface impact report. Stop before editing `shared/flow.js` or formal stage contracts without approval.

### M2 — AI teaching value

- M2-01: Select one existing case, one concept and two contrasting valid diagnosis records.
- M2-02: Define `GeneratedLearningCard` schema and permitted case facts/references.
- M2-03: Generate explanation plus exercise through existing server-side AI architecture.
- M2-04: Isolated student-delivery projection, synthetic review gate, narrow factual checks, malicious-content tests and bounded timeout/cancellation. Human quality scores, real-model injection behavior and production authorization remain pending.
- M2-05: Show two different relevant teaching experiences and safe fallback to fixed cards.
- M2-06: Record real API latency, success, retries, cost where available and human teaching-quality assessment.

### M3 — Teacher authoring

- M3-01: Review existing teacher components and authorization assumptions.
- M3-02: Generate AI drafts from objectives, learner level and constraints.
- M3-03: Edit explanations, exercises and references; validate and preview.
- M3-04: Handle draft revisions and conflict UX.
- M3-05: Clearly label `Draft preview only` until M4 real publishing is complete.

### M4 — Persistent publishing and access

- M4-01: Audit actual Supabase schema and Knowledge v0.4 migration history.
- M4-02: Implement versioned case/material drafts, immutable publication, learner attempts, ownership and RLS.
- M4-03: Test teacher owner success and student/anonymous/other teacher rejection at API and DB levels.
- M4-04: Verify re-login and cross-session persistence and old anonymous sample behavior.
- M4-05: Provide engagement views based on actual events, not mastery inference.
- M4-06: Verify transactions, failure rollback, deployment config and data minimization.

### M5 — Fourth case and integration

- M5-01: Publish a fourth case without Module 2 case-specific branches.
- M5-02: Complete AI learning activity and persist the attempt.
- M5-03: Coordinate Part 1, 3 and 4 contracts with their owners.
- M5-04: Mark Part 4 unavailable until a reviewed execution fixture exists.
- M5-05: Mark four-stage integration PASS only after all four actual stage tests pass.
- M5-06: Run old-case regressions and prepare a reproducible demo.

## 4. Codex task protocol

Before edits, report: requirement ID, task ID, exact branch/commit, files read, proposed files changed, dependencies, test plan, rollback and stop conditions. Stop if an assumption about permissions, database state, stage interfaces or hidden tests cannot be verified.

After edits, report: diff, commands and outcomes, real vs mocked AI/DB evidence, failures, remaining risks and the matching `ACCEPTANCE-LOG.md` entry. A statement such as “tests pass” without logs is insufficient.

## 5. Verification standards

- Run repository's real default test command (reported as `npm test`, verify first).
- Use deterministic AI fixtures for routine tests and a separate real API smoke test.
- Verify persistence with actual DB writes/reads, not localStorage or mocks.
- Check unauthorized access, loading/error/retry, desktop and narrow viewports.
- Retain old case behavior and do not pretend AI-generated tests executed successfully.
- Review diffs before commit and PR; no automatic push/merge.

## 6. Gates

G0: PRD and M0 accepted. G1: Case contract and module owners approve. G2: AI teaching experiment demonstrates meaningful personalization. G3: Teacher draft flow works. G4: Real DB/authorization/publishing passes. G5: Fourth case and old-case regression pass at the declared capabilities.

## 7. Immediate next action

Have Codex review these four files against the actual repository and propose M1-01/M1-02 decisions and schema. **Do not authorize coding yet.**
