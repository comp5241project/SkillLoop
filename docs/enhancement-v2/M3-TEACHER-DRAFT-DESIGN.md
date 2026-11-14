# M3-02 isolated TeacherDraft and Mock authoring

**Status:** Implementation submitted for independent acceptance. This is a case-bound course-material prototype, not a production teacher account, publication service or student API.

## Provenance and scope

`legacy-adapter.cjs` converts the canonical `docs/team-samples/samples.json` and checks it against `shared/cases.json`. M3 reads `convertStudentCatalog(root)['cart-checkout']`, which applies M1's `studentView` validation and allowlist. There is no M3 copy of source requirements or starter code. `makeCaseRef` supports only `cart-checkout@1 / edge-cases` and hashes the entire returned Student View with SHA-256 after recursively sorting object keys while preserving array order. `validateCaseRef` re-reads the current Student View and recomputes that digest; a different version, concept, source wording or code fails closed. The `caseRef` stores only `kind`, identity and digest. `kind: case-bound` leaves a distinct future schema variant for standalone topic-based mini-courses; it does not assign a `caseId` to a standalone topic.

The source requirement namespace is `requirementId`. Draft `objectiveId` values start with `obj-`, and `exerciseId` values start with `ex-`. M1 `issueId` and `testId` are not accepted as requirement references. The public case view withholds issue and test details, reference repair and teacher drafts. M3 does not import evaluation material into a Mock request.

## TeacherDraft v1

```json
{
  "schemaVersion": 1,
  "draftId": "UUID",
  "status": "draft-only",
  "revision": 1,
  "caseRef": {
    "kind": "case-bound",
    "caseId": "cart-checkout",
    "caseVersion": 1,
    "conceptId": "edge-cases",
    "publicFactsDigest": "SHA-256 hex of canonical Student View"
  },
  "brief": {
    "topic": "Empty cart and numeric averages",
    "learnerLevel": "beginner",
    "objectives": [
      {"objectiveId": "obj-empty-cart", "text": "Explain the empty-cart result.",
       "requirementIds": ["empty-cart"]}
    ],
    "constraints": "Use one trace."
  },
  "content": {
    "title": "Trace the empty-cart average",
    "objectives": [
      {"objectiveId": "obj-empty-cart", "text": "Explain numeric zero and the guard.",
       "requirementIds": ["empty-cart"]}
    ],
    "explanation": "Teacher-authored or Mock-proposed explanation...",
    "codeExample": {"kind": "trace", "excerpt": "return total / count;",
                    "prompt": "Trace the empty-cart path..."},
    "exercises": [
      {"exerciseId": "ex-empty-cart-trace", "kind": "short-answer",
       "prompt": "What result is required?", "requirementIds": ["empty-cart"],
       "publicHints": ["Check the published requirement."],
       "teacherAnswerGuidance": ["Return numeric zero."]}
    ]
  },
  "provenance": {"origin": "manual", "proposalId": null, "templateVersion": null}
}
```

All objects use exact field sets; arrays must be dense and have no extra properties. Inputs and provider outputs are validated before deep-copying, so copying cannot silently discard hidden fields. Text lengths, one to three objectives and exercises, distinct local IDs, known requirement references, matching objective references and a nonempty teacher answer guide are checked. A `codeExample.excerpt` must be an exact substring of the current public starter code. The exact reviewed `referenceCode` cannot be pasted into public teaching text; this is a narrow private-material check, not a general semantic detector for fragments or paraphrases. These checks do not prove factual or teaching quality. The teacher's free-text constraints are recorded, but the two fixed Mock templates do not claim to satisfy arbitrary constraints.

`createManualDraft` requires teacher-provided complete content and no provider. Creating an empty or partial editing form is deferred to M3-03. Neither TeacherDraft nor Proposal contains canonical requirement text, starter code or a mutable Case Definition. Draft changes cannot rewrite source facts. A new Case Definition version remains a separate, later workflow.

