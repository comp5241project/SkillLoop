# Knowledge network - module 1

The [architecture and UX audit](docs/ARCHITECTURE-UX-AUDIT.md) records the current information architecture, user flows, implementation boundaries and refactoring risks.

`/knowledge-map/` opens the public Universe page. `/knowledge-map/my.html` opens the student account network. The former learning-path links such as
`/knowledge-map/?topic=software-testing` redirect to the sample graph's knowledge page.

| Page | Purpose |
| --- | --- |
| `index.html` | Four curated Exploration Units first; teacher-shared and original sample graphs remain secondary |
| `unit.html?unit=<id>&version=<v>` | Standalone, versioned Exploration Unit reading page; version is optional only when opening the latest |
| `direction.html?unit=<id>&version=<v>&direction=<id>` | Direction graph fixed through an explicit Unit Version |
| `my.html` | Student account references, notes, links and backlinks |
| `graph.html?graph=<graphId>` | Shareable published teacher graph |
| `concept.html?graph=<graphId>&topic=<conceptId>` | Knowledge and mini-course |
| `question.html?graph=<graphId>&question=<questionId>` | Dedicated question URL; seven sample concepts have one each |
| `case.html?graph=<graphId>&case=<caseId>` | Sourced historical case |
| `teacher.html` | Private multi-graph visual editor, content forms, AI research, previews and publishing |

`network-core.js` loads publications and draws a pannable, zoomable canvas; `public-pages.js` renders public content; `personal.js` manages the student's graph. `data.js` is the curated static sample. `script.js` and `style.css` remain as V1 source/history; the new pages use `network.css`. A public graph falls back to the curated sample only for the original sample graph while no backend publication is available.

Knowledge Home v0.3 keeps its manually reviewed Units and direction graphs in `curated-data.js`, with a browser/Node contract and explicit version resolution in `curated-model.js`. `curated-pages.js` renders them without using the published teacher graph API or account write operations. Excalidraw has V1 and V2 snapshots: old Unit links remain on V1 and retain their V1 graph. An unavailable pinned version shows an error and an optional manual latest link. Source review notes are in [the v0.3 source ledger](docs/KNOWLEDGE-HOME-V03-SOURCES.md). Run `node --test knowledge-map/curated.test.cjs` for focused content and version checks.

The personal network reads and writes account data only. Historical browser keys are left untouched and are no longer used by current Knowledge pages. A reference holds graph ID, concept ID, publication version and title/description snapshots. Its teacher relations appear only when both endpoint nodes are referenced. Note nodes and manual links can be arranged by drag; the list and search give keyboard access. Only an explicit successful sign-in navigates to the role workspace. Refreshing a public page does not redirect.

Teachers create multiple owned graphs. New concepts are unlimited by the seven sample IDs up to the validated 500-node payload limit. Drag positions are saved in the draft. A published concept stays in the payload when archived, preserving old links. Preview uses session storage in the current tab and traverses all page levels before a reviewed draft is published. AI research stays private until the teacher writes a sourced case.

Run `node --test api/*.test.mjs` and `python scripts/check_site.py`. For a visual stress check, open `/tests/knowledge-300.html` under a local static server. `node tests/mock-knowledge-server.mjs` starts an in-memory teacher API on port 8001 for a browser walkthrough; it does not test Supabase permissions or persist data. The [V2 plan](../docs/KNOWLEDGE-NETWORK-V2-PLAN.md) records the delivery order; [backend setup](../docs/KNOWLEDGE-BACKEND.md) covers migrations and deployment. The [V1 plan](IMPLEMENTATION-PLAN.md) remains unchanged.
