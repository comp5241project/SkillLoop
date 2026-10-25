# Deploy to Vercel

Deploy the four module pages and `/api/knowledge`, `/api/interview`, `/api/correction` in the same existing SkillLoop project.

## Project settings

- Repository: `comp5241project/SkillLoop`; production branch: `main`.
- Framework: **Other**; root and output directory: repository root (`.`).
- Node.js: 22 or later. Install: `npm ci --omit=dev`; no frontend build.
- Keep clean URLs and trailing slashes from `vercel.json`. Do not add a catch-all SPA rewrite.

Vercel Git integration can build branch previews and deploy `main`. A Git push alone does not confirm a successful deployment. Check the deployment's commit and build status.

## Backend configuration

Set values in the intended Vercel environment, then redeploy. `.env.example` lists names only; it is not loaded automatically. Real credentials stay in Vercel or an ignored `.env.local`, never browser code or Git.

| Module | Variables | Behavior without configuration |
| --- | --- | --- |
| Knowledge accounts and publishing | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Curated public sample; account operations unavailable |
| Knowledge AI source discovery | `OPENAI_API_KEY`, optional `OPENAI_MODEL` | Teacher source discovery unavailable |
| Interview | `AI_GATEWAY_API_KEY` locally or deployment OIDC access; `INTERVIEW_AI_MODEL` or shared `AI_GATEWAY_MODEL` | Labelled sample conversation |
| Correction teacher drafting | `CORRECTION_TEACHER_CODE`; Gateway access with `CORRECTION_AI_MODEL` or `AI_GATEWAY_MODEL`, or `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` | Labelled sample draft |

The per-module model settings override the shared Gateway model. Keep the existing shared variable to continue using the same model in both modules. Knowledge uses its own OpenAI configuration. Correction can use OpenRouter instead of Gateway. Setting a variable does not prove provider access or available credits.

Follow [knowledge backend setup](KNOWLEDGE-BACKEND.md) for the Supabase migrations and account roles. Apply pending migrations in filename order through the team's database workflow; merging source does not migrate the database. Interview records and correction publications remain browser-local; they are not automatically synced to Knowledge accounts. The correction teacher code protects drafting only; it does not create a Supabase teacher session.

## Local preview and checks

```sh
npm ci
npm run dev
npm test
```

Open `http://127.0.0.1:8765`. The common preview runs all three API routes and reads `.env.local` if present. The module-specific preview commands remain available in their READMEs. A Python static server can show the sample pages but cannot run the APIs.

Before releasing, check all four entry URLs directly and after refresh. Follow knowledge graph, concept and question links; complete a learning assessment; submit and revise interview answers; finish a correction case; inspect teacher draft validation; check phone layouts. Use mocked responses first. Real sign-in, database policies and paid model calls need separate configured-service verification.

## Deployment failures

Check Vercel Build Logs for the exact deployment and commit. Confirm the repository root, Node version and install command. There is no `npm run build` or `dist` directory. If a backend returns unavailable, inspect only the matching module's environment configuration. Do not replace a real provider error with a claim that sample output came from AI.

With Vercel CLI authenticated to the owning account:

```sh
vercel inspect <deployment-url-or-id> --logs
```

Reference: [Vercel project configuration](https://vercel.com/docs/project-configuration).
