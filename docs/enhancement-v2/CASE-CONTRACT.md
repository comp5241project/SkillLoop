# SkillLoop Enhancement v2 — Case Contract

**Status:** M1 isolated contract review; not connected to production APIs or storage.
**Baseline:** verified `origin/main` at `392ff4f`; baseline `npm test`: 158 passed.

## 1. Compatibility

Verified current case IDs in `shared/cases.json`, `docs/team-samples/samples.json`, `learning-path/data.js` and `knowledge-map/learning-part1-cases.js`: `cart-checkout`, `quiz-permissions`, `notes-save`. Current `main` needs no case-ID alias migration. Historical branches with other IDs are a separate question; never equate IDs without comparing content and obtaining approval.

Existing four-module payloads and localStorage flow remain authoritative until adapters and regression tests are approved.

## 2. Three resource types

1. **Case Definition:** Stable, reviewed, published facts and capabilities.
2. **Learning Material:** Reviewed or AI-drafted teaching content referencing a case and learning goal.
3. **Learner Attempt:** Private user-specific evidence and outputs.

Private evaluation data is a fourth, **server-only** resource and must not be included in student case payloads.

## 3. Proposed Case Definition v1 (internal reviewed snapshot)

```json
{
  "schemaVersion": 1,
  "caseId": "cart-checkout",
  "caseVersion": 1,
  "status": "published",
  "title": "QuizShop checkout",
  "scenario": "Exact published scenario from the source case.",
  "aiClaim": "Exact AI delivery claim from the source case.",
  "requirements": [
    {"requirementId": "quantity", "text": "Exact source requirement text"}
  ],
  "starterCode": "// exact student-visible starter code",
  "topicIds": ["requirements", "code-reading", "software-testing", "edge-cases"],
  "conceptIds": ["requirements", "code-reading", "software-testing", "edge-cases"],
  "publicIssues": [{"issueId": "negative-quantity", "title": "...", "topicIds": ["requirements", "edge-cases"], "observed": "...", "suggestedChange": "...", "suggestedChecks": ["reject-negative"]}],
  "publicTests": [{"testId": "reject-negative", "issueId": "negative-quantity", "action": "...", "expected": "..."}],
  "capabilities": {
    "diagnosis": true,
    "learning": true,
    "repairDialogue": true,
    "executableVerification": true
  }
}
```

This is an abbreviated shape example, **not** the full cart case. The isolated `enhancement-v2/legacy-adapter.cjs` produces full read-only copies of the actual source fields. `schemaVersion` denotes the Case Definition format, not existing diagnosis schema versions. `caseVersion=1` is a proposed snapshot identity for the three legacy cases, not a claim that they were published to a database.

Requirement IDs are explicit editorial mappings per case. The current source has string arrays, so the adapter checks SHA-256 fingerprints of every exact requirement string in its reviewed order before assigning IDs. A changed or reordered requirement fails conversion until a human reviews the new wording, ID and version; array positions are never treated as permanent public IDs. `topicIds` preserves the current shared case field; `conceptIds` is an equal-valued compatibility alias in v1. Any future difference requires an approved mapping, not silent normalization. Issue IDs and test IDs are copied unchanged; duplicate IDs and references to missing issues/tests are rejected.

Capabilities are claims about actual resources, not UI wishes. `validateDefinitionShape` checks the data shape; `validateDefinition` additionally resolves `executableVerification` through the internal `trusted-runner-registry.cjs`, never a caller-provided approval object. This local registry pins the reviewed `correction-lab/levels.js` file SHA-256, the three `caseId@1` entries and their ordered test IDs. Any changed file, missing runner, changed test list or unregistered case version is rejected. It proves only consistency with the reviewed repository file; it does not establish a deployed API authorization boundary or make browser Worker fixtures secret. Future published cases need an explicit reviewed registry update. Without one, `executableVerification` must be false; Module 4 must be labelled unavailable. Diagnosis, learning and dialogue capabilities also require corresponding validated resources before a new case is published. The legacy adapter marks them true because their current resources exist; this does not imply the production APIs consume the new definition.

## 4. Server-private Evaluation Spec

