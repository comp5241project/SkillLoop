-- Additive V2 migration: personal graph nodes, links and positions.
alter table public.skillloop_references add column if not exists position_x integer not null default 80;
alter table public.skillloop_references add column if not exists position_y integer not null default 80;

create function public.skillloop_reference_node_version(p_graph text, p_concept text, p_version text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_topic jsonb; v_rows integer;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  if not exists (select 1 from public.skillloop_graphs where id = p_graph and current_version is not null)
    then raise sqlstate 'PT404' using message = 'Published graph not found'; end if;
  select items.topic into v_topic from public.skillloop_publications p,
    lateral jsonb_array_elements(p.payload->'topics') as items(topic)
    where p.graph_id = p_graph and p.version = p_version and items.topic->>'id' = p_concept limit 1;
  if v_topic is null then raise sqlstate 'PT404' using message = 'Published concept version not found'; end if;
  insert into public.skillloop_references(user_id,graph_id,concept_id,source_version,
    title_snapshot,description_snapshot)
    values (auth.uid(),p_graph,p_concept,p_version,v_topic->>'title',v_topic->>'description')
    on conflict (user_id,graph_id,concept_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.skillloop_reference_node_version(text,text,text) from public, anon;
grant execute on function public.skillloop_reference_node_version(text,text,text) to authenticated;

create table public.skillloop_personal_nodes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (char_length(title) between 1 and 100),
  body text not null default '' check (char_length(body) <= 1000),
  position_x integer not null default 80,
  position_y integer not null default 80,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.skillloop_personal_nodes enable row level security;
create policy "personal nodes belong to their owner" on public.skillloop_personal_nodes
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.skillloop_personal_nodes to authenticated;

create table public.skillloop_personal_edges (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  source_key text not null,
  target_key text not null,
  reason text not null check (char_length(reason) between 1 and 280),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, source_key, target_key),
  check (source_key <> target_key)
);
alter table public.skillloop_personal_edges enable row level security;
create policy "read own personal links" on public.skillloop_personal_edges
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.skillloop_personal_edges to authenticated;

create function public.skillloop_has_personal_key(p_key text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_key ~ '^note:[0-9a-f-]{36}$' then
    return exists (select 1 from public.skillloop_personal_nodes
      where user_id = auth.uid() and id = substring(p_key from 6)::uuid);
  end if;
  return exists (select 1 from public.skillloop_references
    where user_id = auth.uid() and graph_id = split_part(p_key, ':', 1)
      and concept_id = split_part(p_key, ':', 2)
      and p_key = graph_id || ':' || concept_id);
end;
$$;
revoke all on function public.skillloop_has_personal_key(text) from public, anon;
grant execute on function public.skillloop_has_personal_key(text) to authenticated;

create function public.skillloop_add_personal_edge(p_id uuid, p_source text, p_target text, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  if p_source = p_target or char_length(p_reason) not between 1 and 280
    or not public.skillloop_has_personal_key(p_source) or not public.skillloop_has_personal_key(p_target)
    then raise sqlstate 'PT400' using message = 'Invalid personal connection'; end if;
  insert into public.skillloop_personal_edges(user_id,id,source_key,target_key,reason)
    values (auth.uid(),p_id,p_source,p_target,p_reason)
    on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.skillloop_add_personal_edge(uuid,text,text,text) from public, anon;
grant execute on function public.skillloop_add_personal_edge(uuid,text,text,text) to authenticated;

create function public.skillloop_move_personal_node(p_key text, p_x integer, p_y integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  if abs(p_x) > 100000 or abs(p_y) > 100000 then raise sqlstate 'PT400' using message = 'Invalid node position'; end if;
  if p_key ~ '^note:[0-9a-f-]{36}$' then
    update public.skillloop_personal_nodes set position_x = p_x, position_y = p_y
      where user_id = auth.uid() and id = substring(p_key from 6)::uuid;
  else
    update public.skillloop_references set position_x = p_x, position_y = p_y
      where user_id = auth.uid() and graph_id = split_part(p_key, ':', 1)
        and concept_id = split_part(p_key, ':', 2) and p_key = graph_id || ':' || concept_id;
  end if;
  if not found then raise sqlstate 'PT404' using message = 'Personal node not found'; end if;
end;
$$;
revoke all on function public.skillloop_move_personal_node(text,integer,integer) from public, anon;
grant execute on function public.skillloop_move_personal_node(text,integer,integer) to authenticated;

create function public.skillloop_remove_personal_edge(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  delete from public.skillloop_personal_edges where user_id = auth.uid() and id = p_id;
end;
$$;
revoke all on function public.skillloop_remove_personal_edge(uuid) from public, anon;
grant execute on function public.skillloop_remove_personal_edge(uuid) to authenticated;

create function public.skillloop_remove_personal_note(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  delete from public.skillloop_personal_edges where user_id = auth.uid()
    and (source_key = 'note:' || p_id or target_key = 'note:' || p_id);
  delete from public.skillloop_personal_nodes where user_id = auth.uid() and id = p_id;
end;
$$;
revoke all on function public.skillloop_remove_personal_note(uuid) from public, anon;
grant execute on function public.skillloop_remove_personal_note(uuid) to authenticated;

create or replace function public.skillloop_remove_reference(p_graph text, p_concept text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  delete from public.skillloop_personal_edges where user_id = auth.uid()
    and (source_key = p_graph || ':' || p_concept or target_key = p_graph || ':' || p_concept);
  delete from public.skillloop_references where user_id = auth.uid()
    and graph_id = p_graph and concept_id = p_concept;
end;
$$;
revoke all on function public.skillloop_remove_reference(text,text) from anon;

-- A single transaction imports only explicitly submitted browser records.
create function public.skillloop_import_personal(p_nodes jsonb, p_edges jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n jsonb; e jsonb; v_topic jsonb; v_version text; v_count integer := 0; v_notes integer := 0; v_edges integer := 0;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in required'; end if;
  if jsonb_typeof(p_nodes) is distinct from 'array' or jsonb_array_length(p_nodes) > 500
    or jsonb_typeof(p_edges) is distinct from 'array' or jsonb_array_length(p_edges) > 2000
    then raise sqlstate 'PT400' using message = 'Invalid import size'; end if;
  for n in select value from jsonb_array_elements(p_nodes) loop
    if n->>'kind' = 'reference' then
      if (n->>'graphId') !~ '^[a-z][a-z0-9-]{0,63}$' or (n->>'conceptId') !~ '^[a-z][a-z0-9-]{0,63}$'
        then raise sqlstate 'PT400' using message = 'Invalid reference ID'; end if;
      select current_version into v_version from public.skillloop_graphs where id = n->>'graphId';
      if v_version is null then raise sqlstate 'PT400' using message = 'Reference source is not published'; end if;
      select items.topic into v_topic from public.skillloop_publications p,
        lateral jsonb_array_elements(p.payload->'topics') as items(topic)
        where p.graph_id = n->>'graphId' and p.version = coalesce(nullif(n->>'sourceVersion','unknown'),v_version)
          and items.topic->>'id' = n->>'conceptId' limit 1;
      if v_topic is null then raise sqlstate 'PT400' using message = 'Reference source version is unavailable'; end if;
      insert into public.skillloop_references(user_id,graph_id,concept_id,source_version,
        title_snapshot,description_snapshot,note,position_x,position_y)
        values (auth.uid(),n->>'graphId',n->>'conceptId',coalesce(nullif(n->>'sourceVersion','unknown'),v_version),
          v_topic->>'title',v_topic->>'description',left(coalesce(n->>'note',''),1000),
          coalesce((n->>'x')::integer,80),coalesce((n->>'y')::integer,80))
        on conflict (user_id,graph_id,concept_id) do nothing;
      v_count := v_count + 1;
    elsif n->>'kind' = 'note' then
      insert into public.skillloop_personal_nodes(user_id,id,title,body,position_x,position_y)
        values (auth.uid(),substring(n->>'id' from 6)::uuid,n->>'title',left(coalesce(n->>'body',''),1000),
          coalesce((n->>'x')::integer,80),coalesce((n->>'y')::integer,80))
        on conflict (user_id,id) do nothing;
      v_notes := v_notes + 1;
    else raise sqlstate 'PT400' using message = 'Invalid personal node'; end if;
  end loop;
  for e in select value from jsonb_array_elements(p_edges) loop
    perform public.skillloop_add_personal_edge((e->>'id')::uuid,e->>'source',e->>'target',e->>'reason');
    v_edges := v_edges + 1;
  end loop;
  return jsonb_build_object('references',v_count,'notes',v_notes,'edges',v_edges);
end;
$$;
revoke all on function public.skillloop_import_personal(jsonb,jsonb) from public, anon;
grant execute on function public.skillloop_import_personal(jsonb,jsonb) to authenticated;
