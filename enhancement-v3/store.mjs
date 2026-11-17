import { randomUUID } from 'node:crypto';
import { coursePublication } from '../enhancement-v2/m4-courses.mjs';
import { caseIndex, contentFor, fail, hash, journeyForm, lessonContext, PROMPT_VERSION, publicationFor } from './model.mjs';

import { nativeEnabled, nativeRuntimeAvailable } from './native/environment.mjs';
import { nativeCase } from './native/cases.mjs';

const draftSelect = 'select * from skillloop_courses.v3_drafts where id = $1';
async function draftRow(db, id, revision, lock = false) {
  const { rows: [row] } = await db.query(draftSelect + (lock ? ' for update' : ''), [id]);
  if (!row) fail(404, 'Course draft not found.');
  if (revision !== undefined && row.revision !== revision)
    fail(409, 'This draft changed. Your current edits are still here; reopen the latest saved revision before continuing.');
  return row;
}
const view = row => ({ id: row.id, revision: row.revision, source: row.source, content: row.content, choices: row.choices,
  selection: row.selection, approved: Boolean(row.approved_hash), courseId: row.course_id, cases: caseIndex() });
const releaseView = ({ course_id, version, published_at, draft_revision, mode }) => ({
  courseId: course_id, version, publishedAt: published_at, draftRevision: draft_revision, mode,
});
const releasesFor = async (db, courseId) => courseId ? (await db.query(`select p.course_id, p.version, v.published_at, p.draft_revision,
  coalesce(path.mode, 'journey') as mode
  from skillloop_courses.v3_publications p join skillloop_courses.versions v using (course_id, version)
  left join skillloop_courses.v3_publication_paths path using (course_id, version)
  where p.course_id = $1 order by p.version desc`, [courseId])).rows.map(releaseView) : [];
const stages = [
  ['verification', '/correction-lab/'], ['repair', '/interview/'],
  ['learning', '/knowledge-map/'], ['diagnosis', '/learning-path/'],
];

function safeSummary(row) {
  const { title, summary, level, objectives, caseRef, caseTitle } = row.snapshot ?? {};
  const legacy = row.legacy;
  return { courseId: row.course_id, version: row.version, publishedAt: row.published_at, personalized: Boolean(row.snapshot),
    mode: row.mode, native: row.mode === 'native',
    title: title ?? legacy.title, summary: summary ?? legacy.explanation,
    level: level ?? null, objectives: objectives ?? legacy.objectives.map(item => item.text),
    caseRef: caseRef ?? legacy.caseRef, caseTitle: caseTitle ?? legacy.context.title };
}
const publicationFields = `v.course_id, v.version, v.published_at, p.draft_revision, p.content_hash,
  p.snapshot, v.snapshot as legacy, coalesce(path.mode, 'journey') as mode`;
const publicationFrom = `from skillloop_courses.versions v
  left join skillloop_courses.v3_publications p using (course_id, version)
  left join skillloop_courses.v3_publication_paths path using (course_id, version)`;
const publicationSelect = `select ${publicationFields} ${publicationFrom}`;
async function publicationRow(db, courseId, version) {
  const { rows: [row] } = await db.query(publicationSelect + ' where v.course_id = $1 and v.version = $2', [courseId, version]);
  if (!row) fail(404, 'This published course version could not be found.');
  return row;
}

async function contextRow(db, courseId, version) {
  const row = await publicationRow(db, courseId, version);
  if (!row.snapshot) fail(404, 'This course does not have a personalized lesson.');
  const { rows: [attempt] } = await db.query(row.mode === 'native' ? `select a.attempt_id,
    n.state->'evidence' as diagnosis
    from skillloop_courses.attempts a left join skillloop_courses.native_progress n using (attempt_id)
    where a.course_id=$1 and a.version=$2 and a.learner_id=skillloop_courses.actor()` :
    `select attempt_id, journey->'diagnosis' as diagnosis from skillloop_courses.attempts
    where course_id=$1 and version=$2 and learner_id=skillloop_courses.actor()`, [courseId, version]);
  if (!attempt) fail(409, 'Start this course with your account and complete Part 1.');
  const evidenceKey = hash({ courseId, version, contentHash: row.content_hash, caseRef: row.snapshot.caseRef,
    attemptId: attempt.attempt_id, diagnosis: attempt.diagnosis, promptVersion: PROMPT_VERSION });
  return { publication: safeSummary(row), attemptId: attempt.attempt_id, evidenceKey,
    context: lessonContext(row.snapshot, attempt.diagnosis) };
}

