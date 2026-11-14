# M3 local Teacher Authoring Studio

**Status:** isolated implementation submitted for independent acceptance. This page is a local draft editor, not a production teacher service.

## Start and use

From this worktree run `npm run dev:m3-studio`, then open `http://127.0.0.1:8773/`. The dedicated server binds to `127.0.0.1` only and serves this editor and its `/api/*` routes; it is separate from `npm run dev` and the production teacher APIs. `M3_STUDIO_PORT` may override the default port.

The page reads canonical `cart-checkout@1 / edge-cases` requirements and starter code through the M1 Student View. No second case-facts file is maintained. Enter a topic, level, one to three objectives with up to three published requirement references each, constraints, title, explanation, exact public starter-code excerpt, code-reading prompt, and one to three exercises with public hints and teacher-only answer guidance. Use Ctrl/Cmd in the requirement lists to select multiple IDs. The two example-brief buttons select the reviewed Mock scenarios. A teacher can also complete every material field manually without calling the Mock provider.

`Validate current form` checks but does not store it. `Keep manual draft in memory` creates a validated manual `TeacherDraft`. `Generate Mock Proposal` checks the brief and displays the proposed title, objectives, explanation, code activity, exercise, hints, teacher-only answer guidance and deterministic source label. The fixed templates do not satisfy arbitrary free-text constraints. The review panel lists which brief and content fields differ from the current form; the replacement confirmation repeats that list. `Reject proposal` leaves both the accepted draft and unsaved browser form intact. `Accept and replace draft` requires an explicit browser confirmation when the form is edited or a draft exists. The server also rejects replacing an existing draft without `confirmReplace: true`.

`Preview current form` validates the form and calls the M3 `draftPreview` allowlist. Focus moves to **Student-facing draft preview — not published**. The lesson shows the title, learning objectives, referenced canonical case requirements, explanation, code excerpt and reading prompt, and exercises with expandable public hints. Teacher answers, editing controls, proposal internals, digest, private evaluation fixtures and reference solutions are outside the lesson. The renderer inserts teacher text with DOM `textContent`. Answer guidance remains in the teacher editor, proposal review and private JSON export.

Any form edit or successful replacement hides and clears the preview. A fresh request also clears the prior result. Only the current request can display a result or a validation error, and the form must still match its snapshot. This applies even when edits return the form to its original values. After adoption, import or reopening a checkpoint, click `Preview current form` to read the restored material.

## State and provenance boundary

The browser may hold incomplete edits. The accepted draft and the **original** controlled Mock Proposal objects stay in private Node process memory. The browser receives an allowlisted proposal display object and sends back only its `proposalId` for acceptance or rejection. The server calls `adoptTeacherProposal` or `rejectTeacherProposal` on the original object, retaining the M3-02R2 private WeakMap identity and snapshot checks. Serialized browser copies are never used as authority. A successful manual edit makes a new manual draft snapshot; it does not claim Mock provenance. There is no durable revision or conflict history yet.

Refreshing the page loses unsaved form edits but reloads the accepted in-memory draft. Restarting the server loses drafts and proposals. M3-04 adds an in-memory checkpoint and private JSON export/import; see `M3-DRAFT-CHECKPOINT.md` for its newer revision and import rules. The loopback server checks Host, same-origin POSTs and a studio-only request header, caps request size and applies a restrictive CSP. These controls are appropriate for a local prototype; they do not authenticate a teacher, isolate multiple local users or make teacher answer guidance safe to expose through a production API. Do not publish this server or proxy its routes to a remote audience.

M3-04 and its imported-source UI fix are in local commit `4702005`, separate from M2-06B (`156416c`). See the acceptance log for the historical M3-04 CONDITIONAL PASS and repair evidence.

R06/R07 remain in progress. M4 handles durable persistence, identity and publishing authority. Production learning handoff is deferred. Standalone mini-course authoring is a separate product architecture decision to resolve before designing M4 persistence.

## Reproducible M3-05 demos

### A. Manual empty-cart lesson

1. Click **Load beginner brief** to seed the brief and select `empty-cart`. Set **Teaching objective text** to “Trace an empty cart and return numeric zero.”
2. Set the title to “Trace the empty-cart average” and the explanation to “The empty cart must return numeric zero for its average. Check the count before dividing to avoid a zero denominator.”
3. Enter the exact code excerpt `return total / count;` and the code-reading prompt “Trace count and total when averagePrice receives an empty item array.”
4. Keep the exercise linked to `empty-cart`. Set the prompt to “What should averagePrice([]) return, and when should the function stop?” Add the public hint “Check the empty-cart requirement.” Enter “Avoid dividing by zero.” as teacher-only answer guidance.
5. Click **Keep manual draft in memory**, then **Preview current form**. Verify the empty-cart rule, the code and prompt, the exercise, and the expandable hint. The teacher-only guidance stays in the editor.

### B. Mock-assisted discount lesson

1. Click **Load intermediate brief**, then **Generate Mock Proposal**. Review the proposed discount endpoint activity, its references and teacher-only guidance. Click **Accept and replace draft** and confirm.
2. Append “Compare both endpoints before checking the invalid neighbors.” to the explanation and click **Save Checkpoint**. Optionally export private JSON.
3. Change the explanation, then click **Reopen Checkpoint** and confirm. Alternatively, select the downloaded file, click **Import JSON** and confirm replacement.
4. Click **Preview current form**. Verify that the saved explanation returns, the relevant discount rule replaces the empty-cart rule from scenario A, and the lesson contains the code activity, exercise and public hints. Confirm that guidance and editor actions are outside the preview.

## Historical M3-03 browser verification

1. Open the URL and verify the five published `cart-checkout` requirements and public starter code.
2. Click **Load beginner brief**, then **Generate Mock Proposal**. Inspect its source, objective, explanation, code observation, exercise and teacher-only answer guidance.
3. Type an unsaved explanation, click **Reject proposal**, and verify the text remains in the form.
4. Generate again, click **Accept and replace draft**, confirm replacement, and verify the local status is `mock-proposal · draft-only`.
5. Click **Preview current form**. Verify the preview says **Draft preview only** and has no teacher answer guidance.
6. Change the topic to a single character and click **Validate current form**. Verify a field-level topic error and that the current input remains.
7. Restart the server and verify the in-memory draft disappears. Do not expect account persistence.

Steps 1–7 were exercised in a real browser during implementation, including a field-level topic error, a manually edited `manual · draft-only` snapshot, and an empty studio after server restart. The proposal panel's field replacement list and the multi-select requirement control were also checked after the final change.
