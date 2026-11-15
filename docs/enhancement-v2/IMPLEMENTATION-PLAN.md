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
- M3-02: Isolated case-bound TeacherDraft and deterministic Mock proposal for reviewed objective/learner-level combinations; record teacher constraints without claiming arbitrary constraint satisfaction. Label Mock output and defer real AI, UI, saving and publishing.
- M3-03: Edit explanations, exercises and references; validate and preview.
- M3-04: Handle draft revisions and conflict UX.
- M3-05: Clearly label `Draft preview only` until M4 real publishing is complete.
- M3-06 (R07): Use the selected case version and teaching brief to generate a validated AI proposal. Keep generation, adoption, saving, approval and publishing as separate actions. Deterministic implementation verification and independent live-model acceptance are separate gates. See [R07 acceptance procedure](#r07-live-model-acceptance).

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

## R07 live-model acceptance

Use an isolated local course stack with the existing schema and teacher/student accounts. See [local environment setup](M4-COURSE-PUBLICATION.md). Configure the shared server-only `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` in the local environment. Select a provider and model that support the existing Chat Completions client and JSON text output. For providers that support it, use `AI_ENABLE_THINKING=false` if needed to keep response time within the per-call deadline. Start the app with `npm run dev`. Do not load the deterministic test preload for this run.

1. In Course Studio, sign in as a teacher. For `cart-checkout@1 / edge-cases`, choose `empty-cart` and ask for a beginner lesson that traces both operands and distinguishes starter behavior from the required result. For `retry-queue@1 / edge-cases`, choose `backoff-cap` and ask for a beginner lesson focused on a concrete attempt at the cap boundary. Enter a clear constraint on each brief and use only teaching material suitable for the configured provider.
2. Click **Generate draft with AI** once per brief. In the browser network panel, record the duration and status of `POST /api/courses/?op=generate`. Check each proposal for correct facts, exact starter code, appropriate learner level and constraint, matching requirement IDs, useful hints and separate teacher guidance. Count only proposals that pass both API and teacher checks. Record failures separately and include them in the denominator.
3. Discard a proposal and verify the form is intact. Generate again if needed, accept explicitly, edit and save, then verify the revision still requires Review and Approve before publishing. Check the student preview and immutable version link for absence of teacher guidance. Use a disposable lesson for the publication check.
4. Append the provider, configured model, attempts, accepted proposals, success rate, end-to-end latency per attempt and total actual billed cost with currency to the acceptance log. Use the provider's usage dashboard or billing records, preferably with a key dedicated to the run. Each structurally valid candidate uses a second inference call to review it. Include charges for retries, rejected proposals and checks. Record unavailable cost as unknown. Keep API keys, raw Auth tokens, proposal receipts and private prompt data out of the evidence.

### R07 API example

`POST /api/courses/?op=generate` uses the existing `sl_course_access` HttpOnly session cookie, same-origin JSON requests with `X-SkillLoop-Course: 1`, and the server-side teacher role check. Use `courseId: null` and `revision: null` for a new course. For an existing course, supply its ID and saved revision. The server checks ownership, revision and case binding before inference. The browser uses `op=save` only after explicit adoption, with the editable form and a signed `aiReceipt`.

Illustrative request for a new course:

```json
{
  "courseId": null,
  "revision": null,
  "caseRef": { "caseId": "retry-queue", "caseVersion": 1, "conceptId": "edge-cases" },
  "brief": {
    "topic": "Trace the retry backoff cap",
    "learnerLevel": "beginner",
    "constraints": "Use a concrete trace for attempt four.",
    "objectives": [{
      "objectiveId": "obj-trace",
      "text": "Explain how the delay cap affects attempt four.",
      "requirementIds": ["backoff-cap"]
    }]
  }
}
```

The teacher-only response has one `proposal` with `proposalId`, the canonical `caseRef` and its digest, the original `brief`, `content`, `provenance.origin: "ai-assisted"` and a signed `receipt`. Illustrative `proposal.content`:

```json
{
  "title": "Trace the retry backoff cap",
  "objectives": [{
    "objectiveId": "obj-trace",
    "text": "Compare the starter delay at attempt four with the required cap.",
    "requirementIds": ["backoff-cap"]
  }],
  "explanation": "At attempt four the starter computes 1600 ms. The requirement caps the delay at 1000 ms.",
  "codeExample": {
    "kind": "trace",
    "excerpt": "return 100 * 2 ** attempt;",
    "prompt": "Trace the expression at attempt four. Which result does the requirement permit?"
  },
  "exercises": [{
    "exerciseId": "ex-trace",
    "kind": "short-answer",
    "requirementIds": ["backoff-cap"],
    "prompt": "Write the starter result and the expected result for attempt four.",
    "publicHints": ["Compare the calculated delay with the published cap."],
    "teacherAnswerGuidance": ["Award credit for stating 1600 ms from the starter and 1000 ms after applying the cap."]
  }]
}
```

The teacher's explicit save persists AI-assisted origin in the private draft. A signed receipt expires after 24 hours or when the model API key rotates. An expired receipt can be replaced by generating and accepting a new proposal. The student projection drops private guidance and provenance. Review the free-text teaching quality before publication, since an automated semantic check can miss errors or reject a valid lesson. Hosted acceptance needs working course authentication and database policies, server-only provider configuration, function execution time for two sequential 25-second model-call deadlines plus application overhead, and provider spending controls.