const state = "(case when path.mode = 'native' then n.state else a.journey end)";
const learnerPublications = `select ${publicationFields}, a.started_at,
  (${state}->>'diagnosis') is not null as diagnosed, (${state}->>'learning') is not null as learned,
  ((${state}->>'plan') is not null or (${state}->'repair') ? 'choices') as repaired,
  ${state}->'verification'->>'outcome' as outcome, (${state}->>'verification') is not null as verified
  ${publicationFrom}
  left join skillloop_courses.attempts a on a.course_id = v.course_id and a.version = v.version
    and a.learner_id = skillloop_courses.actor()
  left join skillloop_courses.native_progress n using (attempt_id)`;

function learnerEntry(row) {
  const index = row.repaired ? 0 : row.learned ? 1 : row.diagnosed ? 2 : 3;
  return { ...safeSummary(row), started: Boolean(row.started_at), stage: stages[index][0], route: stages[index][1],
    diagnosed: row.diagnosed, verified: row.verified, outcome: row.outcome, startedAt: row.started_at };
}
const lessonSelect = `select lesson, generation_error, answer, feedback, feedback_error
  from skillloop_courses.v3_lessons where attempt_id = $1 and evidence_key = $2`;
const bind = current => [current.attemptId, current.evidenceKey];
async function record(db, current) {
  const { rows: [row] } = await db.query(lessonSelect, bind(current));
  return { ...current, lesson: row?.lesson ?? null, generationError: row?.generation_error ?? null, answer: row?.answer ?? null,
    feedback: row?.feedback ?? null, feedbackError: row?.feedback_error ?? null };
}
const knownFailure = error => Number.isInteger(error?.status) ? error.message : 'Live AI is temporarily unavailable. Retry later.';

