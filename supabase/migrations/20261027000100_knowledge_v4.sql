-- Knowledge v0.4 runs beside the historical graph publication model.
-- The older tables and RPCs remain available for existing links and references.

create table public.skillloop_v4_units (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  title text not null,
  publisher_name text not null default 'Teacher',
  content_type text,
  topics text[] not null default '{}',
  current_version integer,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.skillloop_v4_unit_drafts (
  unit_id uuid primary key references public.skillloop_v4_units(id),
  owner_id uuid not null references auth.users(id),
  revision uuid not null,
  plan_revision integer not null default 1,
  confirmed_plan_revision integer,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.skillloop_v4_graphs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  unit_id uuid references public.skillloop_v4_units(id),
  direction_id text,
  current_version integer,
  created_at timestamptz not null default now(),
  check ((unit_id is null and direction_id is null) or (unit_id is not null and direction_id is not null)),
  unique (unit_id, direction_id)
);

create table public.skillloop_v4_graph_drafts (
  graph_id uuid primary key references public.skillloop_v4_graphs(id),
  owner_id uuid not null references auth.users(id),
  revision uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.skillloop_v4_graph_versions (
  graph_id uuid not null references public.skillloop_v4_graphs(id),
  version integer not null check (version > 0),
  payload jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  withdrawn_reason text,
  primary key (graph_id, version)
);

create table public.skillloop_v4_unit_versions (
  unit_id uuid not null references public.skillloop_v4_units(id),
  version integer not null check (version > 0),
  payload jsonb not null,
  graph_refs jsonb not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  withdrawn_reason text,
  primary key (unit_id, version)
);

create table public.skillloop_v4_unit_tombstones (
  unit_id uuid not null references public.skillloop_v4_units(id),
  version integer not null,
  title text not null,
  reason text not null,
  withdrawn_at timestamptz not null default now(),
  primary key (unit_id, version)
);

create table public.skillloop_v4_graph_tombstones (
  graph_id uuid not null references public.skillloop_v4_graphs(id),
  version integer not null,
  title text not null,
  reason text not null,
  withdrawn_at timestamptz not null default now(),
  primary key (graph_id, version)
);

create table public.skillloop_v4_sources (
  id uuid primary key,
  unit_id uuid not null references public.skillloop_v4_units(id),
  owner_id uuid not null references auth.users(id),
  metadata jsonb not null,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

create table public.skillloop_v4_jobs (
  id uuid primary key,
  unit_id uuid not null references public.skillloop_v4_units(id),
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('capture', 'plan', 'generate', 'regenerate')),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  idempotency_key text not null,
  input jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table public.skillloop_v4_proposals (
  id uuid primary key,
  unit_id uuid not null references public.skillloop_v4_units(id),
  owner_id uuid not null references auth.users(id),
  job_id uuid not null references public.skillloop_v4_jobs(id),
  kind text not null check (kind in ('plan', 'generate', 'regenerate')),
  unit_revision uuid not null,
  plan_revision integer,
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  source_refs jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  accepted_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id)
);

create table public.skillloop_v4_discover_placements (
  unit_id uuid not null,
  version integer not null,
  placed_by uuid not null references auth.users(id),
  placed_at timestamptz not null default now(),
  primary key (unit_id, version),
  foreign key (unit_id, version) references public.skillloop_v4_unit_versions(unit_id, version)
);

create index skillloop_v4_units_owner_idx on public.skillloop_v4_units(owner_id, created_at desc);
create index skillloop_v4_units_topics_idx on public.skillloop_v4_units using gin (topics);
create index skillloop_v4_unit_versions_recent_idx on public.skillloop_v4_unit_versions(published_at desc, unit_id);
create index skillloop_v4_unit_versions_graph_refs_idx on public.skillloop_v4_unit_versions using gin (graph_refs jsonb_path_ops);
create index skillloop_v4_graphs_owner_idx on public.skillloop_v4_graphs(owner_id, created_at desc);
create index skillloop_v4_sources_unit_idx on public.skillloop_v4_sources(unit_id);
create index skillloop_v4_jobs_unit_idx on public.skillloop_v4_jobs(unit_id, created_at desc);
create index skillloop_v4_proposals_unit_idx on public.skillloop_v4_proposals(unit_id, created_at desc);
create unique index skillloop_v4_one_pending_generation_idx
  on public.skillloop_v4_proposals(unit_id, unit_revision)
  where kind = 'generate' and accepted_at is null and dismissed_at is null;

alter table public.skillloop_v4_units enable row level security;
alter table public.skillloop_v4_unit_drafts enable row level security;
alter table public.skillloop_v4_graphs enable row level security;
alter table public.skillloop_v4_graph_drafts enable row level security;
alter table public.skillloop_v4_graph_versions enable row level security;
alter table public.skillloop_v4_unit_versions enable row level security;
alter table public.skillloop_v4_unit_tombstones enable row level security;
alter table public.skillloop_v4_graph_tombstones enable row level security;
alter table public.skillloop_v4_sources enable row level security;
alter table public.skillloop_v4_jobs enable row level security;
alter table public.skillloop_v4_proposals enable row level security;
alter table public.skillloop_v4_discover_placements enable row level security;

create policy "owner or published unit metadata" on public.skillloop_v4_units
  for select to anon, authenticated using (owner_id = (select auth.uid()) or
    (current_version is not null and withdrawn_at is null));
create policy "own unit drafts" on public.skillloop_v4_unit_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner or published graph metadata" on public.skillloop_v4_graphs
  for select to anon, authenticated using (owner_id = (select auth.uid()) or
    current_version is not null);
create policy "own graph drafts" on public.skillloop_v4_graph_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "published graph versions" on public.skillloop_v4_graph_versions
  for select to anon, authenticated using (
    exists (select 1 from public.skillloop_v4_graphs own_graph
      where own_graph.id = graph_id and own_graph.owner_id = (select auth.uid()))
    or (withdrawn_reason is null and exists (
      select 1 from public.skillloop_v4_graphs public_graph
      where public_graph.id = graph_id and public_graph.current_version is not null)));
create policy "published unit versions" on public.skillloop_v4_unit_versions
  for select to anon, authenticated using (
    withdrawn_reason is null and exists (select 1 from public.skillloop_v4_units u where u.id = unit_id and
      u.current_version is not null and u.withdrawn_at is null));
create policy "public withdrawal notices" on public.skillloop_v4_unit_tombstones
  for select to anon, authenticated using (true);
create policy "public graph withdrawal notices" on public.skillloop_v4_graph_tombstones
  for select to anon, authenticated using (true);
create policy "own source records" on public.skillloop_v4_sources
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "own jobs" on public.skillloop_v4_jobs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "own proposals" on public.skillloop_v4_proposals
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "public curated placements" on public.skillloop_v4_discover_placements
  for select to anon, authenticated using (true);

-- Older Supabase projects may still auto-grant broad public-table privileges.
-- Reset them before granting only the v0.4 Data API capabilities below.
revoke all on public.skillloop_v4_units, public.skillloop_v4_unit_drafts,
  public.skillloop_v4_graphs, public.skillloop_v4_graph_drafts,
  public.skillloop_v4_graph_versions, public.skillloop_v4_unit_versions,
  public.skillloop_v4_unit_tombstones, public.skillloop_v4_graph_tombstones,
  public.skillloop_v4_sources,
  public.skillloop_v4_jobs, public.skillloop_v4_proposals,
  public.skillloop_v4_discover_placements from public, anon, authenticated, service_role;

grant select on public.skillloop_v4_units, public.skillloop_v4_graphs,
  public.skillloop_v4_graph_versions, public.skillloop_v4_unit_versions,
  public.skillloop_v4_discover_placements,
  public.skillloop_v4_unit_tombstones, public.skillloop_v4_graph_tombstones to anon, authenticated;
grant select on public.skillloop_v4_unit_drafts, public.skillloop_v4_graph_drafts,
  public.skillloop_v4_sources, public.skillloop_v4_jobs, public.skillloop_v4_proposals to authenticated;
grant select, insert, update on public.skillloop_v4_sources, public.skillloop_v4_jobs,
  public.skillloop_v4_proposals to service_role;
grant select on public.skillloop_v4_unit_drafts, public.skillloop_v4_graph_drafts to service_role;

create function public.skillloop_v4_create_unit(p_unit uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_revision uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  if p_payload->>'id' is distinct from p_unit::text or p_payload->>'schemaVersion' <> '0.4'
    or jsonb_typeof(p_payload->'directions') is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'Invalid Unit payload';
  end if;
  insert into public.skillloop_v4_units(id, owner_id, title)
    values (p_unit, auth.uid(), coalesce(nullif(p_payload->>'title', ''), 'Untitled Unit'));
  insert into public.skillloop_v4_unit_drafts(unit_id, owner_id, revision, payload)
    values (p_unit, auth.uid(), v_revision, p_payload);
  return v_revision;
end;
$$;

create function public.skillloop_v4_save_unit(p_unit uuid, p_expected uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_draft public.skillloop_v4_unit_drafts%rowtype;
  v_revision uuid := gen_random_uuid();
  v_plan_changed boolean;
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  select * into v_draft from public.skillloop_v4_unit_drafts where unit_id = p_unit for update;
  if not found or v_draft.owner_id <> auth.uid() then
    raise sqlstate 'PT403' using message = 'Unit belongs to another teacher';
  end if;
  if v_draft.revision is distinct from p_expected then
    raise sqlstate 'PT409' using message = 'Unit draft changed; reload before saving';
  end if;
  if p_payload->>'id' is distinct from p_unit::text or p_payload->>'schemaVersion' <> '0.4'
    or jsonb_typeof(p_payload->'directions') is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'Invalid Unit payload';
  end if;
  v_plan_changed := v_draft.payload->'directions' is distinct from p_payload->'directions';
  update public.skillloop_v4_unit_drafts set revision = v_revision, payload = p_payload,
    plan_revision = plan_revision + case when v_plan_changed then 1 else 0 end,
    confirmed_plan_revision = case when v_plan_changed then null else confirmed_plan_revision end,
    updated_at = now() where unit_id = p_unit;
  return v_revision;
end;
$$;

create function public.skillloop_v4_confirm_plan(p_unit uuid, p_expected uuid, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_draft public.skillloop_v4_unit_drafts%rowtype;
  v_revision uuid := gen_random_uuid();
  v_direction jsonb;
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  select * into v_draft from public.skillloop_v4_unit_drafts where unit_id = p_unit for update;
  if not found or v_draft.owner_id <> auth.uid() then
    raise sqlstate 'PT403' using message = 'Unit belongs to another teacher';
  end if;
  if v_draft.revision is distinct from p_expected then
    raise sqlstate 'PT409' using message = 'Unit draft changed; reload before confirming';
  end if;
  if jsonb_typeof(v_draft.payload->'directions') is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'Direction Planning is invalid';
  end if;
  if jsonb_array_length(v_draft.payload->'directions') = 0 then
    raise sqlstate 'PT400' using message = 'Add a Direction before confirming';
  end if;
  if coalesce(p_fingerprint, '') !~ '^[0-9a-f]{64}$' then
    raise sqlstate 'PT400' using message = 'Invalid Direction Planning fingerprint';
  end if;
  for v_direction in select value from jsonb_array_elements(v_draft.payload->'directions') loop
    if length(trim(coalesce(v_direction->>'id', ''))) = 0
      or length(trim(coalesce(v_direction->>'graphId', ''))) = 0
      or length(trim(coalesce(v_direction->>'title', ''))) = 0
      or length(trim(coalesce(v_direction->>'question', ''))) = 0
      or length(trim(coalesce(v_direction->>'scope', ''))) = 0 then
      raise sqlstate 'PT400' using message = 'Direction Planning is incomplete';
    end if;
  end loop;
  update public.skillloop_v4_unit_drafts set confirmed_plan_revision = plan_revision,
    payload = jsonb_set(payload, '{confirmedPlanFingerprint}', to_jsonb(p_fingerprint), true),
    revision = v_revision,
    updated_at = now() where unit_id = p_unit;
  return jsonb_build_object('revision', v_revision, 'planRevision', v_draft.plan_revision);
end;
$$;

create function public.skillloop_v4_save_graph(p_graph uuid, p_unit uuid, p_direction text,
  p_expected uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_graph public.skillloop_v4_graphs%rowtype;
  v_draft public.skillloop_v4_graph_drafts%rowtype;
  v_revision uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  if p_payload->>'id' is distinct from p_graph::text or p_payload->>'schemaVersion' <> '0.4'
    or jsonb_typeof(p_payload->'nodes') is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'Invalid Graph payload';
  end if;
  select * into v_graph from public.skillloop_v4_graphs where id = p_graph for update;
  if not found then
    if p_expected is not null then raise sqlstate 'PT409' using message = 'Graph draft missing'; end if;
    if p_unit is not null and not exists (
      select 1 from public.skillloop_v4_unit_drafts d where d.unit_id = p_unit and d.owner_id = auth.uid()
        and exists (select 1 from jsonb_array_elements(d.payload->'directions') x
          where x->>'id' = p_direction and x->>'graphId' = p_graph::text)) then
      raise sqlstate 'PT403' using message = 'Direction does not belong to this Unit';
    end if;
    insert into public.skillloop_v4_graphs(id, owner_id, unit_id, direction_id)
      values (p_graph, auth.uid(), p_unit, p_direction);
  elsif v_graph.owner_id <> auth.uid() or v_graph.unit_id is distinct from p_unit
    or v_graph.direction_id is distinct from p_direction then
    raise sqlstate 'PT403' using message = 'Graph ownership or identity mismatch';
  end if;
  select * into v_draft from public.skillloop_v4_graph_drafts where graph_id = p_graph for update;
  if v_draft.revision is distinct from p_expected then
    raise sqlstate 'PT409' using message = 'Graph draft changed; reload before saving';
  end if;
  insert into public.skillloop_v4_graph_drafts(graph_id, owner_id, revision, payload)
    values (p_graph, auth.uid(), v_revision, p_payload)
    on conflict (graph_id) do update set revision = excluded.revision,
      payload = excluded.payload, updated_at = now();
  return v_revision;
end;
$$;

create function public.skillloop_v4_assert_evidence(p_refs jsonb, p_sources jsonb, p_unit uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_ref jsonb; v_source jsonb;
begin
  if jsonb_typeof(p_refs) is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'Evidence references must be a list';
  end if;
  for v_ref in select value from jsonb_array_elements(p_refs) loop
    if coalesce(v_ref->>'sourceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise sqlstate 'PT400' using message = 'Evidence source ID is invalid';
    end if;
    select value into v_source from jsonb_array_elements(p_sources) s
      where s->>'id' = v_ref->>'sourceId' limit 1;
    if coalesce(trim(v_ref->>'location'), '') = '' or v_source is null then
      raise sqlstate 'PT400' using message = 'Evidence reference is missing or points to an unknown source';
    end if;
    if v_source->>'origin' = 'captured' and (
      length(trim(v_ref->>'location')) < 4 or not exists (
        select 1 from public.skillloop_v4_sources captured
          where captured.id = (v_ref->>'sourceId')::uuid and captured.unit_id = p_unit
            and captured.metadata->>'snapshotId' = v_source->>'snapshotId'
            and position(lower(trim(v_ref->>'location')) in lower(captured.snapshot->>'content')) > 0)) then
      raise sqlstate 'PT400' using message = 'Evidence location is absent from the captured source';
    end if;
    v_source := null;
  end loop;
end;
$$;

-- p_graph_refs is an array of {directionId, graphId, version? OR draftRevision?}.
-- Existing graph versions are reused. Graph drafts are published only when requested.
create function public.skillloop_v4_publish_unit(p_unit uuid, p_expected uuid, p_graph_refs jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_draft public.skillloop_v4_unit_drafts%rowtype;
  v_ref jsonb;
  v_graph public.skillloop_v4_graphs%rowtype;
  v_graph_draft public.skillloop_v4_graph_drafts%rowtype;
  v_graph_version integer;
  v_unit_version integer;
  v_refs jsonb := '[]'::jsonb;
  v_direction jsonb;
  v_item jsonb;
  v_node jsonb;
  v_source jsonb;
  v_public_directions jsonb;
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  select * into v_draft from public.skillloop_v4_unit_drafts where unit_id = p_unit for update;
  if not found or v_draft.owner_id <> auth.uid() then
    raise sqlstate 'PT403' using message = 'Unit belongs to another teacher';
  end if;
  if v_draft.revision is distinct from p_expected then
    raise sqlstate 'PT409' using message = 'Unit draft changed; reload before publishing';
  end if;
  if v_draft.confirmed_plan_revision is distinct from v_draft.plan_revision then
    raise sqlstate 'PT400' using message = 'Confirm Direction Planning first';
  end if;
  if v_draft.payload->>'id' is distinct from p_unit::text
    or v_draft.payload->>'schemaVersion' is distinct from '0.4'
    or coalesce(v_draft.payload->>'type', '') not in ('open-source', 'case-study', 'build-something', 'knowledge-collection')
    or jsonb_typeof(v_draft.payload->'topics') is distinct from 'array'
    or jsonb_typeof(v_draft.payload->'activities') is distinct from 'array'
    or length(trim(coalesce(v_draft.payload->>'title', ''))) = 0
    or length(trim(coalesce(v_draft.payload->>'summary', ''))) = 0
    or length(trim(coalesce(v_draft.payload->>'guidingQuestion', ''))) = 0
    or jsonb_typeof(v_draft.payload->'sources') is distinct from 'array'
    or jsonb_typeof(v_draft.payload->'sections') is distinct from 'array'
    or jsonb_array_length(v_draft.payload->'sections') = 0
    or jsonb_typeof(v_draft.payload->'directions') is distinct from 'array'
    or jsonb_array_length(v_draft.payload->'directions') = 0
    or jsonb_array_length(v_draft.payload->'directions') > 20 then
    raise sqlstate 'PT400' using message = 'Published Unit content is incomplete';
  end if;
  if (select count(*) from jsonb_array_elements(v_draft.payload->'directions')) is distinct from
    (select count(distinct value->>'id') from jsonb_array_elements(v_draft.payload->'directions'))
    or (select count(*) from jsonb_array_elements(v_draft.payload->'directions')) is distinct from
    (select count(distinct value->>'graphId') from jsonb_array_elements(v_draft.payload->'directions'))
    or (select count(*) from jsonb_array_elements(v_draft.payload->'sections')) is distinct from
    (select count(distinct value->>'id') from jsonb_array_elements(v_draft.payload->'sections'))
    or (select count(*) from jsonb_array_elements(v_draft.payload->'activities')) is distinct from
    (select count(distinct value->>'id') from jsonb_array_elements(v_draft.payload->'activities')) then
    raise sqlstate 'PT400' using message = 'Published content IDs must be unique';
  end if;
  for v_direction in select value from jsonb_array_elements(v_draft.payload->'directions') loop
    if length(trim(coalesce(v_direction->>'id', ''))) = 0
      or length(trim(coalesce(v_direction->>'graphId', ''))) = 0
      or length(trim(coalesce(v_direction->>'title', ''))) = 0
      or length(trim(coalesce(v_direction->>'question', ''))) = 0
      or length(trim(coalesce(v_direction->>'scope', ''))) = 0 then
      raise sqlstate 'PT400' using message = 'Published Direction is incomplete';
    end if;
  end loop;
  for v_source in select value from jsonb_array_elements(v_draft.payload->'sources') loop
    if length(trim(coalesce(v_source->>'title', ''))) = 0
      or coalesce(v_source->>'url', '') !~* '^https://[^[:space:]]+$' then
      raise sqlstate 'PT400' using message = 'Source title or HTTPS URL is invalid';
    end if;
    if v_source->>'origin' = 'captured' and not exists (
      select 1 from public.skillloop_v4_sources s where s.id = (v_source->>'id')::uuid
        and s.unit_id = p_unit and s.owner_id = auth.uid()
        and s.metadata->>'snapshotId' = v_source->>'snapshotId'
        and s.metadata->>'url' = v_source->>'url'
        and s.metadata->>'revision' is not distinct from v_source->>'revision'
        and s.metadata->>'scope' = v_source->>'scope'
        and s.metadata->>'contentSha256' = v_source->>'contentSha256'
        and s.snapshot->>'contentSha256' = v_source->>'contentSha256'
        and s.snapshot->>'content' is not null) then
      raise sqlstate 'PT400' using message = 'Captured source lacks a verified snapshot';
    elsif v_source->>'origin' = 'manual' and length(coalesce(v_source->>'reviewedAt', '')) = 0 then
      raise sqlstate 'PT400' using message = 'Manual source lacks teacher review time';
    elsif v_source->>'origin' is null or v_source->>'origin' not in ('manual', 'captured') then
      raise sqlstate 'PT400' using message = 'Invalid source origin';
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_draft.payload->'sections') loop
    if length(trim(coalesce(v_item->>'id', ''))) = 0
      or coalesce(v_item->>'kind', '') not in ('overview', 'artifact', 'how-it-works', 'evidence', 'activity')
      or coalesce(v_item->>'claimKind', '') not in ('general', 'code', 'file', 'research', 'event', 'external')
      or length(trim(coalesce(v_item->>'title', ''))) = 0
      or length(trim(coalesce(v_item->>'body', ''))) = 0 then
      raise sqlstate 'PT400' using message = 'Published section is incomplete';
    end if;
    perform public.skillloop_v4_assert_evidence(v_item->'evidenceRefs', v_draft.payload->'sources', p_unit);
    if v_item->>'claimKind' in ('code', 'file', 'research', 'event', 'external')
      and jsonb_array_length(v_item->'evidenceRefs') = 0 then
      raise sqlstate 'PT400' using message = 'Specific section claim lacks evidence';
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_draft.payload->'activities') loop
    if length(trim(coalesce(v_item->>'id', ''))) = 0
      or length(trim(coalesce(v_item->>'prompt', ''))) = 0 then
      raise sqlstate 'PT400' using message = 'Published learning activity is incomplete';
    end if;
    perform public.skillloop_v4_assert_evidence(v_item->'evidenceRefs', v_draft.payload->'sources', p_unit);
  end loop;
  if jsonb_typeof(p_graph_refs) is distinct from 'array' or jsonb_array_length(p_graph_refs) = 0
    or jsonb_array_length(p_graph_refs) > 20 then
    raise sqlstate 'PT400' using message = 'Published Unit needs valid Direction Graph references';
  end if;
  if jsonb_array_length(p_graph_refs) > jsonb_array_length(v_draft.payload->'directions') then
    raise sqlstate 'PT400' using message = 'Too many Direction Graph references';
  end if;
  for v_ref in select value from jsonb_array_elements(p_graph_refs) loop
    if (v_ref ? 'draftRevision') = (v_ref ? 'version') then
      raise sqlstate 'PT400' using message = 'Choose one Graph Version source';
    end if;
    select value into v_direction from jsonb_array_elements(v_draft.payload->'directions')
      where value->>'id' = v_ref->>'directionId' and value->>'graphId' = v_ref->>'graphId' limit 1;
    if v_direction is null then
      raise sqlstate 'PT400' using message = 'Graph does not match a confirmed Direction';
    end if;
    if exists (select 1 from jsonb_array_elements(v_refs) x where x->>'directionId' = v_ref->>'directionId') then
      raise sqlstate 'PT400' using message = 'Direction Graph reference repeated';
    end if;
    select * into v_graph from public.skillloop_v4_graphs
      where id = (v_ref->>'graphId')::uuid for update;
    if not found or v_graph.owner_id <> auth.uid() or v_graph.unit_id is distinct from p_unit
      or v_graph.direction_id is distinct from v_ref->>'directionId' then
      raise sqlstate 'PT403' using message = 'Direction Graph ownership mismatch';
    end if;
    if v_ref ? 'draftRevision' then
      select * into v_graph_draft from public.skillloop_v4_graph_drafts
        where graph_id = v_graph.id for update;
      if not found or v_graph_draft.revision::text is distinct from v_ref->>'draftRevision' then
        raise sqlstate 'PT409' using message = 'Graph draft changed; reload before publishing';
      end if;
      if v_graph_draft.payload->>'id' is distinct from v_graph.id::text
        or v_graph_draft.payload->>'directionId' is distinct from v_graph.direction_id
        or v_graph_draft.payload->>'schemaVersion' is distinct from '0.4'
        or length(trim(coalesce(v_graph_draft.payload->>'title', ''))) = 0
        or jsonb_typeof(v_graph_draft.payload->'nodes') is distinct from 'array'
        or jsonb_array_length(v_graph_draft.payload->'nodes') = 0
        or jsonb_typeof(v_graph_draft.payload->'edges') is distinct from 'array' then
        raise sqlstate 'PT400' using message = 'Direction Graph content is incomplete';
      end if;
      if (select count(*) from jsonb_array_elements(v_graph_draft.payload->'nodes')) is distinct from
        (select count(distinct value->>'id') from jsonb_array_elements(v_graph_draft.payload->'nodes'))
        or (select count(*) from jsonb_array_elements(v_graph_draft.payload->'edges')) is distinct from
        (select count(distinct value->>'id') from jsonb_array_elements(v_graph_draft.payload->'edges')) then
        raise sqlstate 'PT400' using message = 'Graph content IDs must be unique';
      end if;
      for v_node in select value from jsonb_array_elements(v_graph_draft.payload->'nodes') loop
        if length(trim(coalesce(v_node->>'id', ''))) = 0
          or coalesce(v_node->>'claimKind', '') not in ('general', 'code', 'file', 'research', 'event', 'external')
          or length(trim(coalesce(v_node->>'title', ''))) = 0
          or length(trim(coalesce(v_node->>'description', ''))) = 0 then
          raise sqlstate 'PT400' using message = 'Concept is incomplete';
        end if;
        perform public.skillloop_v4_assert_evidence(v_node->'evidenceRefs', v_draft.payload->'sources', p_unit);
        if v_node->>'claimKind' in ('code', 'file', 'research', 'event', 'external')
          and jsonb_array_length(v_node->'evidenceRefs') = 0 then
          raise sqlstate 'PT400' using message = 'Specific concept claim lacks evidence';
        end if;
      end loop;
      for v_item in select value from jsonb_array_elements(v_graph_draft.payload->'edges') loop
        if length(trim(coalesce(v_item->>'id', ''))) = 0
          or length(trim(coalesce(v_item->>'label', ''))) = 0
          or length(trim(coalesce(v_item->>'reason', ''))) = 0
          or coalesce(v_item->>'basis', '') not in ('source-supported', 'teaching-association')
          or v_item->>'source' = v_item->>'target' or not exists (
          select 1 from jsonb_array_elements(v_graph_draft.payload->'nodes') n
          where n->>'id' = v_item->>'source') or not exists (
          select 1 from jsonb_array_elements(v_graph_draft.payload->'nodes') n
          where n->>'id' = v_item->>'target') then
          raise sqlstate 'PT400' using message = 'Relationship has invalid concepts';
        end if;
        perform public.skillloop_v4_assert_evidence(v_item->'evidenceRefs', v_draft.payload->'sources', p_unit);
        if v_item->>'basis' = 'source-supported'
          and jsonb_array_length(v_item->'evidenceRefs') = 0 then
          raise sqlstate 'PT400' using message = 'Source-supported relationship lacks evidence';
        end if;
      end loop;
      select coalesce(max(version), 0) + 1 into v_graph_version
        from public.skillloop_v4_graph_versions where graph_id = v_graph.id;
      insert into public.skillloop_v4_graph_versions(graph_id, version, payload, sources, published_by)
        values (v_graph.id, v_graph_version, v_graph_draft.payload,
          v_draft.payload->'sources', auth.uid());
      update public.skillloop_v4_graphs set current_version = v_graph_version where id = v_graph.id;
    else
      if v_ref->>'version' !~ '^[1-9][0-9]*$' then
        raise sqlstate 'PT400' using message = 'Invalid Graph Version reference';
      end if;
      v_graph_version := (v_ref->>'version')::integer;
      if not exists (select 1 from public.skillloop_v4_graph_versions gv
        where gv.graph_id = v_graph.id and gv.version = v_graph_version
          and gv.withdrawn_reason is null) then
        raise sqlstate 'PT400' using message = 'Graph Version is unavailable';
      end if;
    end if;
    v_refs := v_refs || jsonb_build_array(jsonb_build_object(
      'directionId', v_ref->>'directionId', 'graphId', v_graph.id, 'version', v_graph_version));
    v_direction := null;
  end loop;
  perform 1 from public.skillloop_v4_units where id = p_unit for update;
  select coalesce(max(version), 0) + 1 into v_unit_version
    from public.skillloop_v4_unit_versions where unit_id = p_unit;
  select jsonb_agg(d.value order by d.ordinality) into v_public_directions
    from jsonb_array_elements(v_draft.payload->'directions') with ordinality as d(value, ordinality)
    where exists (select 1 from jsonb_array_elements(v_refs) r
      where r.value->>'directionId' = d.value->>'id');
  insert into public.skillloop_v4_unit_versions(unit_id, version, payload, graph_refs, published_by)
    values (p_unit, v_unit_version,
      jsonb_set(v_draft.payload, '{directions}', v_public_directions), v_refs, auth.uid());
  update public.skillloop_v4_units set current_version = v_unit_version, withdrawn_at = null,
    title = v_draft.payload->>'title',
    publisher_name = coalesce(nullif(v_draft.payload->>'publisherName', ''), 'Teacher'),
    content_type = v_draft.payload->>'type',
    topics = array(select jsonb_array_elements_text(v_draft.payload->'topics'))
    where id = p_unit;
  return v_unit_version;
end;
$$;

create function public.skillloop_v4_withdraw_unit(p_unit uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 500 then
    raise sqlstate 'PT400' using message = 'Provide a short withdrawal reason';
  end if;
  update public.skillloop_v4_units set withdrawn_at = now()
    where id = p_unit and owner_id = auth.uid() and current_version is not null;
  if not found then raise sqlstate 'PT404' using message = 'Published Unit unavailable'; end if;
  update public.skillloop_v4_unit_versions set withdrawn_reason = p_reason
    where unit_id = p_unit and withdrawn_reason is null;
  insert into public.skillloop_v4_unit_tombstones(unit_id, version, title, reason)
    select v.unit_id, v.version, u.title, p_reason
      from public.skillloop_v4_unit_versions v
      join public.skillloop_v4_units u on u.id = v.unit_id
      where v.unit_id = p_unit
    on conflict (unit_id, version) do nothing;
end;
$$;

create function public.skillloop_v4_withdraw_unit_version(p_unit uuid, p_version integer, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_title text;
  v_current integer;
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 500 then
    raise sqlstate 'PT400' using message = 'Provide a short withdrawal reason';
  end if;
  perform 1 from public.skillloop_v4_units where id = p_unit and owner_id = auth.uid() for update;
  if not found then raise sqlstate 'PT403' using message = 'Unit belongs to another teacher'; end if;
  update public.skillloop_v4_unit_versions set withdrawn_reason = p_reason
    where unit_id = p_unit and version = p_version and withdrawn_reason is null
    returning payload->>'title' into v_title;
  if not found then raise sqlstate 'PT404' using message = 'Published Unit Version unavailable'; end if;
  insert into public.skillloop_v4_unit_tombstones(unit_id, version, title, reason)
    values (p_unit, p_version, v_title, p_reason);
  select max(version) into v_current from public.skillloop_v4_unit_versions
    where unit_id = p_unit and withdrawn_reason is null;
  update public.skillloop_v4_units set current_version = v_current,
    withdrawn_at = case when v_current is null then now() else null end
    where id = p_unit;
end;
$$;

create function public.skillloop_v4_withdraw_graph_version(p_graph uuid, p_version integer, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_graph public.skillloop_v4_graphs%rowtype;
  v_version public.skillloop_v4_graph_versions%rowtype;
  v_unit record;
  v_current integer;
begin
  if auth.uid() is null or not public.skillloop_is_teacher() then
    raise sqlstate 'PT403' using message = 'Teacher access required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 500 then
    raise sqlstate 'PT400' using message = 'Provide a short withdrawal reason';
  end if;
  select * into v_graph from public.skillloop_v4_graphs where id = p_graph for update;
  if not found or v_graph.owner_id <> auth.uid() then
    raise sqlstate 'PT403' using message = 'Graph belongs to another teacher';
  end if;
  select * into v_version from public.skillloop_v4_graph_versions
    where graph_id = p_graph and version = p_version for update;
  if not found or v_version.withdrawn_reason is not null then
    raise sqlstate 'PT404' using message = 'Published Graph Version unavailable';
  end if;
  -- A withdrawn Graph must not leave any public Unit Version pointing to a broken link.
  for v_unit in update public.skillloop_v4_unit_versions
    set withdrawn_reason = 'Referenced Graph Version withdrawn: ' || p_reason
    where withdrawn_reason is null and graph_refs @> jsonb_build_array(jsonb_build_object(
      'graphId', p_graph, 'version', p_version))
    returning unit_id, version, payload loop
    insert into public.skillloop_v4_unit_tombstones(unit_id, version, title, reason)
      values (v_unit.unit_id, v_unit.version, v_unit.payload->>'title',
        'Referenced Graph Version withdrawn: ' || p_reason)
      on conflict (unit_id, version) do nothing;
  end loop;
  update public.skillloop_v4_graph_versions set withdrawn_reason = p_reason
    where graph_id = p_graph and version = p_version;
  insert into public.skillloop_v4_graph_tombstones(graph_id, version, title, reason)
    values (p_graph, p_version, v_version.payload->>'title', p_reason);
  select max(version) into v_current from public.skillloop_v4_graph_versions
    where graph_id = p_graph and withdrawn_reason is null;
  update public.skillloop_v4_graphs set current_version = v_current where id = p_graph;
  update public.skillloop_v4_units u set current_version = active.version,
    withdrawn_at = case when active.version is null then now() else null end
    from (select affected.unit_id,
      (select max(uv.version) from public.skillloop_v4_unit_versions uv
        where uv.unit_id = affected.unit_id and uv.withdrawn_reason is null) as version
      from public.skillloop_v4_unit_versions affected
      where affected.graph_refs @> jsonb_build_array(jsonb_build_object(
        'graphId', p_graph, 'version', p_version)) group by affected.unit_id) active
    where u.id = active.unit_id;
end;
$$;

-- Writes go through owner-checking RPCs or later dedicated job workers.
revoke all on function public.skillloop_v4_create_unit(uuid, jsonb) from public;
revoke all on function public.skillloop_v4_save_unit(uuid, uuid, jsonb) from public;
revoke all on function public.skillloop_v4_confirm_plan(uuid, uuid, text) from public;
revoke all on function public.skillloop_v4_save_graph(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.skillloop_v4_publish_unit(uuid, uuid, jsonb) from public;
revoke all on function public.skillloop_v4_withdraw_unit(uuid, text) from public;
revoke all on function public.skillloop_v4_withdraw_unit_version(uuid, integer, text) from public;
revoke all on function public.skillloop_v4_withdraw_graph_version(uuid, integer, text) from public;
revoke all on function public.skillloop_v4_assert_evidence(jsonb, jsonb, uuid) from public;
grant execute on function public.skillloop_v4_create_unit(uuid, jsonb),
  public.skillloop_v4_save_unit(uuid, uuid, jsonb),
  public.skillloop_v4_confirm_plan(uuid, uuid, text),
  public.skillloop_v4_save_graph(uuid, uuid, text, uuid, jsonb),
  public.skillloop_v4_publish_unit(uuid, uuid, jsonb),
  public.skillloop_v4_withdraw_unit(uuid, text),
  public.skillloop_v4_withdraw_unit_version(uuid, integer, text),
  public.skillloop_v4_withdraw_graph_version(uuid, integer, text) to authenticated;