## Separate TeacherProposal and explicit decisions

`TeacherProposal` has `schemaVersion: 1`, a UUID `proposalId`, `status: proposed`, validated `caseRef` and `brief` snapshots, proposed `content`, an optional `{draftId, revision}` base, and provenance. It has no draft ID for a new draft and never edits an existing draft when generated. The replaceable `provider.generate(request)` receives only the validated brief, case reference and a separately copied M1 Student View; its returned content is validated before becoming a Proposal.

M3-02R provenance repair: only an instance returned by `createMockTeacherAuthor()` receives `{origin: mock-proposal, templateVersion: m3-mock-v1}`. The Mock module keeps its instance set private; provider-supplied `source`, `origin` or version properties are ignored. Other providers can return valid content, but receive `{origin: unverified-provider, templateVersion: null}`. Process-local records of issued Mock proposal snapshots and adopted Mock draft IDs prevent caller-constructed or changed proposals and unadopted draft claims from validating as Mock. This is an in-memory prototype boundary, not authentication, durable attestation or approval of external content. A separately designed provenance scheme is needed before cross-process persistence. Manual drafts retain `manual` provenance.

M3-02R2 binds the trusted proposal snapshot to the original proposal object in a private `WeakMap`. A structured clone or JSON-deserialized copy has no trusted Mock authority even when its fields match exactly; editing the original breaks its snapshot match. Future M3-04 JSON import must not reconstruct process-local Mock authority automatically. Imported provenance can remain descriptive history, but cannot count as freshly verified generation authority. This does not add import/export behavior.

```json
{
  "schemaVersion": 1,
  "proposalId": "UUID",
  "status": "proposed",
  "caseRef": "same validated caseRef shape as TeacherDraft",
  "brief": "same validated brief shape as TeacherDraft",
  "content": "same validated content shape as TeacherDraft",
  "baseDraft": null,
  "provenance": {"origin": "mock-proposal", "templateVersion": "m3-mock-v1"}
}
```

For an existing draft, `baseDraft` is `{ "draftId": "UUID", "revision": 1 }` rather than `null`. The placeholder strings above denote schema shapes; they are not valid literal values for the validator.

`adoptTeacherProposal` is the only adoption operation. It validates the Proposal again and either creates a new `draft-only` TeacherDraft or updates content in a matching base draft while increasing its local revision. It rejects changed case references, changed briefs, stale revisions and proposals for a different draft. It preserves the proposal ID and its established Mock or unverified-provider provenance. `rejectTeacherProposal` returns a rejection decision and a copy of the unchanged draft. It does not persist or revoke the original Proposal; durable decisions and multi-user conflict prevention belong to M3-04/M4. Neither function grants teacher identity or publication authority.

The deterministic Mock has two reviewed combinations: beginner + `empty-cart`, and intermediate + `discount`. They differ in objective, explanation, exact public code excerpt, observation task, exercise and answer guidance. Other combinations fail with an explicit unavailable-template error. Proposal UUIDs vary by invocation; teaching content for the same brief and canonical facts is deterministic. Mock content is test material, not a real model result or evidence of learning improvement.

## Visibility and lifecycle

`draftPreview` is an isolated, public-style **draft preview only** projection. It validates the draft and copies only case identity, title, teaching objectives, explanation, public code trace, exercise prompts, requirement references and public hints. It excludes the teacher answer guide, provenance, digest and draft revision. It is not a student response or publication endpoint. It returns a new object with no mutable references to the TeacherDraft.

`draft-only` is the only TeacherDraft status. `published`, `approved` and extra fields fail validation. There is no production UI, save/reopen store, authentication, database, API, real AI or publishing in M3-02. R06/R07 remain **IN PROGRESS**: manual construction and Mock proposals demonstrate only the isolated data flow. R08–R10, standalone mini-courses, M2-06B real-model evaluation and four-module Case Definition integration remain deferred. No student-facing content should be served from this module without a separately reviewed authorization and publication boundary.
