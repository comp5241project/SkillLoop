# Knowledge backend setup

The knowledge module can run as a static sample with `python -m http.server 8000`. Account, teacher publishing and AI discovery need a Vercel deployment plus a Supabase project. The other three SkillLoop modules remain static.

## Architecture and ownership

- `knowledge-map/data.js` is the curated fallback and initial teacher draft template. Keep the seven shared concept IDs stable.
- `/api/knowledge` is a same-origin Vercel Function. It uses Supabase Auth and REST with the publishable key and the user's JWT; it does not use a service-role key. The OpenAI key is read only by this function.
- `supabase/migrations/20261021000100_knowledge_backend.sql` is the original schema. `20261021000200_knowledge_network_v2.sql` adds personal note nodes, manual links, positions, version-aware references and explicit transactional import. Apply both in order; do not edit the first migration.
- A graph has one owner, a private draft revision and an immutable publication row for each version. The graph's `current_version` changes only after the new publication row is written in the same database transaction. Different teachers can own multiple graphs.
- `knowledge-map/teacher.html` is a visual editor with forms, drag positions and cross-page previews. Its local preview is not a publication. A teacher saves and reviews the exact draft before publishing. AI search results are private research notes until a teacher writes and checks a sourced case.
- Signed-in references, note nodes and manual links are per account. Knowledge pages no longer create browser-local personal nodes or study marks. The old import API remains for compatibility but has no UI caller.

## Provisioning

1. Create a dedicated Supabase project. Apply both SQL migrations in filename order through the Supabase SQL editor or your team's migration workflow. Apply each once. Existing V1 installations apply only the second migration.
2. Create teacher and learner accounts in Supabase Auth. Teacher role assignment is an administrator operation; do not expose it in a browser form. In the SQL editor, promote a known teacher account:

   ```sql
   insert into public.skillloop_roles (user_id, role)
   select id, 'teacher' from auth.users where email = 'teacher@example.edu'
   on conflict (user_id) do update set role = excluded.role;
   ```

   Accounts without a `skillloop_roles` row have learner access. Only graph owners can update their own drafts and publish them. Assign a different owner only through a deliberate database migration.
3. In Vercel, keep the existing **Other** project preset and repository root. Use the root [`.env.example`](../.env.example) as a list of variable names; it contains no credentials and is not loaded automatically. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for account sign-in and teacher publishing. `OPENAI_API_KEY` is needed only for AI source discovery; `OPENAI_MODEL` is optional and defaults to `gpt-5.1`. Scope values to the intended environments and redeploy after setting them. For local `vercel dev`, put real values in an ignored `.env.local` file or use `vercel env pull`; never commit credentials.
4. Open `/knowledge-map/teacher.html`, sign in as a teacher and create an owned graph. Save the draft, preview graph, knowledge, question and case pages, check source material and answers, then publish. Share the generated `/knowledge-map/graph.html?graph=<graphId>` link. The sample graph works statically until its owner publishes it; `/knowledge-map/` is the public Universe page; `/knowledge-map/my.html` is the student account network.

For a local full-stack preview, use `vercel dev` after linking a Vercel project and supplying local environment variables through Vercel's normal environment workflow. A Python static server only exercises the fallback; it cannot run `/api/knowledge`.

## Editorial workflow

Change `publication.version` whenever content changes. `publication.publishedAt` is the planned release date. Keep a source's event date, publication date, checked date and HTTPS URL distinct. `source-supported` claims need a source section; `teaching-inference` claims should be framed as interpretation. The teacher checks both before publication. A repeated publish of the same revision and payload is safe; a conflicting reused version is rejected. Failed database transactions leave `current_version` unchanged.

AI source discovery sends the teacher's query in a documented research prompt to OpenAI's Responses web search. It records the query, prompt, model, returned note, source URLs and retrieval time in a teacher-only log. The provider does not expose the full text of every page supplied internally to web search, so teachers must open and check cited sources before transcribing any facts into the graph. Discovery never writes a public event or practice answer.
The API limits each teacher to ten searches per UTC day as a basic cost guard.

## Privacy and migration

Account references, note nodes and manual links are visible only to their owner through row-level policies or owner-checked RPCs. Notes are limited to 1,000 characters. Browser-local records remain on the device after sign-in; account view shows only server records. The retained import API requires authentication and its database function scopes writes to the current account. Existing browser records are left untouched; the current UI has no import flow. A teacher can access only their own draft and discovery records. Published graph versions are public.

## Verification

Run `node --test api/*.test.mjs` and `python scripts/check_site.py`. The tests use mocked Supabase calls; they do not prove that a live project has the migrations, keys or role assignments configured. After provisioning, verify teacher ownership across two accounts, draft isolation, publish, historical URLs, retained import API authorization, duplicate references, personal edges and notes across devices, and phone layout on a preview deployment before pointing learners to it.
