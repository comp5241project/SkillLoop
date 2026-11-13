# SkillLoop

Learn to review AI-generated code: diagnose a gap, practise it, discuss a repair, and verify the result.

Live site: [skillloop-sigma.vercel.app](https://skillloop-sigma.vercel.app/).

The pages use plain HTML, CSS and JavaScript. Server-side functions handle knowledge accounts and publishing, code-review conversations, and teacher correction-case drafts. Each module keeps its own folder. All four use the shared server-side AI configuration.

## Run locally

Use Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The server runs all API routes. Copy `.env.example` to an ignored `.env.local` only when enabling backend services. Public sample content works without credentials; knowledge accounts and publishing require Supabase.

## Modules

| Module | Folder | Current behavior |
| --- | --- | --- |
| 1. Diagnosis | `learning-path/` | Choose a case, answer AI-generated questions, and identify topics to practise. |
| 2. Case learning | `knowledge-map/` | Study the diagnosed gaps, complete activities, and receive AI feedback. Existing concept and teacher pages remain available. |
| 3. AI dialogue | `interview/` | Review an AI delivery through continuous conversation, revise repair requests and export a confirmed plan. Requires a configured AI provider. |
| 4. Verification | `correction-lab/` | Apply the confirmed repair plan, run fixed tests in an isolated worker, and receive an AI review of the actual results. |

See each folder's README for its workflow. Shared navigation, styles and browser-storage helpers live in `shared/`; server endpoints live in `api/`. Knowledge database migrations are in `supabase/migrations/`.

AI does not publish teaching material automatically. Verification runs the teaching-case code in an isolated worker; AI cannot decide or overwrite test results. Knowledge account data can sync through Supabase. Learning paths, dialogue records and correction progress remain browser-local. Signing into Knowledge does not upload those records.

## Collaborate

Use the [three shared cases and module input/output samples](docs/team-samples/README.md) to develop each module independently. The four-part flow is now connected in the same browser. Continue buttons carry the selected case through each step. A new diagnosis or changed learning result invalidates older downstream handoffs.

`shared/flow.js` handles these handoffs. `docs/team-samples/samples.json` remains the source for shared case materials; run `node scripts/sync-cases.cjs` after editing it to update the deployed `shared/cases.json` copy. Module prompts remain in their own server files. Configure `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` on the server; never put credentials in frontend JavaScript.

1. Pull the latest `main` and create a feature branch.
2. Work in your module and check its interactions, refresh behavior and phone layout.
3. Open a pull request and merge after checks and review.

Keep shared concept IDs and data formats stable. Discuss changes to `shared/`, API contracts and deployment configuration with the team.

- [Team guide](docs/CONTRIBUTING.md)
- [Data contracts](docs/DATA-CONTRACTS.md)
- [Module tasks](docs/MODULE-TASKS.md)
- [Deployment](docs/DEPLOYMENT.md)

## Checks

```sh
npm test
```

This runs the site link check and the knowledge, dialogue and correction tests. Tests use mock AI and database responses; they do not prove real credentials, provider credits or database permissions. GitHub Actions runs these checks for pull requests and `main`.

## Deploy

Use the existing Vercel project linked to this repository, production branch `main`, framework **Other**, and repository root. `vercel.json` installs locked dependencies with `npm ci --omit=dev`, skips a frontend build and serves the static pages alongside the API functions. See [deployment setup](docs/DEPLOYMENT.md) for each module's environment variables.

## References

- [Civilization VI manual](https://downloads.2kgames.com/civilization/vi/manuals/eu/CIV_VI_25TH_ONLINE_MANUAL_ENG.pdf): technology-tree inspiration.
- [Non-CS learner discussion](https://www.reddit.com/r/PhD/comments/10fnw9x/): differences in prior knowledge.
- [Interview practice discussion](https://www.reddit.com/r/careeradvice/comments/1pa8o7n/): practising alone and reviewing answers.
- [HypoCompass, IJCAI 2025](https://www.ijcai.org/proceedings/2025/1217): learning through helping an AI agent debug code.

These sources inform the design; they do not establish that the prototype improves learning outcomes.

## License

MIT; see [LICENSE](LICENSE). Lucide icons have their own [MIT license](shared/vendor/LUCIDE-LICENSE). See [third-party notices](THIRD-PARTY-NOTICES.md).
