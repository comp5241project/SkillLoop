-- v3 authoring is private; backing courses stay readable by the existing Journey.
alter table skillloop_courses.courses add column v3_managed boolean not null default false;
create table skillloop_courses.v3_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default skillloop_courses.actor() references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  approved_hash text check (approved_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now(),
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  content jsonb,
  choices jsonb,
  selection integer,
  course_id uuid unique references skillloop_courses.courses(id)
);
create index v3_drafts_owner on skillloop_courses.v3_drafts(owner_id, updated_at desc);
alter table skillloop_courses.v3_drafts enable row level security;
create policy v3_own_draft on skillloop_courses.v3_drafts for all to skillloop_course_server
  using (owner_id = (select skillloop_courses.actor()) and (select skillloop_courses.is_teacher()))
  with check (owner_id = (select skillloop_courses.actor()) and (select skillloop_courses.is_teacher()));
grant select, insert on skillloop_courses.v3_drafts to skillloop_course_server;
grant update (revision, approved_hash, updated_at, content, choices, selection, course_id)
  on skillloop_courses.v3_drafts to skillloop_course_server;

create table skillloop_courses.v3_publications (
  course_id uuid not null,
  version integer not null,
  draft_revision integer not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  primary key (course_id, version),
  unique (course_id, draft_revision),
  foreign key (course_id, version) references skillloop_courses.versions(course_id, version)
);
alter table skillloop_courses.v3_publications enable row level security;
create policy v3_read_publication on skillloop_courses.v3_publications
  for select to skillloop_course_server using (true);
create policy v3_publish_own on skillloop_courses.v3_publications
  for insert to skillloop_course_server with check (exists (
    select 1 from skillloop_courses.v3_drafts d
    join skillloop_courses.courses c on c.id = d.course_id and c.v3_managed
    join skillloop_courses.versions v on v.course_id = c.id and v.version = v3_publications.version
    where d.course_id = v3_publications.course_id and d.revision = v3_publications.draft_revision
      and d.approved_hash = v3_publications.content_hash and v.published_by = (select skillloop_courses.actor())
  ));
create trigger immutable_v3_publication before update or delete on skillloop_courses.v3_publications
  for each row execute function skillloop_courses.immutable_version();
grant select, insert on skillloop_courses.v3_publications to skillloop_course_server;

-- Durable leases bound concurrent and repeat provider calls per signed-in actor.
create table skillloop_courses.v3_ai_budget (
  actor_id uuid primary key default skillloop_courses.actor() references auth.users(id) on delete cascade,
  bucket timestamptz not null,
  calls integer not null check (calls between 1 and 24),
  lease uuid,
  lease_until timestamptz not null
);
alter table skillloop_courses.v3_ai_budget enable row level security;
create policy v3_own_budget on skillloop_courses.v3_ai_budget for all to skillloop_course_server
  using (actor_id = (select skillloop_courses.actor()))
  with check (actor_id = (select skillloop_courses.actor()));
grant select, insert on skillloop_courses.v3_ai_budget to skillloop_course_server;
grant update (bucket, calls, lease, lease_until) on skillloop_courses.v3_ai_budget to skillloop_course_server;

create table skillloop_courses.v3_lessons (
  attempt_id uuid not null references skillloop_courses.attempts(attempt_id) on delete cascade,
  evidence_key text not null check (evidence_key ~ '^[a-f0-9]{64}$'),
  lesson jsonb,
  generation_error text,
  answer text,
  feedback jsonb,
  feedback_error text,
  primary key (attempt_id, evidence_key)
);
alter table skillloop_courses.v3_lessons enable row level security;
create policy v3_own_lesson on skillloop_courses.v3_lessons for all to skillloop_course_server
  using (exists (select 1 from skillloop_courses.attempts a where a.attempt_id = v3_lessons.attempt_id
    and a.learner_id = (select skillloop_courses.actor()) and not (select skillloop_courses.is_teacher())))
  with check (exists (select 1 from skillloop_courses.attempts a where a.attempt_id = v3_lessons.attempt_id
    and a.learner_id = (select skillloop_courses.actor()) and not (select skillloop_courses.is_teacher())));
grant select, insert on skillloop_courses.v3_lessons to skillloop_course_server;
grant update (lesson, generation_error, answer, feedback, feedback_error)
  on skillloop_courses.v3_lessons to skillloop_course_server;

revoke all on skillloop_courses.v3_drafts, skillloop_courses.v3_publications,
  skillloop_courses.v3_ai_budget, skillloop_courses.v3_lessons from public, anon, authenticated;
