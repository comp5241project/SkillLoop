# M3-04 local checkpoints, private JSON and revision conflicts

**Status:** isolated prototype submitted for independent acceptance. No account persistence, publication or production API is added.

## Source of truth and lifecycle

Run `npm run dev:m3-studio` and open `http://127.0.0.1:8773/`. The existing loopback server owns the current validated `TeacherDraft`, its revision, one optional saved checkpoint and any original controlled Mock Proposal. The browser owns temporarily incomplete, unsaved form input and the visible preview. A form edit hides and clears its previous preview. Validation and preview use the existing M3 contract and `draftPreview`; neither stores the form.

**Save Checkpoint** validates the form. If it matches the current draft, the server copies that draft into its checkpoint without changing revision or provenance. If it differs, the server creates a validated manual update with the same local `draftId` and revision N+1, then saves that snapshot. An invalid save leaves both current draft and previous checkpoint unchanged. **Reopen Checkpoint** requires confirmation and restores saved content; if this changes the current draft, the restored local copy becomes manual and revision increases. The checkpoint's original revision remains visible. The browser displays its held draft revision, current origin, checkpoint revision and unsaved-edit state separately.

The checkpoint is process memory, not a disk or account save. A server restart removes it, current drafts and proposals. Downloaded JSON is the only M3-04 way to carry teaching content across a restart.

## Private export and import

**Export private JSON** is an explicit user action. The UI refuses to export while the form has unsaved changes; the teacher must save a valid draft or checkpoint first. The loopback endpoint revalidates the server-held draft and returns a predictable `skillloop-cart-checkout-edge-cases-draft-<draftId>.json` filename and a document containing:

```json
{
  "format": "skillloop-teacher-draft-v1",
  "draft": "full validated TeacherDraft v1"
}
```

The actual `draft` value is an object with `schemaVersion`, `draftId`, `status`, `revision`, `caseRef`, `brief`, `content` and `provenance`. **It contains teacher-only answer guidance**, so the downloaded file is private teacher material. The export adds no credentials, server handles, WeakMap state or evaluation fixtures; teacher-entered guidance itself may contain sensitive material and remains private. There is no student-facing export route.

**Import JSON** reads a teacher-selected local file and posts it to the loopback server only after any replacement confirmation. The server checks JSON syntax, export format, exact top-level fields, schema version, UUID, positive revision, `draft-only` status, case identity/version/concept and public-facts digest via M1 Student View, requirement references, code excerpt and the full brief/content shape. A failed check leaves the draft, checkpoint and proposal unchanged; the browser leaves unsaved form edits in place. Successful import creates a **new local draft ID at revision 1**, restores editable content, clears the previous checkpoint and proposal, and hides the old preview. Import is not publication and does not authenticate the file or its author.

The original exported `provenance.origin` is treated only as a **declared historical label**. Every imported draft receives `{origin: "imported", proposalId: null, templateVersion: null}`. The UI can show, for example, “imported from declared mock-proposal (unverified)”. JSON does not recreate the original in-process Mock Proposal or its WeakMap authority. Editing imported content locally produces a manual revision. This is the minimum M3 contract extension for the import boundary; no other M1/M2/M3-02 security rule is weakened.

## Optimistic local conflict rule

Each mutating client request carries the `expectedDraftId` and `expectedRevision` observed by that tab (`null`/`null` when no draft exists). The server compares both against the authoritative current draft before a manual save, checkpoint save, reopen, import or proposal adoption. This uses the existing TeacherDraft revision, plus its identity; no independent counter is introduced. The identity check matters when adoption or import creates a new draft at revision 1 while an old tab also holds revision 1. A mismatch returns HTTP 409 with `revision-conflict`. It leaves server state and the caller's unsaved form intact. The UI shows a specific conflict warning and offers **Reload Latest**, which requires confirmation before replacing unsaved edits.

This is a single-process local demonstration. It does not provide multi-process locking, durable writes, cross-device sync or authenticated teacher ownership. M4 must define those boundaries before production use.

## Verification scope

Automated tests exercise real loopback HTTP routes for checkpoint save/reopen, invalid-save atomicity, export, fresh-session import, Mock-origin downgrade, malformed and inconsistent import rejection, two independent tab snapshots, stale writes, same-number revision with different draft IDs, and private-field exclusion. An event-handler test checks conflict UX, failed import preserving unsaved input and preview invalidation. Real browser smoke uses an isolated `127.0.0.1:8774` server; it does not disturb the user's 8773 process. Human/browser and automated results are recorded separately in `ACCEPTANCE-LOG.md`.

R06/R07 remain in progress. M3-05 and M4 production authorization/persistence remain separate. M2-06B real-model work remains deferred.
