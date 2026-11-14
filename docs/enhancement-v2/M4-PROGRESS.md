# M4 implementation progress

## 2026-11-15 — Baseline and design

- `feature/enhancement-v2` was at `4702005` with eight M3-05 edits. Preserved those edits in local checkpoint `2beb251`, including the independent CONDITIONAL PASS and the final closeout item in the acceptance log. `node --test tests/enhancement-v2-m3-*.test.mjs` passed 36/36. The real-browser M3-05 review is deferred.
- M4-01 audited the three tracked Supabase migrations: `20261021000100` adds roles, graph drafts and publications; `20261021000200` extends the personal network; `20261022111424` narrows the personal edge update grant. The Knowledge API verifies Supabase Auth and reads the administrator-owned role directory. The graph payload and policies remain specific to that product. No live schema was inspected.
- The course model and access boundary are recorded in [ADR 0001](../adr/0001-separate-courses-from-cases.md) and the root glossary. Next implement the migration, teacher/student API, and browser flow, then verify on real local PostgreSQL.
## 2026-11-15 — Persistence and release

- M4-02–04 and M4-06 added `supabase/migrations/*_m4_course_publication.sql`, `enhancement-v2/m4-courses.mjs`, `api/courses.mjs` and the PostgreSQL/HTTP test harness in `tests/`. Supabase identity is verified server side, with roles checked in PostgreSQL. Validated drafts and exact-revision approval survive app restarts. Publication is atomic and immutable. The first publish run exposed a lossy timestamp round trip that the DB correctly rejected. Publication now takes the exact review timestamp from the locked database row.
- The integration test applies all tracked migrations to real local PostgreSQL 18.6. It checks account roles, direct SQL denial, owner isolation, invalid saves rolling back, re-login and restart, concurrent saves and publish retries, public snapshot isolation, and immutable versions. Supabase Auth uses a loopback fixture. The final `npm test` passed the static checks and 282/282 tests.

## 2026-11-15 — Teacher and learner journeys

- M4-04–06 added the Course Studio and learner page in `enhancement-v2/studio/`, local routes in `scripts/dev.mjs`, and static asset packaging in `scripts/build-static.mjs` and `vercel.json`. The homepage links to the teacher Studio. Learner attempts record starts and submissions for an exact version. The teacher view shows aggregate counts, and the learner view keeps responses private to that learner.
- `node --test tests/m4-browser.mjs` passed in real Chrome with teacher desktop and learner narrow viewports. A login initialization race was fixed by opening the workspace after case facts and the course list load. The Chrome run covered saved revision review, release link, anonymous read, keyboard hints, signed-in practice, counts and stable version 1 after editing. `node scripts/build-static.mjs` and the static artifact inventory confirmed the public asset boundary. `git diff --check` passed, and the original four learning modules have no source changes in M4.
- Next: separate read-only acceptance using [the M4 handoff](M4-COURSE-PUBLICATION.md). A hosted Supabase/Vercel smoke check requires an approved environment. Automatic four-stage learning handoff and the final M3-05 browser acceptance remain separate.
