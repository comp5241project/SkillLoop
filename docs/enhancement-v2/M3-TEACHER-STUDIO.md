# M3-03 local Teacher Authoring Studio

**Status:** isolated implementation submitted for independent acceptance. This page is a local draft editor, not a production teacher service.

## Start and use

From this worktree run `npm run dev:m3-studio`, then open `http://127.0.0.1:8773/`. The dedicated server binds to `127.0.0.1` only and serves this editor and its `/api/*` routes; it is separate from `npm run dev` and the production teacher APIs. `M3_STUDIO_PORT` may override the default port.

The page reads canonical `cart-checkout@1 / edge-cases` requirements and starter code through the M1 Student View. No second case-facts file is maintained. Enter a topic, level, one to three objectives with up to three published requirement references each, constraints, title, explanation, exact public starter-code excerpt, code-reading prompt, and one to three exercises with public hints and teacher-only answer guidance. Use Ctrl/Cmd in the requirement lists to select multiple IDs. The two example-brief buttons select the reviewed Mock scenarios. A teacher can also complete every material field manually without calling the Mock provider.

`Validate current form` checks but does not store it. `Keep manual draft in memory` creates a validated manual `TeacherDraft`. `Generate Mock Proposal` checks the brief and displays the proposed title, objectives, explanation, code activity, exercise, hints, teacher-only answer guidance and deterministic source label. The fixed templates do not satisfy arbitrary free-text constraints. The review panel lists which brief and content fields differ from the current form; the replacement confirmation repeats that list. `Reject proposal` leaves both the accepted draft and unsaved browser form intact. `Accept and replace draft` requires an explicit browser confirmation when the form is edited or a draft exists. The server also rejects replacing an existing draft without `confirmReplace: true`.

`Preview current form` validates the form and calls the existing M3 `draftPreview` allowlist. The panel says **Draft preview only** and excludes teacher answers, proposal internals, digest, private evaluation and publication state. All user text is inserted with DOM `textContent` or form `value`; the page never uses `innerHTML`. Answer guidance is visible only in the separate teacher editing and proposal review areas.

M3-03R preview state: any form edit or successful replacement of the form (including proposal adoption and manual snapshot reload) hides and clears a previous preview. A preview request hides the old result before validation; a response is displayed only if the form still matches the request snapshot. After adoption, the teacher must click `Preview current form` again to inspect the new material. Rejected or canceled proposals leave the current form unchanged. This prevents an older preview from appearing to describe newly adopted or invalid material.

## State and provenance boundary

The browser may hold incomplete edits. The accepted draft and the **original** controlled Mock Proposal objects stay in private Node process memory. The browser receives an allowlisted proposal display object and sends back only its `proposalId` for acceptance or rejection. The server calls `adoptTeacherProposal` or `rejectTeacherProposal` on the original object, retaining the M3-02R2 private WeakMap identity and snapshot checks. Serialized browser copies are never used as authority. A successful manual edit makes a new manual draft snapshot; it does not claim Mock provenance. There is no durable revision or conflict history yet.

Refreshing the page loses unsaved form edits but reloads the accepted in-memory draft. Restarting the server loses drafts and proposals. M3-04 adds an in-memory checkpoint and private JSON export/import; see `M3-DRAFT-CHECKPOINT.md` for its newer revision and import rules. The loopback server checks Host, same-origin POSTs and a studio-only request header, caps request size and applies a restrictive CSP. These controls are appropriate for a local prototype; they do not authenticate a teacher, isolate multiple local users or make teacher answer guidance safe to expose through a production API. Do not publish this server or proxy its routes to a remote audience.

There is no Publish action or route, database, account save, real AI call or production Module 2 integration. R06/R07 remain in progress. M4 handles durable persistence, identity and publishing authority. M2-06B remains deferred.

## Browser verification steps

1. Open the URL and verify the five published `cart-checkout` requirements and public starter code.
2. Click **Load beginner brief**, then **Generate Mock Proposal**. Inspect its source, objective, explanation, code observation, exercise and teacher-only answer guidance.
3. Type an unsaved explanation, click **Reject proposal**, and verify the text remains in the form.
4. Generate again, click **Accept and replace draft**, confirm replacement, and verify the local status is `mock-proposal · draft-only`.
5. Click **Preview current form**. Verify the preview says **Draft preview only** and has no teacher answer guidance.
6. Change the topic to a single character and click **Validate current form**. Verify a field-level topic error and that the current input remains.
7. Restart the server and verify the in-memory draft disappears. Do not expect account persistence.

Steps 1–7 were exercised in a real browser during implementation, including a field-level topic error, a manually edited `manual · draft-only` snapshot, and an empty studio after server restart. The proposal panel's field replacement list and the multi-select requirement control were also checked after the final change.
