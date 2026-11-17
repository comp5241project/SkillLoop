# SkillLoop

Learn to review AI-generated code: diagnose a gap, practise it, discuss a repair, and verify the result.

Live site: [skillloop-sigma.vercel.app](https://skillloop-sigma.vercel.app/).

The pages use plain HTML, CSS and JavaScript. In V3 Teacher Studio, teachers import material, review AI-generated notes against the source, confirm a registered case, and publish a fixed version. Students open that version from Course Library and resume saved progress from My Learning.

## Run locally

Use Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open [SkillLoop on port 8765](http://127.0.0.1:8765). The shared server runs the site and its API routes. Use `.env.example` to set up an ignored `.env.local` for backend services. Public samples can run without credentials. Course sign-in and publication require a configured database and Supabase Auth.

Use `npm run dev:native` for the isolated V2–V3 integration preview on [port 8767](http://127.0.0.1:8767/enhancement-v3/web/). Set `SKILLLOOP_AUTH_BINARY` and `SKILLLOOP_AUTH_MIGRATIONS` to a local Supabase Auth release first. The preview starts its own database and Auth, applies migrations there, and writes local test sign-ins to the ignored `.env.native-accounts.json`. The preview database is recreated when the preview stack is recreated. See the [integration setup and verification record](docs/enhancement-v3/V2-V3-INTEGRATION-VERIFICATION.md).

## Modules

| Module | Folder | Current behavior |
| --- | --- | --- |
| 1. Diagnosis | `learning-path/` | Choose a case, answer AI-generated questions, and identify topics to practise. |
| 2. Case Learning | `knowledge-map/` | Study the diagnosed gaps, complete practice, receive feedback, and submit the formal case check in the integration preview. |
| 3. AI dialogue | `interview/` | Review an AI delivery through continuous conversation, revise repair requests and export a confirmed plan. Requires a configured AI provider. |
| 4. Verification | `correction-lab/` | Apply the confirmed repair plan and run the registered case tests. The integration preview verifies submitted code server-side in an isolated runner. |

Shared navigation, styles and browser storage helpers live in `shared/`. Server endpoints live in `api/`. Database migrations for the course and legacy Knowledge features live in `supabase/migrations/`.

Teachers approve an exact draft before publication. Registered tests determine the verification result, and AI can explain that result. The `knowledge-map/` directory name comes from the older Knowledge feature. V3 uses its Case Learning page and keeps separate legacy concept links available.

### Student entry points and progress

| Entry | Progress |
| --- | --- |
| **Try Demo** | The original four stages hand off progress in the same browser. The standalone Part 2 sample runs in its own page session. |
| **Published Course Journey** | `?journey=1` uses the shared course renderer and saves progress to the learner's account and published version. This is the path used by the regular course environment. |
| **Original four stages in the integration preview** | `?native=1` uses the original Part 1, 3 and 4 pages. Cart Checkout and Retry Queue courses published through V3 Teacher Studio have account-backed progress, including Part 2 practice and feedback. AI Personalized Learning is available as supplemental practice after diagnosis. |

## Collaborate

Use the [three shared demo cases and module input/output samples](docs/team-samples/README.md) to develop each module independently. Demo Continue buttons carry the selected case through each step. A new diagnosis or changed learning result invalidates older downstream handoffs.

`shared/flow.js` handles demo handoffs. After editing `docs/team-samples/samples.json`, run `node scripts/sync-cases.cjs` to update the deployed `shared/cases.json` copy. Module prompts live in their server files. Configure `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` on the server.

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

This runs the static-site checks and the Node test suites, including course publication and stage progress against isolated PostgreSQL. Automated AI tests use controlled responses. GitHub Actions runs these checks for pull requests and `main`. Browser and live AI verification are documented separately in the integration verification record.

## Deploy

The existing Vercel configuration uses the repository root and the **Other** framework preset. It installs locked dependencies with `npm ci --omit=dev`, packages browser assets with `node scripts/build-static.mjs` and serves them alongside the API functions. See the [deployment setup](docs/DEPLOYMENT.md) for module environment variables.

For a Vercel Preview of the original four stages, apply the course migrations through `20261117120000_v3_publication_paths.sql` to the target Supabase project first. Configure its restricted `SKILLLOOP_COURSE_DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, along with the shared AI settings. Set `SKILLLOOP_NATIVE_VERIFIER=vercel` to run Part 4 in Vercel Sandbox. Set `SKILLLOOP_NATIVE_COURSES=1` to select the original four stages for new V3 releases. Previously published versions use their stored learning path.

## References

- [Civilization VI manual](https://downloads.2kgames.com/civilization/vi/manuals/eu/CIV_VI_25TH_ONLINE_MANUAL_ENG.pdf): technology-tree inspiration.
- [Non-CS learner discussion](https://www.reddit.com/r/PhD/comments/10fnw9x/): differences in prior knowledge.
- [Interview practice discussion](https://www.reddit.com/r/careeradvice/comments/1pa8o7n/): practising alone and reviewing answers.
- [HypoCompass, IJCAI 2025](https://www.ijcai.org/proceedings/2025/1217): learning through helping an AI agent debug code.

These sources inform the design; they do not establish that the prototype improves learning outcomes.

## License

MIT; see [LICENSE](LICENSE). Lucide icons have their own [MIT license](shared/vendor/LUCIDE-LICENSE). See [third-party notices](THIRD-PARTY-NOTICES.md).
