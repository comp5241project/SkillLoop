-- SkillLoop knowledge-map backend. Apply to a dedicated Supabase project.
create table if not exists public.skillloop_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student'))
);
alter table public.skillloop_roles enable row level security;
create policy "read own SkillLoop role" on public.skillloop_roles
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.skillloop_roles to authenticated;

create table public.skillloop_graphs (
  id text primary key,
  owner_id uuid not null references auth.users(id),
  title text not null,
  current_version text,
  created_at timestamptz not null default now()
);
alter table public.skillloop_graphs enable row level security;
create policy "read published SkillLoop graphs or own draft" on public.skillloop_graphs
  for select to anon, authenticated using (current_version is not null or owner_id = (select auth.uid()));
grant select on public.skillloop_graphs to anon, authenticated;

create table public.skillloop_publications (
  graph_id text not null references public.skillloop_graphs(id),
  version text not null,
  payload jsonb not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  primary key (graph_id, version)
);
alter table public.skillloop_publications enable row level security;
create policy "read published SkillLoop versions" on public.skillloop_publications
  for select to anon, authenticated using (
    exists (select 1 from public.skillloop_graphs g where g.id = graph_id and g.current_version is not null)
  );
grant select on public.skillloop_publications to anon, authenticated;

create table public.skillloop_drafts (
  graph_id text primary key references public.skillloop_graphs(id),
  owner_id uuid not null references auth.users(id),
  revision uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.skillloop_drafts enable row level security;
create policy "read own SkillLoop draft" on public.skillloop_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
grant select on public.skillloop_drafts to authenticated;

create table public.skillloop_references (
  user_id uuid not null references auth.users(id) on delete cascade,
  graph_id text not null references public.skillloop_graphs(id),
  concept_id text not null,
  source_version text not null,
  title_snapshot text not null,
  description_snapshot text not null,
  note text not null default '',
  added_at timestamptz not null default now(),
  primary key (user_id, graph_id, concept_id)
);
alter table public.skillloop_references enable row level security;
create policy "read own SkillLoop references" on public.skillloop_references
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.skillloop_references to authenticated;

create table public.skillloop_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  model text not null,
  input_text text not null,
  summary text not null,
  sources jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.skillloop_discovery_runs enable row level security;
create policy "read own SkillLoop discovery" on public.skillloop_discovery_runs
  for select to authenticated using (teacher_id = (select auth.uid()));
create policy "record own SkillLoop discovery" on public.skillloop_discovery_runs
  for insert to authenticated with check (
    teacher_id = (select auth.uid()) and exists (
      select 1 from public.skillloop_roles r where r.user_id = (select auth.uid()) and r.role = 'teacher'
    )
  );
grant select, insert on public.skillloop_discovery_runs to authenticated;

create function public.skillloop_is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.skillloop_roles r
    where r.user_id = auth.uid() and r.role = 'teacher'
  );
$$;
revoke all on function public.skillloop_is_teacher() from public;
grant execute on function public.skillloop_is_teacher() to authenticated;

