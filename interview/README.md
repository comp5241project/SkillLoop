# Interview room — module 3

A course-linked mock interview inside the normal SkillLoop workspace. Opening the page starts or resumes the conversation. Maya asks one question at a time; the input box is always visible. Reply ideas add a short starter without replacing existing text or submitting an answer. Done ends the review and returns to SkillLoop; starting another conversation is a separate action.

After each reply, the AI returns a brief observation, one suggestion and a follow-up based on the actual answer. A conversation ends after three to five replies. The final review links feedback to exact answer quotes, offers a possible rewrite, and compares a saved revision with the original. No hiring score or mastery claim is generated.

Without AI configuration, an explicitly labelled demo runs locally with four authored questions, practice notes and scenario examples. Its notes are not an assessment of the student. Demo sessions stay demos; failed AI calls do not silently switch modes.

AI notes, review, rewrite suggestions and comparisons use a shared bordered card with a line icon and an AI label. Demo content includes “(Sample — API not connected yet)” to show where AI will be connected. The learner's original and rewrite stay in a separate editor. Actions use short labels: Edit answer, AI rewrite, Save rewrite and Compare with original; rewrite explanations expand under Why.

## Run

Use Node.js 22 or later:

```sh
npm ci
npm run dev:interview
```

Open `http://127.0.0.1:8765/interview/`. This server serves the existing static modules and the interview API. A plain static server or the portable HTML preview can run the demo, but cannot run AI calls.

## Connect AI later

1. Copy `.env.example` to the uncommitted `.env.local` file, or use the Vercel project's environment settings.
2. Set `AI_GATEWAY_MODEL` to an available text model ID from `https://ai-gateway.vercel.sh/v1/models`.
3. For local development, set `AI_GATEWAY_API_KEY`. Vercel deployments can use their OIDC token instead when the project's Gateway access is enabled. A model and working Gateway access are both required.
4. Restart the local server or redeploy. Check that a real interview, per-turn notes, final review, rewrite and comparison all succeed. Configuration detection alone does not verify provider access or credits.

Credentials stay on the server. The browser only calls `/api/interview`. The implementation uses the installed AI SDK's structured output support and validates feedback quotes against the submitted answer. Calls are bounded and time out with a retry action. Budget and account access are managed in the owning Vercel account; this module does not provision either.

No live provider request has been verified yet. The SDK and browser/API flows have been tested with mock model output, separately from the authored demo. Before wider use, connect the team's shared account permissions and any project-wide request limits.

## Main files

| File                                    | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `index.html`, `style.css`, `script.js`  | Interview scene, input, notes, review and notebook                   |
| `story.js`                              | Shared conversation state, validation and demo scenarios             |
| `server.cjs`                            | Server-only AI prompts, schemas and validation                       |
| `../api/interview.js`                   | Vercel endpoint: configuration check and AI requests                 |
| `../scripts/interview-dev.cjs`          | Local static/API preview server                                      |
| `story.test.cjs`                        | State, evidence and installed-SDK boundary tests                     |
| `model.js`, `data.js`, `model.test.cjs` | Earlier prototype compatibility; old records are readable in History |

## API

`GET /api/interview` returns `{ available: boolean }`, reflecting configuration only.

`POST /api/interview` accepts `{ action, session, index? }`. Actions are `turn`, `review`, `rewrite` and `compare`. The endpoint returns `{ source: "ai", result }`, or a safe error. Model output is structured and checked before rendering. The server uses canonical topics and goals; transcript text cannot supply system instructions. No secrets, raw provider errors or answer content are logged by this module.

`turn` includes `feedback.observation`, `feedback.suggestion`, an exact `feedback.quote`, the next question, reply starters and a completion flag. Opening feedback is empty. Later notes must reference the latest answer. Starters are assistance, not an answer key.

## Records and integration

- Uses `skillloop.v1.interviewStory`; earlier `interviewStudio` and `interview` keys are not overwritten.
- Keeps up to 30 conversations, original replies, per-turn notes, a review, example suggestions, revision drafts, eight revisions per answer, and saved version comparisons.
- An inserted reply idea is marked as assistance. A rewrite suggestion stays separate until the learner edits and saves a version. Applying a suggestion records its assisted origin.
- Reply drafts and revision drafts survive refresh. A submitted reply is saved before the next AI request, so retrying does not duplicate it. Changing a revision invalidates its older comparison.
- History shows activity counts, not claimed improvement scores. Export downloads the complete record as JSON. Storage is local to this browser; no cross-device sync is claimed. Blocked storage is labelled as visit-only.
- `courseId`, `activityId`, `conceptId` (or `topic`), `graphId` (or `graph`), `publicationVersion` (or `version`) and a safe `returnTo` path are retained. The concept selects the matching sample topic. A shared `profile.background` can guide the AI's level. URL IDs are metadata, not course-access checks.
- The related-lesson link returns to the source knowledge map or learning path. The API does not fetch published instructor activities yet; add that through the team's agreed course/auth interface.

## Check

```sh
npm run test:interview
python scripts/check_site.py
```

Walk through typing, inserting and editing an idea, per-turn feedback, leaving and resuming, review, a suggestion, a revision, comparison and export. Also check an interrupted response and 390px/320px layouts. See `DESIGN.md` for design evidence and walkthrough findings.
