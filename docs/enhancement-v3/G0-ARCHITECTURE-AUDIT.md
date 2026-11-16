# G0 — Architecture audit

Baseline: feature/enhancement-v2 at 4e36360e3043ecf497c6bae75dbd5a9447aff713. Created feature/enhancement-v3 at the same revision. The two original untracked v3 specifications remain unmodified; their long filenames are the supplied authoritative documents.

| Area | Observed contract | v3 decision |
| --- | --- | --- |
| Identity | api/courses.mjs verifies the HttpOnly sl_course_access cookie with Supabase Auth; it is scoped to /api/courses. Postgres uses a dedicated course role with transaction-local actor and owner RLS. | Add only explicitly recognized v3 operations at the same endpoint. Keep server-verified identity, same-origin POST protection, and check teacher/student role at the store. |
| Teacher authoring | m3 validates case facts, public starter excerpts and 1–3 M4 objectives; the old Studio form and AI receipts are oriented around a case-first workflow. | Keep independent v3 source, notes, 2–5 objectives and coverage. Project reviewed requirement groups into M4-compatible objectives and use canonical public trace/practice fields. |
| Review/publication | m4-courses canonicalDraft and snapshot validate and project approved material; course and version writes enforce owner and reviewed revision; versions are immutable and pinned by attempt foreign key. | Share the unchanged canonical save/review/publish logic at the transaction level. Publish companion immutable knowledge and M4 versions together. Mark backing courses as v3-managed, and isolate them from legacy teacher authoring. No changes to legacy published/read/start/submit/journey semantics. A different case requires a new course under the existing M4 case invariant. |
| Eligible cases | m5-case-library supportedCourses enumerates cart-checkout@1 and retry-queue@1 for edge-cases. journeyCase and approvedRunner can verify capabilities and runner. | Use only publicly projected requirements, cited notes, and public case traces. Check candidate identity and coverage again at review and publish. |
| Ordinary Demo | The four protected directories plus shared/flow.js use a different local flow and AI endpoints. | Preserve the Demo and its links. Its records are not formal attempts. |
| Formal Journey | m5-journey context reads versioned caseRef. diagnose ranks server-authored question options and persists a target and evidence in the actor-owned attempts.journey. learning and repair enforce stage prerequisites. Verification calls the approved runner. | Read saved diagnosis through the existing RLS boundary. Hash the evidence and bind extra coaching to the exact publication, attempt and learner. Never write to attempts.journey from v3. Use existing start. |
| Navigation | shared/course-journey.js hardcodes the Part 1 continuation and Part 2 route. Legacy teaching uses a deterministic provider. | My Learning and course overview link to additional v3 coaching after diagnosis. Canonical Part 2 remains the route to repair and verification. Direct continuation from Part 1 requires approval below. |
| Hosting | dev.mjs buffers requests (1 MB) and permits only selected browser assets; legacy Courses JSON allows 100 KB and Vercel has a 4.5 MB platform limit. | Allowlist v3 browser assets. Keep the existing limits for every legacy op. Read v3 file bytes under a dedicated 3 MB cap and preserve same-origin checks. |
| AI | server/ai.mjs has a server-only bounded live JSON client with configured provider/model, timeout and no provider body leakage. | Reuse it without changing existing AI code. Validate grounded outputs at each boundary. Keep external work outside SQL transactions, use persisted learner job leases, and expose failures and retries. |

Dependency chain: private source → reviewed notes and requirements → atomic v3 knowledge + M4 version → existing authenticated start/diagnosis → read-only diagnosis context → v3 lesson and practice → unchanged formal stages and approved runner.

Baseline verification: npm test: 314 passed, 0 failed. node --test tests/m4-browser.mjs tests/m5-browser.mjs with M4_CHROME_PATH set to local Chrome: 2 passed, 0 failed. Both browser tests use a disposable migrated PostgreSQL cluster and local auth fixture. No hosted writes are needed for implementation or testing.

Protected: learning-path/**, knowledge-map/**, interview/**, correction-lab/**, shared/course-journey.js, shared/flow.js, m5 journey and runner/case logic, stage contract branches of api/courses.mjs. Planned shared diffs: a v3-only API dispatch before legacy operations; share the M4 teacher-only SQL and transaction helpers; static build, dev allowlist, and homepage navigation. Review regressions in existing API, database and browser suites.

## APPROVAL REQUIRED — P1–P4 CODE CHANGE

**Blocked:** Direct Part 1 → v3 supplemental Part 2 navigation in V3-A06/A07. Students can instead return to My Learning and open the personalized lesson after diagnosis.

**Exact proposed change:** In shared/course-journey.js, only inside render's diagnosis branch (current lines 149–151), retain “Continue to learning” and add a “Open personalized lesson” link when a read-only v3 publication lookup confirms the current course UUID and pinned version pair. Point the link at /enhancement-v3/web/lesson.html with the same course/version. The existing run must still render and continue to canonical Part 2 if the lookup fails. No edits to Part directories, other stage UI, stage API, progress records, or runner. Old publications never get the new link.

**Evidence and alternatives:** The current branch only uses link('Continue to learning', paths.learning); paths.learning is /knowledge-map/ and the query is constructed by the same file. Publishing a valid M4 snapshot cannot configure that link. A redirect or interception would change protected navigation implicitly. The independent My Learning entry remains a lower-risk fallback.

**Impact, tests, rollback:** Navigation-only change with one same-origin read and no contract, auth, or historical record mutation. Verify v3 diagnosis offers both links, old publication and Demo navigation remain unchanged, and an unavailable lookup cannot block canonical progression. Run v3 two-student browser coverage plus M4/M5 browser regressions. Roll back the added conditional link and lookup only.

Approved explicitly by the user on 2026-11-17: only add this link. The implemented protected-file diff is confined to the formal diagnosis result panel; no other protected files changed.

Scope clarification from the user: Knowledge Map is deprecated and out of scope. User-facing Part 2 is Case Learning / AI Personalized Learning. The legacy /knowledge-map/ route remains only as the destination for the existing Case Learning activity.
