-- Allow a learner to edit only the reason of a personal link they own.
create policy "update own personal link reason" on public.skillloop_personal_edges
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Some Supabase projects give new public tables broad default grants. Keep this
-- endpoint limited to reason even when those defaults were present at creation.
revoke update on public.skillloop_personal_edges from public, anon, authenticated;
grant update (reason) on public.skillloop_personal_edges to authenticated;
