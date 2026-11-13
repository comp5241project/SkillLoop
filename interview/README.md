# Repair dialogue — module 3

The default page now lets students review an AI developer's delivery and discuss corrections. Maya responds to the conversation; students can question an explanation, reject a proposal, revise earlier requests and confirm a repair plan. There is no fixed turn count. Live AI generates the opening from the case, assessment and learning handoff: task context, actual implementation and one focused review question. No fixed question is selected by case ID. Failed openings remain retryable; sample mode retains a labelled authored opening.

## Run and connect

Run `npm run dev` from the repository root, then open `/interview/`. Start a sample review, or use **Start with AI** after configuring the shared server variables `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`. Optional `AI_ENABLE_THINKING` follows the shared helper. Keep credentials server-side and restart or redeploy after configuration changes.

The new `/api/dialogue` endpoint calls `server/ai.mjs`. Sample mode uses labelled, keyword-based preset replies; it does not assess students. Failed live calls retain the submitted message for retry and never silently fall back to sample mode. Bailian qwen-plus has been tested locally with two live conversation turns.

## Team handoff

Use the unchanged definitions in `docs/team-samples`. Choose one of the three sample cases, or import the agreed `part3.input` object containing `case`, `assessment` and `learning`. Case requirements and starter code come from the shared catalogue.

**Review plan** opens an inline summary below the conversation. Students can edit requests, confirm them or continue talking without losing the conversation. **Download part 3 output** exports the existing `{caseId, aiSource, dialogue}` contract, including canonical test IDs and expected results. No tests run in this module; requests can still be wrong. Automatic transfer to part 4 remains for integration.

Conversations, drafts, rejected approaches and confirmed revisions use the separate `repairDialogue` browser-storage key. Refresh resumes the latest review; History opens earlier reviews. Export conversation saves a full local record. Browser storage is not a server backup.

## Files

- `index.html`, `dialogue.css`, `dialogue.js`: page and interaction.
- `dialogue-model.js`: input validation, conversation state and exact output format.
- `dialogue-server.cjs`, `../api/dialogue.js`: sample replies and shared AI requests.
- `dialogue.test.cjs`: handoff, memory, validation and mocked API checks.
