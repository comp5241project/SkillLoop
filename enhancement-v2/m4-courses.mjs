import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import adapter from './legacy-adapter.cjs';
import teacherDraft from './m3-teacher-draft.cjs';
import studio from './m3-studio-session.cjs';

const { convertStudentCatalog } = adapter;
const { makeCaseRef, createManualDraft, validateTeacherDraft, draftPreview } = teacherDraft;
const { fieldErrors } = studio;
const root = fileURLToPath(new URL('../', import.meta.url));
export const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

export class CourseError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function caseContext() {
  const { caseId, caseVersion, title, scenario, aiClaim, requirements, starterCode } =
    convertStudentCatalog(root)['cart-checkout'];
  return { caseId, caseVersion, conceptId: 'edge-cases', title, scenario, aiClaim, requirements, starterCode };
}

function canonicalDraft(form, current) {
  const fields = fieldErrors(form);
  if (Object.keys(fields).length) throw new CourseError(422, 'Correct the highlighted fields.', fields);
  try {
    const draft = createManualDraft({
      caseRef: makeCaseRef({ caseId: 'cart-checkout', caseVersion: 1, conceptId: 'edge-cases' }),
      brief: form.brief,
      content: form.content,
      ...(current ? { draftId: current.draftId } : {}),
    });
    if (current) draft.revision = current.revision + 1;
    return validateTeacherDraft(draft);
  } catch (error) {
    throw new CourseError(422, error.message);
  }
}

function snapshot(draft) {
  const { status, ...lesson } = draftPreview(draft);
  const { title, scenario, aiClaim } = caseContext();
  return { schemaVersion: 1, ...lesson, context: { title, scenario, aiClaim } };
}

function checkDraft(row, expectedRevision) {
  if (row.draft_revision !== expectedRevision) {
    throw new CourseError(409, 'This draft changed. Your form edits are intact. Reopen the saved draft to see the latest revision.');
  }
}

const versionSummary = (row) => ({
  version: row.version, title: row.title, draftRevision: row.draft_revision, publishedAt: row.published_at,
});

async function courseRow(db, courseId, lock = false) {
  const { rows: [row] } = await db.query(`select * from skillloop_courses.courses
    where id = $1${lock ? ' for update' : ''}`, [courseId]);
  if (!row) throw new CourseError(404, 'Course draft not found.');
  return row;
}

async function publishedRow(db, courseId, version) {
  const { rows: [row] } = await db.query(`select version, snapshot, published_at from skillloop_courses.versions
    where course_id = $1 and version = $2`, [courseId, version]);
  if (!row) throw new CourseError(404, 'This published course version could not be found.');
  return { courseId, version: row.version, publishedAt: row.published_at, lesson: row.snapshot };
}

async function attemptRow(db, courseId, version) {
  const { rows: [row] } = await db.query(`select started_at, submitted_at, responses from skillloop_courses.attempts
    where course_id = $1 and version = $2 and learner_id = skillloop_courses.actor()`, [courseId, version]);
  return row ? { startedAt: row.started_at, submittedAt: row.submitted_at, responses: row.responses } : null;
}

function validResponses(responses, lesson) {
  const ids = lesson.exercises.map(({ exerciseId }) => exerciseId);
  if (!responses || typeof responses !== 'object' || Array.isArray(responses) ||
      Object.keys(responses).length !== ids.length ||
      !ids.every((id) => Object.hasOwn(responses, id) && typeof responses[id] === 'string' &&
        responses[id].trim().length > 0 && responses[id].length <= 2000 && !responses[id].includes('\x00'))) {
    throw new CourseError(422, 'Enter a response of 1–2,000 characters for each exercise.');
  }
  return Object.fromEntries(ids.map((id) => [id, responses[id].trim()]));
}

