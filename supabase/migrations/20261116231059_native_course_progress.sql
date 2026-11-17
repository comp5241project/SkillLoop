create table skillloop_courses.native_progress (
  attempt_id uuid primary key references skillloop_courses.attempts(attempt_id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table skillloop_courses.native_progress enable row level security;
create policy native_progress_owner on skillloop_courses.native_progress
  for all to skillloop_course_server
  using (exists (select 1 from skillloop_courses.attempts a where a.attempt_id = native_progress.attempt_id
    and a.learner_id = (select skillloop_courses.actor())))
  with check (exists (select 1 from skillloop_courses.attempts a where a.attempt_id = native_progress.attempt_id
    and a.learner_id = (select skillloop_courses.actor())));
revoke all on skillloop_courses.native_progress from public, anon, authenticated;
grant select, insert on skillloop_courses.native_progress to skillloop_course_server;
grant update (revision, state, updated_at) on skillloop_courses.native_progress to skillloop_course_server;
