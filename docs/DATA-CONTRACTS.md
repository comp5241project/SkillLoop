# Module and data contracts

## Public page routes

| Route              | Owner       |
| ------------------ | ----------- |
| `/`                | Shared home |
| `/knowledge-map/`  | Module 1    |
| `/learning-path/`  | Module 2    |
| `/interview/`      | Module 3    |
| `/correction-lab/` | Module 4    |

`/knowledge-map/` opens the public Knowledge Home; `/knowledge-map/my.html` is the student account network and `/knowledge-map/teacher.html` is the teacher studio. Existing sessions do not redirect public pages. Existing links such as `/knowledge-map/?topic=software-testing` redirect to the corresponding sample knowledge page. New direct links use `/knowledge-map/graph.html?graph=<graphId>`, `/knowledge-map/concept.html?graph=<graphId>&topic=<conceptId>`, `/knowledge-map/question.html?graph=<graphId>&question=<questionId>` and `/knowledge-map/case.html?graph=<graphId>&case=<caseId>`. A `version=` parameter opens a historical publication. Unknown IDs show an unavailable page. No SPA router or catch-all rewrite is needed.

## Concept IDs

`foundations`, `requirements`, `code-reading`, `software-testing`, `communication`, `ai-code-review`, `edge-cases`.

Titles may change without changing these IDs. Discuss ID changes with the learning-path owner. Map content is in `knowledge-map/data.js`; other modules link to concepts rather than importing that module's UI code.

## Browser-local storage

`shared/storage.js` exposes:

```js
const profile = SkillLoop.read('profile', {});
SkillLoop.write('profile', { background: 'beginner', goal: 'internship', diagnostic: 'no' });
SkillLoop.appendEvent({
  module: 'learning-path',
  type: 'path-created',
  conceptIds: ['foundations'],
});
SkillLoop.icons(); // after inserting a data-lucide placeholder
```

Storage keys are prefixed with `skillloop.v1.`. Use one key per module so pages do not overwrite each other's data.

| Key          | Shape                                                     | Writer                          |
| ------------ | --------------------------------------------------------- | ------------------------------- |
| `profile`    | `{background, goal, diagnostic?, quizScore?}`                          | learning-path                   |
| `knowledge`  | `{selected, completed: conceptId[], references?: Reference[]}` | historical Knowledge only |
| `knowledgeV2` | `{nodes: PersonalNode[], edges: PersonalEdge[]}` | historical Knowledge only |
| `knowledgeStudyV2` | `graphId:conceptId[]` for browser-local study marks | historical Knowledge only |
| `interviewStory` | `{schemaVersion:2, sessions, lastSessionId, lastView}` | interview |
| `interviewStudio` | Earlier interview records, read-only compatibility | historical interview |
| `correction` | `{draft, revealed, nextSeen, caseId, cases, teacherDraft?, authored?}`                     | correction-lab                  |
| `activity`   | `[{module, type, at, conceptId?, conceptIds?, caseId?}]`  | all modules through appendEvent |

`background` is `beginner`, `student` or `graduate`. `goal` is `internship` or `build`. Diagnostic `no` correctly rejects the claim that error-free execution guarantees correctness; `yes` indicates a foundation check is useful.

Study completion is self-reported, not proof of mastery. Activity is capped at 100 entries; current interview history holds 30 sessions and up to eight saved rewrites per answer. Interview inputs are capped at 1,500 characters; correction inputs at 5,000.

Learning-path keeps its full existing record under `skillloop_learning_path_data_v10` and also writes the selected background, goal and quiz score to shared `profile` when rendering a path. Interview reads the background for new sessions; existing interviews keep their original context. A quiz score is a routing hint, not proof of mastery. Correction `cases` contains per-case drafts, checks, flagged lines and attempts; `teacherDraft` is the editable draft and `authored` holds up to 20 browser-local published cases. See the module READMEs for complete shapes.

V1 `Reference` is `{id, version, addedAt, title, description, note}`. V2 personal reference nodes use `{id: graphId + ':' + conceptId, kind:'reference', graphId, conceptId, sourceVersion, titleSnapshot, descriptionSnapshot, note, x, y}`. Personal note nodes use `{id:'note:' + uuid, kind:'note', title, body, x, y}`; manual edges have `{id, source, target, reason}`. These browser key shapes are historical. Current Knowledge pages do not read or write them as personal data. No cleanup or migration runs.

## Knowledge backend contract

The optional backend is a Vercel Function at `/api/knowledge`. `GET ?op=public&graph=<graphId>` returns the current published payload; `version=<version>` selects an immutable historical publication. The browser falls back to `knowledge-map/data.js` only for the sample graph when no backend publication is available. The seven shared concept IDs remain stable, while each other graph has its own namespace.

Account operations use same-origin, HttpOnly cookies. `GET ?op=session` returns `{signedIn, email?, role?}`; `POST ?op=login` accepts `{email,password}` and `POST ?op=logout` clears cookies. A teacher can `GET ?op=my-graphs`, `POST ?op=create-graph` with `{title}`, `GET ?op=draft&graph=<graphId>`, `POST ?op=draft` with `{graphId,payload,expectedRevision}`, and `POST ?op=publish` with `{graphId,revision,reviewed:true}`. Saving returns a new revision; stale revisions return HTTP 409. Learners cannot read unpublished drafts.

Signed-in users can `GET ?op=personal` for account references, note nodes and manual links. `POST ?op=reference` accepts `{graphId,conceptId,sourceVersion?}` and is idempotent across the same graph and concept. `POST ?op=note` and `POST ?op=unreference` accept `{graphId,conceptId,...}`. `personal-note`, `remove-personal-note`, `personal-edge`, `remove-personal-edge` and `personal-position` handle owned personal graph edits. The existing `POST ?op=import-personal` remains available to authenticated accounts for API compatibility, but current Knowledge UI does not call it; its database RPC enforces account ownership. V1 account endpoints still default to the sample graph. A teacher can `POST ?op=discover` with `{query}`; it returns a private research note and HTTPS source links. See [backend setup](KNOWLEDGE-BACKEND.md).

The other modules still use browser-local prototype data. Knowledge study-mark editing is paused until an account progress API exists. Keep API credentials on the server.

## Interview and correction APIs

`/api/interview` supports `turn`, `review`, `rewrite` and `compare`. It returns validated AI output and retains the original student answers; without configuration the browser uses a labelled authored demo. `/api/correction` supports teacher case drafting, protected by `CORRECTION_TEACHER_CODE`; AI drafts require teacher review and publish only in the current browser. Both modules can use separate model overrides while retaining the shared Gateway default. Their AI endpoints do not create Knowledge account sessions or upload local records.
