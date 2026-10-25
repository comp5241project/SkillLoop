# Knowledge map implementation plan

Owner: `feature/zh` (`knowledge-map/`). This plan builds on the original static SkillLoop prototype and borrows product patterns from DevAtlas. The team approved extending the knowledge module with a backend. The code and deployment contract now exist; a live Supabase project and environment variables still have to be provisioned.

## Implementation status (21 October 2026)

- Phases 1–3 are implemented in `knowledge-map/` and exercised in a local browser, including phone layout and refresh persistence.
- Phase 4's API, SQL migration, teacher workspace, account-reference endpoints and AI source discovery are implemented. The cross-module contract and setup steps are in `docs/DATA-CONTRACTS.md` and `docs/KNOWLEDGE-BACKEND.md`. Mocked server tests run in CI.
- Live authentication, migration execution, OpenAI retrieval and deployment cannot be verified until the team supplies a Supabase project, teacher account and server environment variables. Browser-local records are deliberately not uploaded automatically.

## Outcome

A learner can explore a published software-development graph, understand why two concepts are connected, read a short lesson and a sourced real-world example, try a relevant practice activity, and keep a personal set of referenced nodes across refreshes. The existing learning-path links continue to open the same seven concept IDs.

## Boundaries and shared contracts

- Keep these public IDs stable: `foundations`, `requirements`, `code-reading`, `software-testing`, `communication`, `ai-code-review`, `edge-cases`. Keep `/knowledge-map/?topic=<id>` working; an unknown ID falls back to `software-testing`.
- Keep the existing `SkillLoop.read/write('knowledge', ...)` fields `selected` and `completed` readable. Completion is self-reported progress, not mastery or grading.
- Make routine implementation changes only in `knowledge-map/`. Agree any change to `shared/`, `docs/DATA-CONTRACTS.md`, the cross-module activity format, or server architecture with the other module owners before editing it.
- Treat DevAtlas as a design reference. Its React Flow components, Supabase transactions, role rules, and server-side model calls cannot be copied into this no-build static site as-is.

## Phase 1 — Make the existing graph data-driven

**Files:** `data.js`, `index.html`, `script.js`, `style.css`, `README.md`.

1. Extend the seven topic records with a category, core/extension path role, suggested order, and optional lesson sections. Preserve current lesson text until reviewed replacements are ready.
2. Add explicit relationships with stable IDs, `from`, `to`, `type`, and a short `reason`. Use `prerequisite` only for a genuine learning prerequisite; use `related` or another precise type for other connections.
3. Render node buttons and SVG connectors from topic/relationship data. Remove the separate hard-coded node list, index-based topic binding, fixed edge array, and fixed `index === 3` recommendation rule.
4. Let a learner select a relationship and read its direction and reason. Keep node and relationship selection keyboard accessible. On phones, show relationships in a readable list when connector lines are hidden.
5. Derive “suggested next” from the core order and local completion state. Do not lock other topics.

**Acceptance:** all seven old topic URLs, selection, lesson display, and study records still work after refresh; every rendered edge references existing IDs; a phone user can read every relationship without SVG lines; adding a topic requires a data change rather than a duplicate HTML node.

## Phase 2 — Mini-courses, evidence, and practice

**Files:** primarily `data.js`, `index.html`, `script.js`, `style.css`.

1. Give each lesson a consistent short format: learning goal, explanation, concrete example, one check-for-understanding question, and a next action. Keep author-reviewed content separate from UI code.
2. Add a small, curated `events` collection. Each event records a stable ID, event date, source title and HTTPS URL, publication date when known, an access/review date, a short summary, and links to one or more concept IDs with an explicit reason. Mark factual claims as source-supported or as teaching inference; show the source beside the claim.
3. Link events both ways: concept detail opens its related event, and an event links back to `/knowledge-map/?topic=<id>`. The first event should be manually sourced and reviewed. Do not describe it as AI-retrieved news.
4. Add one authored relation-judgment or scenario question for a suitable lesson. Show feedback and the relevant concept/relationship reason. Because answers ship in browser JavaScript, present this as practice, not secure assessment or automatic evaluation of free text.
5. Replace the single generic “Try a challenge” target with topic-specific entry points where a relevant exercise exists. Keep the existing correction-lab link for `software-testing` only if its case actually fits that lesson; do not imply other modules support a topic-specific route until their owners agree.

**Acceptance:** each new claim has a working, visible source link; event-to-topic links select the correct node; the question explains its answer; no AI claim is made for authored material; study completion survives a refresh.

## Phase 3 — Personal node references in this browser

**Files:** `knowledge-map/` only initially; update the shared data contract with the team before treating the new state as an integration API.

1. Add “Reference in my map” and a personal-map view. A reference points to a public concept ID; it does not create a second public concept. Duplicate clicks produce one reference.
2. Store reference metadata locally: concept ID, publication version at the time of reference, timestamp, and an optional personal note. Keep it separate from the self-reported `completed` set. Render notes with `textContent`.
3. Display current public content for the referenced ID and identify when its publication version has changed. Retain a small title/summary snapshot in the reference so the learner can see what was originally saved. Removing a reference must not delete the public node or its study record.
4. Decide the final storage shape with the team. The current `knowledge` contract is `{selected, completed}`; an optional `references` field is backward compatible for readers but should be documented before other modules consume it.

**Acceptance:** select one node, reference it twice, refresh, and see one reference with the same note; remove and re-add it; old `selected` and `completed` data still load; a simulated publication version change is visibly identified.

## Phase 4 — Teacher publishing and AI-assisted source discovery (team decision)

This phase requires a shared backend and is **not** part of a module-only static-page PR.

1. Agree roles, authentication, graph ownership, public read access, draft storage, versioning, and APIs with all four owners. Define how existing stable concept IDs map to server IDs before migration.
2. Build a teacher draft → preview → review → publish workflow. Learners read only published versions. A failed publish must leave the previous version readable; repeated publish/reference requests must not duplicate nodes.
3. Add a server-side source-discovery service if automatic historical news retrieval is still a goal. Record search query, model prompt, returned source URLs and retrieval date. The web-search provider does not expose every page excerpt supplied internally to the model, so teachers must inspect each source and manually record article/publication dates and supported claims in the draft. Require teacher review of relevance, factual claims, dates, concept links, and practice answers before publication.
4. Keep model credentials and any paid search credentials server-side. Distinguish retrieved evidence, AI-generated teaching inference, and the teacher-approved published text in the UI and stored data.
5. Plan a migration for browser-local references and progress only after account identity and privacy requirements are agreed. Until then, browser data remains device-local.

**Acceptance gate for backend work:** a written cross-module contract and deployable backend plan exist; teacher/student access tests cover unpublished drafts; publication preserves IDs and prior published content on failure; sources and generated drafts are reviewable before students see them.

## Suggested pull-request sequence

| PR | Owner and scope | Review focus |
| --- | --- | --- |
| 1 | `feature/zh`: Phase 1, only `knowledge-map/` | ID compatibility, graph semantics, keyboard and phone layout |
| 2 | `feature/zh`: Phase 2, only `knowledge-map/` | Lesson quality, source/date accuracy, honest practice wording |
| 3 | `feature/zh`: Phase 3 plus an agreed contract update | Persistence, duplicate references, version behavior, privacy |
| 4+ | Team-owned architecture and implementation for Phase 4 | Auth, draft isolation, publication, source provenance, costs |

For each module PR, run `python scripts/check_site.py`, try the changed flow through a local static server, refresh to verify persistence, and check a phone-width layout. Ask the learning-path owner to review any change to the meaning of a topic or suggested order because their module links to these concept IDs.