Linked by `(caseId, caseVersion)`; includes stable `issueId`, `testId`, relevant requirement references, `referenceCode`, private repair criteria, hidden assertions and optional `runnerFixtureRef`. None of `referenceCode`, private evaluation rationale, hidden assertions or teacher drafts may enter Student View. AI-suggested tests are not proof that code passed real execution.

The existing `publicTests` action/expected text is currently student-visible teaching material in Module 4, but the generic Student View withholds tests and issues to avoid revealing a fix before the relevant stage. A future stage-specific projection may deliberately reveal reviewed test descriptions at the appropriate time. Existing Module 4 Worker code and bundled fixture data are browser-readable and must not be described as secret. Truly hidden authoritative tests require server-side execution and a separate design review; the isolated M1 files do not provide it.

## 5. Learning Material v1

```json
{
  "materialId": "material-uuid",
  "caseId": "cart-checkout",
  "caseVersion": 1,
  "conceptId": "software-testing",
  "contentVersion": 1,
  "status": "draft",
  "learningObjective": "Identify missing edge-case tests.",
  "explanation": "...",
  "exercise": {"kind": "open", "prompt": "What would you test?"},
  "evidenceRefs": ["quantity"],
  "origin": "ai_draft",
  "reviewedBy": null
}
```

AI material is editable, identifiable as generated, and must pass structural and factual review before publication. Learner-personalized temporary cards do not overwrite teacher-published versions.

## 6. Proposed handoff envelope

```json
{
  "contractVersion": 1,
  "caseId": "cart-checkout",
  "caseVersion": 1,
  "stage": "learning",
  "attemptId": "attempt-uuid",
  "output": {
    "caseId": "cart-checkout",
    "aiSource": "api",
    "learning": {
      "studiedTopics": ["software-testing"],
      "needsPractice": ["software-testing"],
      "practiceFocus": ["Add edge-case regression tests"]
    }
  }
}
```

The example `output` represents a Module 2-style payload only; do not force other modules into the same internal shape. Preserve existing fields using version-aware adapters. `questionSource`, `source`, and `aiSource` have distinct meanings.

## 7. Public vs private views

- **Public manifest:** Published case ID, version, title and verified capabilities.
- **Student view:** `studentView` validates the definition itself, then constructs a field allowlist at every included level: identity/version, title, scenario, `aiClaim`, requirement ID/text pairs, primitive `topicIds`/`conceptIds`, starter code and the four named capability booleans. Unknown nested fields are rejected or omitted, and returned arrays/objects do not alias the source. Issue/test details are withheld by this generic projection; stage-specific release is a separate interface decision. Approved learning materials are separate resources. This has local tests only; a future formal API must enforce its own authorization and response isolation.
- **Teacher view:** Authenticated owner/editor draft plus revision, editable materials, review state and AI proposal provenance. It is not the public case projection.
- **Evaluation view:** Server-only `referenceCode`, implementation note, full legacy issue/test records, private repair criteria, hidden assertions and fixture references, all tied to the exact case version. The isolated conversion preserves legacy reference code and notes in this view. Existing browser Worker fixtures remain public by their delivery mechanism.

Do not assume a particular API path or database schema until M1 reviews existing code.

## 8. Version and lifecycle rules

- Drafts are mutable; published `(caseId, caseVersion)` snapshots are immutable.
- Attempts remain linked to the version used when created.
- Version mismatch cannot silently reuse outdated diagnosis or evaluation results.
- New version publication cannot silently rewrite historical attempts.
- New case capabilities must be backed by actual resources; no runner means no executable verification.
- Anonymous-to-authenticated attempt migration remains an open decision.

## 9. M1 contract acceptance

- [x] All three legacy cases mapped in isolated files without losing requirements, starter code, `aiClaim`, topic IDs, public issue fields or test fields; reference code remains outside Student View.
- [ ] Version mismatches are rejected or explicitly handled.
- [x] Isolated Student View projection excludes hidden answers and unpublished teacher content; no formal API has been changed or verified.
- [ ] Unconfigured Part 4 clearly marked unavailable.
- [ ] Old anonymous/sample and four-stage flows regress successfully.
- [ ] Four module owners review the interface impact before integration.

## 10. Open issues

Concept vocabulary ownership; historical-branch ID mappings (none needed on current `main`); integration with Knowledge v0.4; caching personal AI content; publication withdrawal and record retention; anonymous account conversion; server-side authoritative hidden-test execution.
