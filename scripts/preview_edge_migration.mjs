// Inspect or apply the additive personal-edge reason migration to a confirmed
// non-production Supabase project. Never prints the scoped management token.
import { readFile } from 'node:fs/promises';

process.loadEnvFile('.env.local');
const target = new URL(process.env.SUPABASE_URL || '');
if (target.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(target.hostname)) {
  throw new Error('SUPABASE_URL must be a Supabase project URL.');
}
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is missing.');
const base = `https://api.supabase.com/v1/projects/${target.hostname.split('.')[0]}/database`;
const headers = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` };

async function management(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { ...headers, ...options.headers } });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = value?.message || value?.error || `HTTP ${response.status}`;
    throw new Error(`Supabase management ${path} failed: ${detail}`);
  }
  return value;
}

const query = `select exists (select 1 from pg_policies
  where schemaname = 'public' and tablename = 'skillloop_personal_edges'
    and policyname = 'update own personal link reason') as policy_exists,
  has_column_privilege('authenticated', 'public.skillloop_personal_edges', 'reason', 'UPDATE') as reason_update,
  has_table_privilege('authenticated', 'public.skillloop_personal_edges', 'UPDATE') as table_update`;
async function state() {
  const result = await management('/query', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, read_only: true }) });
  if (!Array.isArray(result) || result.length !== 1) throw new Error('Unexpected migration inspection result.');
  return result[0];
}

const history = await management('/migrations');
if (!Array.isArray(history)) throw new Error('Unexpected migration history response.');
const before = await state();
process.stdout.write(`${JSON.stringify({ migrationHistory: history.map(({ version, name }) => ({ version, name })), before })}\n`);

if (process.argv.includes('--apply')) {
  if (process.env.KNOWLEDGE_PREVIEW_WRITES !== 'confirmed') {
    throw new Error('Set KNOWLEDGE_PREVIEW_WRITES=confirmed only for the non-production preview.');
  }
  if (before.policy_exists || before.reason_update) {
    throw new Error('Migration is already applied or partially present; inspect before retrying.');
  }
  const sql = await readFile(new URL('../supabase/migrations/20261022111424_update_personal_edge_reason.sql', import.meta.url), 'utf8');
  await management('/migrations', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'update_personal_edge_reason', query: sql }) });
  const after = await state();
  if (!after.policy_exists || !after.reason_update || after.table_update) {
    throw new Error(`Migration verification failed: ${JSON.stringify(after)}`);
  }
  const latest = await management('/migrations');
  process.stdout.write(`${JSON.stringify({ after, migrationHistory: latest.map(({ version, name }) => ({ version, name })) })}\n`);
}
