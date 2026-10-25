# SkillLoop

Short software development lessons, personalised learning paths, mock interviews and correction exercises.

Live site: [skillloop-sigma.vercel.app](https://skillloop-sigma.vercel.app/).

The pages use plain HTML, CSS and JavaScript. Server-side functions handle knowledge accounts and publishing, interview conversations, and teacher correction-case drafts. Each module keeps its own folder and AI configuration.

## Run locally

Use Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The server runs all three API routes. Copy `.env.example` to an ignored `.env.local` only when enabling backend services. Public sample content works without credentials; knowledge accounts and publishing require Supabase.

## Modules

| Module | Folder | Current behavior |
| --- | --- | --- |
| Knowledge map | `knowledge-map/` | Explore concept graphs, mini-courses, questions and sourced cases. Supabase supports accounts and teacher publishing; optional AI helps teachers find sources. |
| Learning path | `learning-path/` | Assess prior knowledge and recommend courses using background, goals and quiz results. Recommendations are rule-based. |
| Interview | `interview/` | Type answers, receive AI feedback and follow-ups, review the conversation and compare rewrites. A labelled sample is available without AI configuration. |
| Correction lab | `correction-lab/` | Find errors in authored answers, explain and fix them, then try a related question. Teachers can request AI case drafts and review them before browser-local publication. |

See each folder's README for its workflow. Shared navigation, styles and browser-storage helpers live in `shared/`; server endpoints live in `api/`. Knowledge database migrations are in `supabase/migrations/`.

AI does not publish teaching material automatically. Student correction answers use authored checks and self-review; submitted code is not executed. Knowledge account data can sync through Supabase. Learning paths, interview records and correction progress remain browser-local. Signing into Knowledge does not upload those records.

## Collaborate

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

This runs the site link check and the knowledge, interview and correction tests. Tests use mock AI and database responses; they do not prove real credentials, provider credits or database permissions. GitHub Actions runs these checks for pull requests and `main`.

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
