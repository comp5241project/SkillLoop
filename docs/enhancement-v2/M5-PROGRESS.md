# M5 implementation progress

## Baseline and integration decisions

- M4-R1 matches the independently accepted diff. Real PostgreSQL HTTP and Chrome regressions each passed 1/1. The repair is local commit `4a3cf7b`. Its historical M4 FAIL remains in the acceptance log.
- The PRD and plan require a fourth data-driven case, diagnosed learning with persisted attempts, and real four-stage execution where a reviewed fixture exists. The existing student routes share browser records and case IDs. They currently lack immutable course-version identity. M1 provides the canonical projection and runner registry. M2 has synthetic review authority and isolated model experiments. M3/M4 provide validated drafts and versioned releases. M5 builds on these boundaries.
- The published link enters the four existing student routes with an explicit course and version. The server derives case, case version and concept from the published lesson. Each signed-in journey uses the existing owned learner attempt, with stage changes protected by row locks and a revision check. Anonymous course reading remains available.
- Teaching uses authored diagnosis targets, canonical source excerpts and the existing M2 proposal and factual checks. It selects the approved teacher material when it targets the learner's requirement, then checks a local deterministic template and falls back to authored content if necessary. M2 synthetic reviews cannot authorize live delivery.

## Implemented and verified locally

- `m5-case-library.cjs`, `m5-journey.cjs` and the retry fixture implement the case registry, server-derived diagnosis, teaching selection, the repair plan and real verification. The fourth case runs the same stage engine. An initial HTTP run passed the two distinct checkout paths, a failed and later repaired verification, and three passing retry-queue checks.
- `api/courses.mjs`, the additive migration and the shared browser client pin each stage to the learner's owned attempt and version. The actual Chrome run published retry queue material from the teacher Studio, used all four existing student routes for both checkout paths and the fourth case, and checked the new teacher counts. The M4 browser regression also passed.
- `npm test` passed 284/284, including provider error and validation fallback, real PostgreSQL/HTTP authorization and persistence, and legacy case regressions. Test fixture cleanup now releases HTTP bodies and closes subprocess handles for the Windows parallel run. `node scripts/build-static.mjs` and `git diff --check` passed.
- Next is independent read-only acceptance using [the handoff](M5-LEARNING-JOURNEY.md). Hosted infrastructure and live model authorization remain separate.
