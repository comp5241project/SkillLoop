-- Runtime login provisioning is separate from schema deployment. Never give it BYPASSRLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'skillloop_course_server') then
    create role skillloop_course_server nologin;
  end if;
end;
$$;

create schema skillloop_courses;
revoke all on schema skillloop_courses from public, anon, authenticated;
grant usage on schema skillloop_courses, public to skillloop_course_server;
grant select on public.skillloop_roles to skillloop_course_server;

create function skillloop_courses.actor() returns uuid
language sql stable security invoker set search_path = '' as $$
  select nullif(current_setting('skillloop.course_actor', true), '')::uuid;
$$;
revoke all on function skillloop_courses.actor() from public;
grant execute on function skillloop_courses.actor() to skillloop_course_server;

create policy "course server reads actor role" on public.skillloop_roles
  for select to skillloop_course_server
  using (user_id = (select skillloop_courses.actor()));

create function skillloop_courses.is_teacher() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.skillloop_roles
    where user_id = skillloop_courses.actor() and role = 'teacher');
$$;
revoke all on function skillloop_courses.is_teacher() from public;
grant execute on function skillloop_courses.is_teacher() to skillloop_course_server;

create table skillloop_courses.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  draft jsonb not null,
  draft_revision integer not null default 1 check (draft_revision > 0),
  reviewed_revision integer,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((draft->>'revision')::integer is not distinct from draft_revision),
  check (draft->>'status' is not distinct from 'draft-only'),
  check ((reviewed_revision is null and reviewed_by is null and reviewed_at is null) or
    (reviewed_revision = draft_revision and reviewed_by = owner_id and reviewed_at is not null
      and reviewed_revision is not null and reviewed_by is not null))
);
create index courses_by_owner on skillloop_courses.courses(owner_id, updated_at desc, id);
alter table skillloop_courses.courses enable row level security;
create policy own_course on skillloop_courses.courses for all to skillloop_course_server
  using (owner_id = (select skillloop_courses.actor()) and (select skillloop_courses.is_teacher()))
  with check (owner_id = (select skillloop_courses.actor()) and (select skillloop_courses.is_teacher()));

create table skillloop_courses.versions (
  course_id uuid not null references skillloop_courses.courses(id),
  version integer not null check (version > 0),
  draft_revision integer not null check (draft_revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  reviewed_at timestamptz not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  primary key (course_id, version),
  unique (course_id, draft_revision)
);
alter table skillloop_courses.versions enable row level security;
create policy read_version on skillloop_courses.versions for select to skillloop_course_server using (true);
create policy release_reviewed_course on skillloop_courses.versions for insert to skillloop_course_server
  with check (published_by = (select skillloop_courses.actor()) and exists (
    select 1 from skillloop_courses.courses c where c.id = course_id
      and c.owner_id = published_by and c.reviewed_revision = versions.draft_revision
      and c.reviewed_by = published_by and c.reviewed_at = versions.reviewed_at
  ));

create function skillloop_courses.immutable_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Published course versions are immutable' using errcode = '55000';
end;
$$;
revoke all on function skillloop_courses.immutable_version() from public;
create trigger immutable_version before update or delete on skillloop_courses.versions
  for each row execute function skillloop_courses.immutable_version();

create table skillloop_courses.attempts (
  course_id uuid not null,
  version integer not null,
  learner_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  responses jsonb,
  primary key (course_id, version, learner_id),
  foreign key (course_id, version) references skillloop_courses.versions(course_id, version),
  check ((submitted_at is null and responses is null) or
    (submitted_at is not null and jsonb_typeof(responses) is not distinct from 'object'))
);
create index attempts_by_learner on skillloop_courses.attempts(learner_id);
alter table skillloop_courses.attempts enable row level security;
create policy own_attempt on skillloop_courses.attempts for all to skillloop_course_server
  using (learner_id = (select skillloop_courses.actor()) and not (select skillloop_courses.is_teacher()))
  with check (learner_id = (select skillloop_courses.actor()) and not (select skillloop_courses.is_teacher()));

revoke all on all tables in schema skillloop_courses from public, anon, authenticated;
grant select, insert on skillloop_courses.courses to skillloop_course_server;
grant update (draft, draft_revision, reviewed_revision, reviewed_by, reviewed_at, updated_at)
  on skillloop_courses.courses to skillloop_course_server;
grant select, insert on skillloop_courses.versions, skillloop_courses.attempts to skillloop_course_server;
grant update (responses, submitted_at) on skillloop_courses.attempts to skillloop_course_server;

-- Only this aggregate crosses the learner/teacher boundary.
create function skillloop_courses.engagement(p_course uuid)
returns table (version integer, started integer, submitted integer)
language sql stable security definer set search_path = '' as $$
  select v.version, count(a.learner_id)::integer, count(a.submitted_at)::integer
  from skillloop_courses.courses c
  join skillloop_courses.versions v on v.course_id = c.id
  left join skillloop_courses.attempts a on a.course_id = v.course_id and a.version = v.version
  where c.id = p_course and c.owner_id = skillloop_courses.actor()
    and skillloop_courses.is_teacher()
  group by v.version order by v.version desc;
$$;
revoke all on function skillloop_courses.engagement(uuid) from public, anon, authenticated;
grant execute on function skillloop_courses.engagement(uuid) to skillloop_course_server;
