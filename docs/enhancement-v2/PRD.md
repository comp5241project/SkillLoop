# SkillLoop Enhancement v2 — PRD

**Status:** Draft v0.1 — pending review
**Baseline:** M0 read-only audit of `main` at `392ff4f` (reported; independently verify before coding).
**Purpose:** Extend the existing four-stage learning app without destabilizing the submitted baseline.

## 1. Product goals

1. Make teaching cases reusable and versioned, without hardcoding each new case in multiple modules.
2. Generate meaningful AI teaching explanations and exercises based on a learner's diagnostic evidence, not merely AI feedback on static cards.
3. Give teachers control over AI-assisted authoring, editing, review and publishing.
4. Persist authorized published content and learner participation, while preserving the existing anonymous sample flow.
5. Keep the existing three cases and four-stage experience working.

## 2. Canonical requirements

| ID | Requirement | Priority | Acceptance evidence |
|---|---|---|---|
| R01 | Shared, versioned Case Definition | P0 | Existing three cases converted losslessly; immutable published versions |
| R02 | Four-stage interface/version contract | P0 | Consistent case/version identity and explicit mismatch handling |
| R03 | Contextual AI teaching generation | P0 | Different diagnosis evidence yields relevant explanation and exercise |
| R04 | Adaptive follow-up teaching | P0 | Correct, partial and incorrect answers lead to appropriate next steps |
| R05 | AI teaching validation | P0 | Schema, case references and factual constraints checked; bad output rejected |
| R06 | Teacher manual case/course draft editing | P0 | Create, save, reopen and edit draft without code changes |
| R07 | Teacher AI-assisted authoring | P0 | Topic/requirements produce editable draft, never auto-published |
| R08 | Teacher review and immutable publishing | P0 | Authorized review/publish, students see published versions only |
| R09 | Database persistence | P0 | Published content and learner attempt survive reload/re-login |
| R10 | Roles and resource authorization | P0 | API and DB reject unauthorized access and writes |
| R11 | Teacher engagement reporting | P1 | Actual visits, attempts and completion, not claimed mastery |
| R12 | Data-driven fourth case | P0 | New case loads in Module 2 without new case-specific branching |
| R13 | Fourth case integrated across four stages | P1 / team | Every stage tested; Part 4 requires a genuine runner fixture |
| R14 | Cross-domain mini-course and learner path | P2 | A second domain demonstrates model reuse |

**Important:** These R01–R14 labels are proposed as the canonical mapping for this draft. Earlier M0 labels may differ; confirm before freezing.

## 3. Core product distinctions

- **Case Definition:** Approved scenario, requirements, starter code, stable identifiers, published version, and supported capabilities.
- **Learning Material:** Reviewed explanations, exercises and AI-generated variants tied to case version and learning objectives.
- **Learner Attempt:** Private diagnosis, responses, feedback, progress and stage outputs.
- **Evaluation Spec:** Server-private issues, reference repair, hidden tests and execution fixture. Never expose this in student responses.

New learning content **does not imply** an executable Part 4. A learning-only case must display its limitations.

## 4. AI value experiment

Using the same existing shopping-cart case and topic, prepare two distinct valid diagnostic records. Generate a learning explanation and exercise for each. Check that differences are causally relevant to the learners' mistakes, not superficial paraphrasing. Test schema correctness, grounded references, failure handling, latency and a small sample of real API outputs. Compare with the current fixed-card fallback.

## 5. Teacher flow

Teacher selects or creates a case → enters learning objectives and constraints → requests AI draft → edits and validates → reviews → publishes a fixed version → student loads it → learner activity is recorded → teacher views participation.

Before DB and role checks exist, teacher screens may show **draft preview only**, never pretend to publish.

## 6. Safety and compatibility

- Preserve three current case IDs, existing links and anonymous sample usage.
- Never leak API keys, private tests, reference solutions or draft teacher material to students.
- Require server-side ownership checks and database row-level access control where appropriate.
- Keep published versions immutable; link old attempts to their original version.
- Show real AI failures; do not label mock output as live output.
- Do not infer mastery from clicks, visits or completion.

## 7. Open decisions

| ID | Question | Proposed default |
|---|---|---|
| D01 | Publish without Part 4 runner? | Yes, explicitly mark `learning_ready` only |
| D02 | Who authorizes publication? | Teacher owner reviews and publishes; AI only drafts |
| D03 | Reuse Knowledge v0.4? | Audit migration and permissions first; selectively reuse |
| D04 | Different historical Case IDs? | No silent renames; require explicit verified mapping |
| D05 | Learner data privacy and retention? | Minimal collection, defined access and deletion policy |

## 8. Out of scope for initial slice

Arbitrary GitHub code execution, auto-generated authoritative hidden tests, automatic unlimited course publishing, replacing all four modules, or treating the legacy knowledge graph as an already-compatible case system.

## 9. Status

This is a **proposal**, not an assertion that requirements or implementations have been approved. Validate against the real repository, team owners and official course brief before implementation.
