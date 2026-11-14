-- The journey shares the existing owned attempt and immutable publication reference.
alter table skillloop_courses.attempts
  add column journey jsonb not null default '{}'::jsonb
    check (jsonb_typeof(journey) = 'object');

grant update (journey) on skillloop_courses.attempts to skillloop_course_server;

create function skillloop_courses.journey_engagement(p_course uuid)
returns table (version integer, diagnosed integer, learned integer, verified integer)
language sql stable security definer set search_path = '' as $$
  select v.version, count(*) filter (where a.journey ? 'diagnosis')::integer,
    count(*) filter (where a.journey ? 'learning')::integer,
    count(*) filter (where a.journey ? 'verificationHistory')::integer
  from skillloop_courses.courses c
  join skillloop_courses.versions v on v.course_id = c.id
  left join skillloop_courses.attempts a on a.course_id = v.course_id and a.version = v.version
  where c.id = p_course and c.owner_id = skillloop_courses.actor() and skillloop_courses.is_teacher()
  group by v.version order by v.version desc
$$;
revoke all on function skillloop_courses.journey_engagement(uuid) from public, anon, authenticated;
grant execute on function skillloop_courses.journey_engagement(uuid) to skillloop_course_server;
