# M4 course publication handoff

**State:** Implementation ready for a separate read-only M4 acceptance review. The evidence here is from development verification.

The first course uses the QuizShop checkout case (`cart-checkout@1 / edge-cases`). The teacher turns an observable checkout failure into objectives, a code-reading activity, exercises and hints. They can open a blank draft or use either deterministic Mock starter, edit the student material and teacher notes, save, and reopen it. The Mock starter becomes editable form content. Saving creates a manually authored TeacherDraft.

## Reproduce locally

From the feature worktree, run:

```powershell
npm ci
npm test
$env:M4_CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node --test tests/m4-browser.mjs
node scripts/build-static.mjs
```

If Chromium was installed by Playwright, omit `M4_CHROME_PATH`. The test starts a disposable PostgreSQL cluster, applies every tracked migration in order, creates test users with random credentials, and runs the normal local app server. Its loopback Supabase Auth endpoint is a fixture. PostgreSQL transactions, role restrictions, startup/restart, browser input and HTTP are real. Real Supabase Auth and a hosted Vercel build have not been exercised.

With a configured database, use `npm run dev` and open `/enhancement-v2/studio/course/` from the home page. Choose **New draft**, select either starter or enter material, and **Save draft**. Reopen a saved course through the selector after signing out and back in. Click **Review saved revision**, inspect the student projection, confirm the checklist and **Approve this revision**. Click **Publish new version** and confirm. Open the generated **Version 1** link in an anonymous browser. The URL identifies both course and version.

Sign in as a learner on the published page, click **Start practice**, write a response to each exercise and submit. Reopen the same course in the teacher Studio. Version 1 shows the persisted started and submitted counts. Change the title in the Studio, save, review, and publish again. Version 1 still has the original material and version 2 has its own link and counts.

## Data and access

- Course owners and teacher roles derive from the verified Supabase identity and `public.skillloop_roles`. The application sets the actor for the current database transaction. Browser roles have no privileges on the private `skillloop_courses` schema.
- The course row preserves M3 draft ID and case reference, and stores a working revision. Updating lesson content advances the revision and clears approval. The teacher must approve the new revision before publishing. Save and publish serialize against the same course row. Stale actions return HTTP 409 and duplicate publication of the same revision returns the existing version.
- The published version stores a canonical student projection and public scenario, with a separate version number, review time, publication time and publisher. Student responses omit answer guidance, private evaluation records and internal provenance. PostgreSQL rejects updates and deletes on published versions.
- Learner attempts store the signed-in account, exact course/version, start and submit timestamps, and submitted text. Learners can revisit their own responses. Teachers see counts, with one attempt per learner per version. Anonymous reads do not create activity. Deleting a learner's Auth account cascades that learner's attempt data. The product currently has no self-service attempt deletion or retention automation.
- M4 records practice participation. Production diagnosis, personalized teaching, repair dialogue, execution and any related analytics are deferred to M5.

## Connect an approved environment

Apply the tracked Supabase migrations in order on a local or separately approved project. The new migration creates the `skillloop_course_server` group as `NOLOGIN`. Provision a distinct PostgreSQL login with `NOINHERIT`, no admin or bypass-RLS privileges, and membership in that group so the application can `SET LOCAL ROLE`. Use your database administration workflow to set a generated password and verify the login through a local connection without echoing its URL. Configure `SKILLLOOP_COURSE_DATABASE_URL` in the ignored `.env.local`. For hosted environments use TLS with certificate validation and store the URL as a server secret. Do not use the Postgres administrator or Supabase `service_role` credential as the runtime login.

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for that same project. Create teacher and student email/password accounts with Supabase Auth and assign the teacher in the existing `skillloop_roles` table as an administrator. The account cookie expires with the short-lived Auth access token, and the Studio prompts for sign-in again when it expires. To verify wiring, sign in with individual test accounts, create a disposable course, open it through its published link and confirm that the student account is refused teacher access. A missing configuration yields a controlled 503.

The Vercel configuration assembles a public static directory containing the four original module pages/assets and the M4 browser assets. Course server modules and canonical case source files belong to the function bundle. The local artifact check confirmed the static directory excludes server code, migrations, source docs and environment files. Vercel deployment and hosted database provisioning require separate authorization.

## Independent review

Inspect the committed diff, run the local verification commands above and attempt direct API/SQL access with student, anonymous and other-teacher identities. Check that an invalid or stale save does not alter the saved review and that a changed revision cannot publish until approved. Verify the student reader and real counts from the disposable database. Record the independent outcome in the acceptance log, including the exact commit, environment and any gaps. Final-project M3-05 real-browser acceptance stays on the closeout checklist.
