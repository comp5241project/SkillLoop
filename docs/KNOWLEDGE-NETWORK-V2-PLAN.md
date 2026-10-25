# Knowledge network V2: pages, teacher spaces and personal graph

Decision record for `feature/zh`, 21 October 2026. Keep `knowledge-map/IMPLEMENTATION-PLAN.md` as the V1 plan. This document defines the next implementation after the V1 code and this plan have separate commits on the remote branch.

## Product paths

- `/knowledge-map/` opens the student's personal knowledge network. A guest uses browser-local data; a signed-in learner uses account data and may explicitly import local records. Sign-in never uploads local records automatically.
- A teacher shares a link to a published graph. Students can open it without signing in. The path is public graph → concept knowledge page → a question page or sourced case page. Existing `/knowledge-map/?topic=<id>` links from learning-path keep working by opening the matching concept in the original sample graph.
- Each of the seven seed concepts gets its own question page. The content model supports more concepts and multiple questions or cases per concept. Historical claims display source links and distinguish reported facts from teaching interpretation.
- A referenced teacher concept becomes one personal graph node with graph ID, concept ID, publication version and a source link. Referencing it does not copy its whole neighbourhood. When both ends of a teacher relationship are referenced, that relationship appears as read-only; the learner can also create notes, manually connect any of their nodes, arrange them, and inspect backlinks.
- Teachers enter through a separate portal to create graphs, visually edit nodes and relations, fill concept/question/case forms, research sources, preview every page level and publish a reviewed revision. AI research remains private until a teacher writes and reviews published material.

## Data and compatibility

- The current seven IDs remain valid in the sample graph, but new graph content has no seven-node product limit. Each graph has a server-generated global ID; concept IDs are stable within that graph. Published concepts are archived rather than deleted so references and deep links survive.
- Keep immutable publication versions and draft ownership. Public reads use `graphId`; teacher CRUD uses the owned graph ID. Personal graph nodes and links have owner-only database policies. References identify their source by `(graphId, conceptId)` and keep the version and a small snapshot to explain later changes.
- Extend the backend with a new SQL migration. Do not rewrite `20261021000100_knowledge_backend.sql` after its checkpoint commit. Preserve existing browser records and the old API calls during migration; offer an explicit import with deduplication.
- Use separate static HTML entry pages with query parameters, shared graph data loading, and no site-wide router rewrite. A locally pinned graph-layout library may be used for initial placement; manual positions remain authoritative. Search, focus, zoom, drag, list navigation and keyboard access must work for a graph of hundreds of nodes.

## Commit and delivery order

1. Write this document before new implementation.
2. Run V1 checks. Commit and push only the already implemented V1 files to `origin/feature/zh`; verify the remote commit. Do not force push.
3. Commit and push this document separately; verify the second remote commit.
4. Implement the new pages, visual teacher authoring, multi-graph APIs, personal graph and additive migration. Update contracts and instructions with the new routes.

## Acceptance

- Seven seed concepts each have a reachable question page; graph, concept, question and case links survive direct loading and refresh. Breadcrumbs return to the correct teacher graph.
- Anonymous learners see only published teacher content. Drafts and AI research are restricted to the owning teacher; a failed publication leaves the prior version readable.
- Duplicate references remain one node. Notes, manual links, teacher-source relationships and backlinks are correct across teacher spaces. A changed or archived source remains attributable. Local records import only on explicit action.
- A roughly 300-node graph supports search, focus, drag and zoom at desktop and phone widths, with keyboard-accessible list navigation. Run the static checker, backend tests and a browser walkthrough. Live database and AI checks require provisioned credentials.