export function v3Store(courses, ai) {
  const tx = courses.v3Transaction;
  const teacher = (actor, run) => tx(actor, 'teacher', run);
  const student = (actor, run) => tx(actor, 'student', run);
  const publicRead = run => tx(null, null, run);
  const entry = (actor, courseId, version) => student(actor, async db => {
    const { rows: [row] } = await db.query(learnerPublications + ' where v.course_id = $1 and v.version = $2',
      [courseId, version]);
    if (!row) fail(404, 'This published course version could not be found.');
    return learnerEntry(row);
  });

  async function budget(actor, role, run) {
    const lease = randomUUID();
    await tx(actor, role, async db => {
      const result = await db.query(`insert into skillloop_courses.v3_ai_budget
        (bucket, calls, lease, lease_until) values (date_trunc('hour', now()), 1, $1, now() + interval '40 seconds')
        on conflict (actor_id) do update set bucket = excluded.bucket,
          calls = case when v3_ai_budget.bucket = excluded.bucket then v3_ai_budget.calls + 1 else 1 end,
          lease = excluded.lease, lease_until = excluded.lease_until
        where v3_ai_budget.lease_until < now() and (v3_ai_budget.bucket <> excluded.bucket or v3_ai_budget.calls < 24)
        returning lease`, [lease]);
      if (!result.rowCount) fail(429, 'An AI request is in progress or you reached the hourly limit. Try again later.');
    });
    try { return await run(); }
    finally {
      await tx(actor, role, db => db.query(`update skillloop_courses.v3_ai_budget set lease = null, lease_until = '-infinity'
        where actor_id = skillloop_courses.actor() and lease = $1`, [lease])).catch(() => {});
    }
  }

  async function mutate(db, row, content, choices, selection) {
    const { rows: [next] } = await db.query(`update skillloop_courses.v3_drafts set content = $2, choices = $3,
      selection = $4, revision = revision + 1, approved_hash = null, updated_at = now() where id = $1 returning *`,
    [row.id, content, choices === null ? null : JSON.stringify(choices), selection]);
    return view(next);
  }

  return {
    mode: (courseId, version) => publicRead(async db => {
      const { rows: [row] } = await db.query(`select coalesce(path.mode, 'journey') as mode
        ${publicationFrom} where v.course_id = $1 and v.version = $2`, [courseId, version]);
      if (!row) fail(404, 'This published course version could not be found.');
      return row.mode;
    }),
    entry,
    begin: async (actor, courseId, version) => {
      const current = await entry(actor, courseId, version);
      if (current.native && !nativeRuntimeAvailable()) fail(503, 'The original course experience is temporarily unavailable.');
      if (current.started) return current;
      await courses.start(actor, courseId, version);
      return entry(actor, courseId, version);
    },
    runLearnerAI: (actor, run) => budget(actor, 'student', run),
    assertTeacher: actor => teacher(actor, () => true),
    import: (actor, source) => teacher(actor, async db => {
      const { rows: [row] } = await db.query('insert into skillloop_courses.v3_drafts(source) values ($1) returning *', [source]);
      return view(row);
    }),
    list: actor => teacher(actor, async db => {
      const { rows } = await db.query(`select id, revision, approved_hash, content->>'title' as title,
        source->>'title' as source_title from skillloop_courses.v3_drafts order by updated_at desc limit 100`);
      return rows.map(row => ({ id: row.id, revision: row.revision, title: row.title ?? row.source_title, approved: !!row.approved_hash }));
    }),
    open: (actor, id) => teacher(actor, async db => {
      const row = await draftRow(db, id);
      return { ...view(row), releases: await releasesFor(db, row.course_id) };
    }),
    save: (actor, id, revision, value) => teacher(actor, async db => {
      const row = await draftRow(db, id, revision, true);
      const content = contentFor(value, row.source);
      if (hash(content) === hash(row.content)) return view(row);
      return mutate(db, row, content, null, null);
    }),
    generate: async (actor, id, revision) => {
      const row = await teacher(actor, db => draftRow(db, id, revision));
      return budget(actor, 'teacher', async () => {
        const { value, ai: origin } = await ai.notes(row.source);
        return teacher(actor, async db => ({ ...await mutate(db, await draftRow(db, id, revision, true), value, null, null), ai: origin }));
      });
    },
    match: async (actor, id, revision) => {
      const row = await teacher(actor, db => draftRow(db, id, revision));
      if (!row.content) fail(409, 'Generate and review knowledge notes before matching.');
      return budget(actor, 'teacher', async () => {
        const { value, ai: origin } = await ai.matches(row.content);
        return teacher(actor, async db => ({ ...await mutate(db, await draftRow(db, id, revision, true), row.content, value, null), ai: origin }));
      });
    },
    select: (actor, id, revision, selection) => teacher(actor, async db => {
      const row = await draftRow(db, id, revision, true);
      const publication = publicationFor({ ...row, selection });
      if (row.course_id) {
        const { rows: [first] } = await db.query(`select snapshot->'caseRef' as ref from skillloop_courses.v3_publications
          where course_id = $1 order by version limit 1`, [row.course_id]);
        if (hash(first?.ref ?? null) !== hash(publication.caseRef))
          fail(409, 'An existing course uses a fixed case. Import a new draft to publish for another case.');
      }
      if (row.selection === selection) return view(row);
      return mutate(db, row, row.content, row.choices, selection);
    }),
    preview: (actor, id, revision) => teacher(actor, async db => publicationFor(await draftRow(db, id, revision))),
    review: (actor, id, revision) => teacher(actor, async db => {
      const row = await draftRow(db, id, revision, true);
      const publication = publicationFor(row);
      await db.query('update skillloop_courses.v3_drafts set approved_hash = $2 where id = $1', [row.id, hash(publication)]);
      return { approved: true, preview: publication };
    }),
    publish: (actor, id, revision) => teacher(actor, async db => {
      const row = await draftRow(db, id, revision, true);
      const publication = publicationFor(row);
      const digest = hash(publication);
      if (row.approved_hash !== digest) fail(409, 'Approve the saved preview before publishing.');
      if (row.course_id) {
        const existing = (await releasesFor(db, row.course_id)).find(item => item.draftRevision === revision);
        if (existing) return existing;
      }
      if (process.env.SKILLLOOP_COURSE_PUBLICATION_PAUSED === '1')
        fail(503, 'New course publication is temporarily paused. Your approved draft is saved.');
      const mode = nativeEnabled() ? 'native' : 'journey';
      if (mode === 'native' && !nativeCase(publication.caseRef)) fail(422, 'This case cannot run all four original stages.');
      const { rows: [prior] } = row.course_id ? await db.query(
        'select draft_revision from skillloop_courses.courses where id = $1 and v3_managed', [row.course_id]) : { rows: [] };
      const saved = await coursePublication.save(db, row.course_id, prior?.draft_revision,
        journeyForm(publication), publication.caseRef, undefined, true);
      await db.query('update skillloop_courses.v3_drafts set course_id = $2 where id = $1', [row.id, saved.id]);
      await coursePublication.review(db, saved.id, saved.draft.revision, true);
      const release = await coursePublication.publish(db, saved.id, saved.draft.revision, true);
      await db.query(`insert into skillloop_courses.v3_publications (course_id, version, draft_revision, content_hash, snapshot)
        values ($1, $2, $3, $4, $5)`, [saved.id, release.version, revision, digest, publication]);
      await db.query('insert into skillloop_courses.v3_publication_paths (course_id, version, mode) values ($1, $2, $3)',
        [saved.id, release.version, mode]);
      return { courseId: saved.id, draftRevision: revision, ...release, mode };
    }),
    catalog: () => publicRead(async db => {
      const { rows } = await db.query(`select * from (${publicationSelect}
        where not exists (select 1 from skillloop_courses.versions newer where newer.course_id = v.course_id and newer.version > v.version)
        ) latest order by published_at desc, course_id limit 100`);
      return rows.map(safeSummary);
    }),
    overview: (courseId, version) => publicRead(async db => {
      const row = await publicationRow(db, courseId, version);
      return { ...safeSummary(row), notes: row.snapshot?.notes ?? [], mapping: row.snapshot?.mapping ?? [], contentHash: row.content_hash };
    }),
    learning: actor => student(actor, async db => {
      const { rows } = await db.query(learnerPublications + ' where a.attempt_id is not null order by a.started_at desc limit 100');
      return rows.map(learnerEntry);
    }),
    lesson: (actor, courseId, version) => student(actor, async db => record(db, await contextRow(db, courseId, version))),
    generateLesson: async (actor, courseId, version, evidenceKey) => {
      const current = await student(actor, async db => record(db, await contextRow(db, courseId, version)));
      if (current.evidenceKey !== evidenceKey) fail(409, 'Your diagnosis changed. Reopen the lesson.');
      if (current.lesson) return current;
      return budget(actor, 'student', async () => {
        const latest = await student(actor, db => record(db, current));
        if (latest.lesson) return latest;
        let lesson, error;
        try {
          const result = await ai.lesson(current.context, current.evidenceKey);
          lesson = { ...result.value, ...result.ai };
        } catch (failure) { error = failure; }
        const persisted = await student(actor, async db => {
          const check = await contextRow(db, courseId, version);
          if (check.evidenceKey !== current.evidenceKey) fail(409, 'Your diagnosis changed while the lesson was generating. Reopen the lesson.');
          await db.query(`insert into skillloop_courses.v3_lessons (attempt_id, evidence_key, lesson, generation_error)
            values ($1, $2, $3, $4) on conflict (attempt_id, evidence_key) do update
            set lesson = excluded.lesson, generation_error = excluded.generation_error where v3_lessons.lesson is null`,
          [...bind(current), lesson ?? null, error ? knownFailure(error) : null]);
          return record(db, check);
        });
        return persisted;
      });
    },
    answer: async (actor, courseId, version, evidenceKey, answer) => {
      const current = await student(actor, async db => {
        const current = await contextRow(db, courseId, version);
        if (current.evidenceKey !== evidenceKey) fail(409, 'Your diagnosis changed. Reopen the lesson to use the current exercise.');
        const { rows: [updated] } = await db.query(`update skillloop_courses.v3_lessons set
          feedback = case when answer = $3 then feedback else null end,
          feedback_error = case when answer = $3 then feedback_error else null end, answer = $3
          where attempt_id = $1 and evidence_key = $2 and lesson is not null returning lesson, feedback`, [...bind(current), answer]);
        if (!updated) fail(409, 'Generate the lesson before answering.');
        return { ...current, ...updated };
      });
      if (current.feedback) return student(actor, db => record(db, current));
      return budget(actor, 'student', async () => {
        let feedback, error;
        try {
          const result = await ai.feedback(current.context, current.lesson, answer);
          feedback = { ...result.value, ...result.ai };
        } catch (failure) { error = failure; }
        return student(actor, async db => {
          const check = await contextRow(db, courseId, version);
          if (check.evidenceKey !== current.evidenceKey) fail(409, 'Your diagnosis changed. Your answer remains saved for the previous lesson.');
          await db.query(`update skillloop_courses.v3_lessons set feedback = $4, feedback_error = $5
            where attempt_id = $1 and evidence_key = $2 and answer = $3 and feedback is null`,
          [...bind(current), answer, feedback ?? null, error ? knownFailure(error) : null]);
          return record(db, check);
        });
      });
    },
  };
}
