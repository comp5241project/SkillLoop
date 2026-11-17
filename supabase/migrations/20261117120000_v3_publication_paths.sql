create table skillloop_courses.v3_publication_paths (
  course_id uuid not null,
  version integer not null,
  mode text not null check (mode in ('journey', 'native')),
  primary key (course_id, version),
  foreign key (course_id, version)
    references skillloop_courses.v3_publications(course_id, version)
);

alter table skillloop_courses.v3_publication_paths enable row level security;
revoke all on skillloop_courses.v3_publication_paths from public, anon, authenticated;
grant select, insert on skillloop_courses.v3_publication_paths to skillloop_course_server;

create policy read_v3_publication_path on skillloop_courses.v3_publication_paths
  for select to skillloop_course_server using (true);

create policy write_own_v3_publication_path on skillloop_courses.v3_publication_paths
  for insert to skillloop_course_server with check (exists (
    select 1 from skillloop_courses.versions v
    where v.course_id = v3_publication_paths.course_id
      and v.version = v3_publication_paths.version
      and v.published_by = (select skillloop_courses.actor())
      and (select skillloop_courses.is_teacher())
  ));

create trigger immutable_v3_publication_path
  before update or delete on skillloop_courses.v3_publication_paths
  for each row execute function skillloop_courses.immutable_version();