create function public.skillloop_save_draft(p_graph text, p_payload jsonb, p_expected uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_current uuid;
  v_next uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  if p_graph !~ '^[a-z][a-z0-9-]{0,63}$' or p_payload->'publication'->>'id' is distinct from p_graph
     or jsonb_typeof(p_payload->'topics') is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'Invalid graph payload';
  end if;
  insert into public.skillloop_graphs(id, owner_id, title)
    values (p_graph, auth.uid(), p_payload->'publication'->>'title')
    on conflict (id) do nothing;
  select owner_id into v_owner from public.skillloop_graphs where id = p_graph for update;
  if v_owner is distinct from auth.uid() then
    raise sqlstate 'PT403' using message = 'This graph belongs to another teacher';
  end if;
  select revision into v_current from public.skillloop_drafts where graph_id = p_graph;
  if v_current is distinct from p_expected then
    raise sqlstate 'PT409' using message = 'Draft changed; reload before saving';
  end if;
  insert into public.skillloop_drafts(graph_id, owner_id, revision, payload)
    values (p_graph, auth.uid(), v_next, p_payload)
    on conflict (graph_id) do update set revision = excluded.revision,
      payload = excluded.payload, updated_at = now();
  return v_next;
end;
$$;
revoke all on function public.skillloop_save_draft(text, jsonb, uuid) from public;
grant execute on function public.skillloop_save_draft(text, jsonb, uuid) to authenticated;

create function public.skillloop_publish_draft(p_graph text, p_revision uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_current text;
  v_payload jsonb;
  v_revision uuid;
  v_version text;
  v_existing jsonb;
  v_removed_concept text;
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  select owner_id, current_version into v_owner, v_current
    from public.skillloop_graphs where id = p_graph for update;
  if v_owner is distinct from auth.uid() then
    raise sqlstate 'PT403' using message = 'This graph belongs to another teacher';
  end if;
  select payload, revision into v_payload, v_revision
    from public.skillloop_drafts where graph_id = p_graph;
  if v_revision is distinct from p_revision then
    raise sqlstate 'PT409' using message = 'Draft changed; reload before publishing';
  end if;
  v_version := v_payload->'publication'->>'version';
  if v_version is null or v_version = '' then
    raise sqlstate 'PT400' using message = 'Publication version required';
  end if;
  if v_current is not null then
    select old_items.topic->>'id' into v_removed_concept
      from public.skillloop_publications prior,
        lateral jsonb_array_elements(prior.payload->'topics') as old_items(topic)
      where prior.graph_id = p_graph and prior.version = v_current
        and not exists (
          select 1 from jsonb_array_elements(v_payload->'topics') as new_items(topic)
          where new_items.topic->>'id' = old_items.topic->>'id'
        ) limit 1;
    if v_removed_concept is not null then
      raise sqlstate 'PT409' using message = 'Published concept IDs cannot be removed';
    end if;
  end if;
  select payload into v_existing from public.skillloop_publications
    where graph_id = p_graph and version = v_version;
  if v_existing is not null and v_existing is distinct from v_payload then
    raise sqlstate 'PT409' using message = 'Publication version already used';
  end if;
  if v_existing is not null and v_current is distinct from v_version then
    raise sqlstate 'PT409' using message = 'Cannot roll back by republishing an old version';
  end if;
  insert into public.skillloop_publications(graph_id, version, payload, published_by)
    values (p_graph, v_version, v_payload, auth.uid())
    on conflict (graph_id, version) do nothing;
  update public.skillloop_graphs set current_version = v_version,
    title = v_payload->'publication'->>'title' where id = p_graph;
  return v_version;
end;
$$;
revoke all on function public.skillloop_publish_draft(text, uuid) from public;
grant execute on function public.skillloop_publish_draft(text, uuid) to authenticated;

create function public.skillloop_reference_node(p_graph text, p_concept text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_version text;
  v_topic jsonb;
  v_rows integer;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  select current_version into v_version from public.skillloop_graphs where id = p_graph;
  if v_version is null then raise sqlstate 'PT404' using message = 'Published graph not found'; end if;
  select items.topic into v_topic from public.skillloop_publications p,
    lateral jsonb_array_elements(p.payload->'topics') as items(topic)
    where p.graph_id = p_graph and p.version = v_version and items.topic->>'id' = p_concept limit 1;
  if v_topic is null then raise sqlstate 'PT400' using message = 'Unknown concept'; end if;
  insert into public.skillloop_references(user_id, graph_id, concept_id, source_version, title_snapshot, description_snapshot)
    values (auth.uid(), p_graph, p_concept, v_version, v_topic->>'title', v_topic->>'description')
    on conflict (user_id, graph_id, concept_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.skillloop_reference_node(text, text) from public;
grant execute on function public.skillloop_reference_node(text, text) to authenticated;

create function public.skillloop_update_note(p_graph text, p_concept text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  if char_length(p_note) > 1000 then raise sqlstate 'PT400' using message = 'Note too long'; end if;
  update public.skillloop_references set note = p_note
    where user_id = auth.uid() and graph_id = p_graph and concept_id = p_concept;
  if not found then raise sqlstate 'PT404' using message = 'Reference not found'; end if;
end;
$$;
revoke all on function public.skillloop_update_note(text, text, text) from public;
grant execute on function public.skillloop_update_note(text, text, text) to authenticated;

create function public.skillloop_remove_reference(p_graph text, p_concept text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  delete from public.skillloop_references
    where user_id = auth.uid() and graph_id = p_graph and concept_id = p_concept;
end;
$$;
revoke all on function public.skillloop_remove_reference(text, text) from public;
grant execute on function public.skillloop_remove_reference(text, text) to authenticated;
