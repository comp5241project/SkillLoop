-- Teacher version-history API reads these rows through the server role.
-- The publication RPC continues to own all writes.
grant select on public.skillloop_v4_unit_versions to service_role;
