-- Preserve existing attempts and their one-per-learner/version constraint.
alter table skillloop_courses.attempts
  add column attempt_id uuid not null default gen_random_uuid() unique;
