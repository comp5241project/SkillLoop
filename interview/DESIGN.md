# Interview room design

The module stays inside SkillLoop's shared navigation and warm white, charcoal, terracotta and muted olive palette. Only the central activity becomes a conversation: an original vector interviewer, one dialogue bubble and an always-visible input box. There is no full-screen takeover or setup dashboard.

## Interaction

Entering starts or resumes a course-related interview. The interviewer introduces herself, asks a concrete opening question and follows the learner's replies. Typing is the main action. Optional reply ideas insert incomplete starters; they neither choose a correct answer nor send a reply. The learner can edit or ignore them.

Each AI turn supplies a short observation grounded in an exact answer quote, one useful suggestion and a follow-up. Detailed analysis waits for the final review. The AI can close after three to five replies rather than always asking three fixed questions. It does not assign a hiring score or infer unaided mastery from an assisted reply.

The review preserves the actual conversation. Suggestions, original replies and saved learner revisions remain separate. Comparing versions is a separate AI request, and editing the saved version invalidates the old comparison. Drafts are saved before navigation or network requests; failed calls can be retried without duplicating a reply.

## References and limits

- [Amershi et al., Guidelines for Human-AI Interaction, CHI 2019](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/): clarify capability and support correction. Demo and AI modes are distinct, errors preserve the conversation, and suggestions stay editable.
- [W3C WAI, clear step-by-step instructions](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p07-step-instructions/): instructions sit beside the relevant action. The input and Send reply remain visible, and reply ideas explain that insertion does not send.
- [Nielsen, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/?lm=listbox-dropdown&pt=article): keep the current question prominent. Scenario switching, reply ideas, earlier conversations and the full transcript open only when requested.
- [CapWords, Apple Design Awards 2025](https://developer.apple.com/design/awards/2025/), and [Crouton / Rytmos, 2024](https://developer.apple.com/design/awards/2024/): earlier references for small responsive interactions and task focus. No branding, illustration or screen asset is copied.

These are design adaptations, not evidence of learning gains. Student and instructor usability sessions are still needed. No claim of real AI quality is made from mock-provider tests.

## Walkthrough changes

| Walkthrough   | Finding                                                                      | Change                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| First visit   | A setup dashboard and several abstract stage names resembled a worksheet.    | Open the interview directly, retain the familiar workspace, and keep one question and one input prominent.               |
| Reply ideas   | Clicking a supplied answer bypassed the learner's own explanation.           | Insert a short starter into the input, require Send reply, and preserve assisted-input provenance.                       |
| Conversation  | A fixed question list and end-only self-check did not feel responsive.       | Add an AI observation, suggestion and answer-dependent follow-up at each turn; retain notes in the transcript.           |
| Recovery      | A failed request could leave a learner unsure whether their answer was sent. | Save the reply before requesting the next turn. Resume an unanswered request without submitting the reply again.         |
| Revision      | Navigating or refreshing could discard an unfinished new version.            | Auto-save revision drafts; save explicit versions separately; hide stale comparisons while editing.                      |
| Visual review | Full-screen styling separated the activity from the rest of SkillLoop.       | Restore shared navigation and the contained conversation panel. Keep the illustration stable and respect reduced motion. |

The authored demo, mocked AI flow, installed SDK validation and mobile layouts are checked separately. Live provider access remains unverified until the team configures its AI service.