export function courseStore(pool) {
  async function transaction(actor, required, run) {
    if (required && !actor) throw new CourseError(401, 'Sign in to continue.');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role skillloop_course_server');
      await client.query("set local statement_timeout = '5s'");
      await client.query("select set_config('skillloop.course_actor', $1, true)", [actor ?? '']);
      if (required) {
        const { rows: [row] } = await client.query('select skillloop_courses.is_teacher() as teacher');
        if (row.teacher !== (required === 'teacher')) {
          throw new CourseError(403, required === 'teacher' ? 'Teacher access required.' : 'Use a learner account to record practice.');
        }
      }
      const result = await run(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    role: (actor) => transaction(actor, null, async (db) => {
      const { rows: [row] } = await db.query('select skillloop_courses.is_teacher() as teacher');
      return row.teacher ? 'teacher' : 'student';
    }),
    list: (actor) => transaction(actor, 'teacher', async (db) => {
      const { rows } = await db.query(`select id, draft->'content'->>'title' as title, draft_revision, reviewed_revision
        from skillloop_courses.courses order by updated_at desc, id`);
      return rows.map((row) => ({ id: row.id, title: row.title, revision: row.draft_revision,
        reviewed: row.reviewed_revision === row.draft_revision }));
    }),
    open: (actor, courseId) => transaction(actor, 'teacher', async (db) => {
      const row = await courseRow(db, courseId, true);
      const { rows } = await db.query(`select version, snapshot->>'title' as title, draft_revision, published_at
        from skillloop_courses.versions where course_id = $1 order by version desc`, [courseId]);
      const { rows: engagement } = await db.query('select * from skillloop_courses.engagement($1)', [courseId]);
      return { id: row.id, draft: row.draft, reviewed: row.reviewed_revision === row.draft_revision,
        versions: rows.map(versionSummary), engagement };
    }),
    save: (actor, courseId, expectedRevision, form) => transaction(actor, 'teacher', async (db) => {
      if (!courseId) {
        const draft = canonicalDraft(form);
        const { rows: [row] } = await db.query(`insert into skillloop_courses.courses(owner_id, draft)
          values (skillloop_courses.actor(), $1) returning id`, [draft]);
        return { id: row.id, draft };
      }
      const row = await courseRow(db, courseId, true);
      checkDraft(row, expectedRevision);
      const draft = canonicalDraft(form, row.draft);
      if (isDeepStrictEqual(draft.brief, row.draft.brief) && isDeepStrictEqual(draft.content, row.draft.content)) {
        return { id: courseId, draft: row.draft };
      }
      await db.query(`update skillloop_courses.courses set draft = $2, draft_revision = $3,
        reviewed_revision = null, reviewed_by = null, reviewed_at = null, updated_at = now()
        where id = $1`, [courseId, draft, draft.revision]);
      return { id: courseId, draft };
    }),
    preview: (actor, form) => transaction(actor, 'teacher', () => snapshot(canonicalDraft(form))),
    review: (actor, courseId, expectedRevision) => transaction(actor, 'teacher', async (db) => {
      const row = await courseRow(db, courseId, true);
      checkDraft(row, expectedRevision);
      const lesson = snapshot(row.draft);
      await db.query(`update skillloop_courses.courses set reviewed_revision = draft_revision,
        reviewed_by = skillloop_courses.actor(), reviewed_at = now() where id = $1 and reviewed_revision is null`, [courseId]);
      return { revision: row.draft_revision, lesson };
    }),
    publish: (actor, courseId, expectedRevision) => transaction(actor, 'teacher', async (db) => {
      const row = await courseRow(db, courseId, true);
      checkDraft(row, expectedRevision);
      if (row.reviewed_revision !== row.draft_revision) {
        throw new CourseError(409, 'Review and approve this saved revision before publishing.');
      }
      const lesson = snapshot(row.draft);
      const { rows: [existing] } = await db.query(`select version, published_at from skillloop_courses.versions
        where course_id = $1 and draft_revision = $2`, [courseId, expectedRevision]);
      if (existing) return { version: existing.version, publishedAt: existing.published_at };
      const { rows: [release] } = await db.query(`insert into skillloop_courses.versions
        (course_id, version, draft_revision, snapshot, reviewed_at, published_by)
        select c.id, (select coalesce(max(v.version), 0) + 1 from skillloop_courses.versions v
          where v.course_id = c.id), c.draft_revision, $2, c.reviewed_at, skillloop_courses.actor()
        from skillloop_courses.courses c where c.id = $1 returning version, published_at`, [courseId, lesson]);
      return { version: release.version, publishedAt: release.published_at };
    }),
    read: (courseId, version) => transaction(null, null, (db) => publishedRow(db, courseId, version)),
    attempt: (actor, courseId, version) => transaction(actor, 'student', async (db) => {
      await publishedRow(db, courseId, version);
      return attemptRow(db, courseId, version);
    }),
    start: (actor, courseId, version) => transaction(actor, 'student', async (db) => {
      await publishedRow(db, courseId, version);
      await db.query(`insert into skillloop_courses.attempts(course_id, version, learner_id)
        values ($1, $2, skillloop_courses.actor()) on conflict do nothing`, [courseId, version]);
      return attemptRow(db, courseId, version);
    }),
    submit: (actor, courseId, version, responses) => transaction(actor, 'student', async (db) => {
      const { lesson } = await publishedRow(db, courseId, version);
      const valid = validResponses(responses, lesson);
      const result = await db.query(`update skillloop_courses.attempts set responses = $3, submitted_at = now()
        where course_id = $1 and version = $2 and learner_id = skillloop_courses.actor()
          and submitted_at is null`, [courseId, version, valid]);
      const attempt = await attemptRow(db, courseId, version);
      if (!result.rowCount && !isDeepStrictEqual(attempt?.responses, valid)) {
        throw new CourseError(409, attempt?.submittedAt ? 'This attempt has already been submitted.' : 'Start practice before submitting.');
      }
      return attempt;
    }),
  };
}

export function createConfiguredStore() {
  const connectionString = process.env.SKILLLOOP_COURSE_DATABASE_URL;
  if (!connectionString) throw new CourseError(503, 'Course database is not configured.');
  return courseStore(new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, allowExitOnIdle: true }));
}
