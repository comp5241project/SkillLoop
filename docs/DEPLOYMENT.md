# Deploy to Vercel

The four module pages are plain static files. The optional knowledge backend runs from `/api/knowledge` as a Vercel Function in the same project.

## Initial setup

1. In Vercel, import `comp5241project/SkillLoop` using a GitHub account that can access it.
2. Set the production branch to `main`.
3. Use Framework Preset **Other** and the repository root as Root Directory.
4. Leave Build Command and Install Command empty. Use `.` as Output Directory if Vercel asks for one.
5. Deploy. The static sample needs no environment variables or database. To enable teacher publishing and account references, follow [knowledge backend setup](KNOWLEDGE-BACKEND.md) and redeploy with its server environment variables.

The root contains `index.html`. Each module has its own `index.html`; directory URLs such as `/interview/` therefore work directly. `vercel.json` sets the framework to Other, skips installation and building, and serves the repository root. It enables clean URLs and trailing slashes. Knowledge-map assets and API calls use root-relative URLs so direct visits and refreshes work after Vercel redirects `.html` links to clean URLs. Do not add a rewrite that sends every URL to the home page: this is a multi-page site.

After connecting the repository, Vercel can deploy new main commits and provide branch/PR previews, subject to the project's Git integration settings. Pushing this repository alone does not create or confirm a Vercel deployment.

## Check the deployment

- Open all four module URLs directly and refresh them. For knowledge-map, also check the public Knowledge Home and account-gated My Knowledge page, the sample `graph.html?graph=software-development` link and direct concept, question and case URLs. The sample works before Supabase is configured; teacher editing and account sign-in need the backend variables and appropriate accounts.
- Use the sidebar and the brand link back to the home page.
- Create a learning path and follow one of its lesson links.
- Save and revise an interview answer; refresh and check the replay.
- Enter a correction and reveal its reference explanation.
- Check at a phone width.

Knowledge personal records are stored only in the account backend. Old browser Knowledge records are left untouched but current pages do not read, write or import them. Study-mark editing is paused. Account nodes and links require the Knowledge migrations and backend configuration.

## If deployment fails

Open the failed deployment in Vercel and read its Build Logs. The GitHub status only reports the failure; it does not explain the cause. With Vercel CLI installed and signed in to the owning account, you can also run:

```sh
npx vercel inspect <deployment-id> --logs
```

Check that Root Directory points to the repository root and Production Branch is `main`. Build settings are defined in `vercel.json`; there is no `npm run build` or `dist` directory. The static sample does not need an API key. If the knowledge backend returns 503, check its Vercel environment variables and the Supabase migration. If the log reports a permission or Git author error, resolve that account access issue before retrying.

## Knowledge AI source discovery

The knowledge backend can request AI-assisted source discovery after `OPENAI_API_KEY` is set on the server. Teachers review returned sources and manually edit the graph draft. No model credential is sent to browser JavaScript. See [knowledge backend setup](KNOWLEDGE-BACKEND.md).

Reference: [Vercel project configuration](https://vercel.com/docs/project-configuration).
