import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { planFingerprint } from './_knowledge-v4-model.mjs';

const migration = fileURLToPath(new URL('../supabase/migrations/20261027000100_knowledge_v4.sql', import.meta.url));
const versionReadGrant = fileURLToPath(new URL('../supabase/migrations/20261027000200_knowledge_v4_service_version_read.sql', import.meta.url));
const teacherId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const otherId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const unitId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const graphId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

function unit(body = 'A scene has state.') {
  const value = { schemaVersion: '0.4', id: unitId, type: 'open-source', title: 'Canvas',
    summary: 'Explore canvas state', guidingQuestion: 'How?', publisherName: 'Teacher',
    topics: ['Canvas'], sections: [{ id: 'overview', kind: 'overview', title: 'Overview',
      body, claimKind: 'general', evidenceRefs: [] }],
    activities: [{ id: 'trace', prompt: 'Trace a change.', guidance: 'Observe.', evidenceRefs: [] }],
    directions: [{ id: 'scene', graphId, title: 'Scene', question: 'What?', scope: 'Scene state' }],
    sources: [], confirmedPlanFingerprint: null };
  value.confirmedPlanFingerprint = planFingerprint(value);
  return value;
}

function graph(description = 'A scene state.', claimKind = 'general') {
  return { schemaVersion: '0.4', id: graphId, directionId: 'scene', title: 'Scene',
    nodes: [{ id: 'state', title: 'State', description, claimKind, evidenceRefs: [] }], edges: [] };
}

test('service role reads Unit Version history after the additive permission patch', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.skillloop_is_teacher() returns boolean language sql stable as $$ select true $$;`);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.exec(readFileSync(versionReadGrant, 'utf8'));
    await db.exec('set role service_role');
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_versions')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('database permits a new generation batch only after the prior proposal is reviewed', async () => {
  const db = new PGlite();
  const secondJob = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
  const secondProposal = 'ffffffff-ffff-4fff-ffff-ffffffffffff';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.skillloop_is_teacher() returns boolean language sql stable as $$ select true $$;`);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.query('insert into auth.users(id) values ($1)', [teacherId]);
    await db.query('insert into public.skillloop_v4_units(id,owner_id,title) values ($1,$2,$3)',
      [unitId, teacherId, 'Canvas']);
    await db.query(`insert into public.skillloop_v4_jobs(id,unit_id,owner_id,kind,status,idempotency_key,input)
      values ($1,$2,$3,'generate','completed',$4,'{}'::jsonb),
             ($5,$2,$3,'generate','completed',$6,'{}'::jsonb)`,
    [graphId, unitId, teacherId, graphId, secondJob, secondJob]);
    const insertProposal = `insert into public.skillloop_v4_proposals
      (id,unit_id,owner_id,job_id,kind,unit_revision,model,prompt_version,schema_version,payload)
      values ($1,$2,$3,$4,'generate',$5,'test','1','0.4','{}'::jsonb)`;
    await db.query(insertProposal, [graphId, unitId, teacherId, graphId, graphId]);
    await assert.rejects(db.query(insertProposal,
      [secondProposal, unitId, teacherId, secondJob, graphId]), /duplicate key/);
    await db.query('update public.skillloop_v4_proposals set dismissed_at=now() where id=$1', [graphId]);
    await db.query(insertProposal, [secondProposal, unitId, teacherId, secondJob, graphId]);
  } finally { await db.close(); }
});

test('Postgres migration enforces owner isolation, mixed version publication, rollback and withdrawal', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.skillloop_is_teacher() returns boolean language sql stable as $$ select true $$;`);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.query('insert into auth.users(id) values ($1),($2)', [teacherId, otherId]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);

    let rev1 = (await db.query('select public.skillloop_v4_create_unit($1,$2) as revision',
      [unitId, JSON.stringify(unit())])).rows[0].revision;
    await assert.rejects(db.query('insert into public.skillloop_v4_sources(id,unit_id,owner_id,metadata) values ($1,$2,$3,$4)',
      [graphId, unitId, teacherId, JSON.stringify({ origin: 'captured' })]), /permission denied/);
    await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon;");
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_units')).rows[0].n, 0);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);

    const confirmed = (await db.query('select public.skillloop_v4_confirm_plan($1,$2,$3) as plan',
      [unitId, rev1, planFingerprint(unit())])).rows[0].plan;
    assert.equal(confirmed.planRevision, 1);
    rev1 = confirmed.revision;
    const graphRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', null, JSON.stringify(graph())])).rows[0].revision;
    assert.equal((await db.query('select public.skillloop_v4_publish_unit($1,$2,$3) as version',
      [unitId, rev1, JSON.stringify([{ directionId: 'scene', graphId, draftRevision: graphRevision }])])).rows[0].version, 1);

    const rev2 = (await db.query('select public.skillloop_v4_save_unit($1,$2,$3) as revision',
      [unitId, rev1, JSON.stringify(unit('A scene maintains state.'))])).rows[0].revision;
    assert.equal((await db.query('select public.skillloop_v4_publish_unit($1,$2,$3) as version',
      [unitId, rev2, JSON.stringify([{ directionId: 'scene', graphId, version: 1 }])])).rows[0].version, 2);
    const versions = (await db.query('select version,graph_refs from public.skillloop_v4_unit_versions order by version')).rows;
    assert.deepEqual(versions.map((row) => row.graph_refs[0].version), [1, 1]);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_graph_versions')).rows[0].n, 1);

    const invalidRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', graphRevision, JSON.stringify(graph('A specific code claim.', 'code'))])).rows[0].revision;
    await assert.rejects(db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, rev2, JSON.stringify([{ directionId: 'scene', graphId, draftRevision: invalidRevision }])]),
    /Specific concept claim lacks evidence/);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_versions')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_graph_versions')).rows[0].n, 1);

    await db.exec(`select set_config('request.jwt.claim.sub','${otherId}',false);`);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_drafts')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_versions')).rows[0].n, 2);
    await assert.rejects(db.query('select public.skillloop_v4_save_unit($1,$2,$3)',
      [unitId, rev2, JSON.stringify(unit())]), /another teacher/);

    await db.exec(`select set_config('request.jwt.claim.sub','${teacherId}',false);`);
    await db.query('select public.skillloop_v4_withdraw_unit($1,$2)', [unitId, 'Needs revision']);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_tombstones')).rows[0].n, 2);
    await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon;");
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_versions')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_tombstones')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_graph_versions')).rows[0].n, 1);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);
    assert.equal((await db.query('select public.skillloop_v4_publish_unit($1,$2,$3) as version',
      [unitId, rev2, JSON.stringify([{ directionId: 'scene', graphId, version: 1 }])])).rows[0].version, 3);
    await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon;");
    assert.deepEqual((await db.query('select version from public.skillloop_v4_unit_versions order by version')).rows
      .map((row) => row.version), [3]);
  } finally { await db.close(); }
});

test('publishing selected Directions keeps unfinished planned Directions private', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.skillloop_is_teacher() returns boolean language sql stable as $$ select true $$;`);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.query('insert into auth.users(id) values ($1)', [teacherId]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);
    const partial = unit();
    partial.directions.push({ id: 'render', graphId: 'ffffffff-ffff-4fff-ffff-ffffffffffff',
      title: 'Rendering', question: 'How is it drawn?', scope: 'Rendering pipeline' });
    partial.confirmedPlanFingerprint = planFingerprint(partial);
    let revision = (await db.query('select public.skillloop_v4_create_unit($1,$2) as revision',
      [unitId, JSON.stringify(partial)])).rows[0].revision;
    revision = (await db.query('select public.skillloop_v4_confirm_plan($1,$2,$3) as plan',
      [unitId, revision, planFingerprint(partial)])).rows[0].plan.revision;
    const graphRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', null, JSON.stringify(graph())])).rows[0].revision;
    await assert.rejects(db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, revision, JSON.stringify([])]), /needs valid Direction Graph references/);
    assert.equal((await db.query('select public.skillloop_v4_publish_unit($1,$2,$3) as version',
      [unitId, revision, JSON.stringify([{ directionId: 'scene', graphId, draftRevision: graphRevision }])])).rows[0].version, 1);
    const published = (await db.query('select payload,graph_refs from public.skillloop_v4_unit_versions')).rows[0];
    assert.deepEqual(published.payload.directions.map((direction) => direction.id), ['scene']);
    assert.deepEqual(published.graph_refs.map((ref) => ref.directionId), ['scene']);
    const draft = (await db.query('select payload from public.skillloop_v4_unit_drafts')).rows[0].payload;
    assert.deepEqual(draft.directions.map((direction) => direction.id), ['scene', 'render']);
  } finally { await db.close(); }
});

test('version withdrawal preserves other history, cascades Graph references and keeps version numbers increasing', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.skillloop_is_teacher() returns boolean language sql stable as $$ select true $$;`);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.query('insert into auth.users(id) values ($1)', [teacherId]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);
    let revision = (await db.query('select public.skillloop_v4_create_unit($1,$2) as revision',
      [unitId, JSON.stringify(unit())])).rows[0].revision;
    revision = (await db.query('select public.skillloop_v4_confirm_plan($1,$2,$3) as plan',
      [unitId, revision, planFingerprint(unit())])).rows[0].plan.revision;
    const graphRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', null, JSON.stringify(graph())])).rows[0].revision;
    await db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, revision, JSON.stringify([{ directionId: 'scene', graphId, draftRevision: graphRevision }])]);
    await db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, revision, JSON.stringify([{ directionId: 'scene', graphId, version: 1 }])]);
    await db.query('select public.skillloop_v4_withdraw_unit_version($1,$2,$3)',
      [unitId, 1, 'First version needs correction']);
    assert.equal((await db.query('select current_version from public.skillloop_v4_units')).rows[0].current_version, 2);
    await db.query('select public.skillloop_v4_withdraw_graph_version($1,$2,$3)',
      [graphId, 1, 'Underlying explanation is inaccurate']);
    assert.equal((await db.query('select current_version from public.skillloop_v4_units')).rows[0].current_version, null);
    assert.equal((await db.query('select current_version from public.skillloop_v4_graphs')).rows[0].current_version, null);
    assert.deepEqual((await db.query('select version from public.skillloop_v4_unit_tombstones order by version')).rows
      .map((row) => row.version), [1, 2]);
    assert.equal((await db.query('select reason from public.skillloop_v4_graph_tombstones')).rows[0].reason,
      'Underlying explanation is inaccurate');
    assert.equal((await db.query('select public.skillloop_v4_publish_unit($1,$2,$3) as version',
      [unitId, revision, JSON.stringify([{ directionId: 'scene', graphId, draftRevision: graphRevision }])])).rows[0].version, 3);
    assert.equal((await db.query('select version from public.skillloop_v4_graph_versions order by version desc limit 1')).rows[0].version, 2);
    await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon;");
    assert.deepEqual((await db.query('select version from public.skillloop_v4_unit_versions')).rows
      .map((row) => row.version), [3]);
    assert.deepEqual((await db.query('select version from public.skillloop_v4_graph_versions')).rows
      .map((row) => row.version), [2]);
  } finally { await db.close(); }
});

test('a Graph Version keeps its own source metadata when a later Unit omits that source', async () => {
  const db = new PGlite();
  const sourceId = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.skillloop_is_teacher() returns boolean language sql stable as $$ select true $$;`);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.query('insert into auth.users(id) values ($1)', [teacherId]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);
    const initial = unit();
    const capturedContent = 'FILE src/main.js @ pinned commit\nA specific code location.';
    const contentSha256 = createHash('sha256').update(capturedContent).digest('hex');
    initial.sources = [{ id: sourceId, title: 'Pinned code', url: 'https://example.com/code',
      origin: 'captured', snapshotId: sourceId, revision: 'a'.repeat(40),
      retrievedAt: '2026-10-27T00:00:00Z', scope: 'Pinned src/main.js', contentSha256 }];
    let rev1 = (await db.query('select public.skillloop_v4_create_unit($1,$2) as revision',
      [unitId, JSON.stringify(initial)])).rows[0].revision;
    await db.exec('reset role');
    await db.query('insert into public.skillloop_v4_sources(id,unit_id,owner_id,metadata,snapshot) values ($1,$2,$3,$4,$5)',
      [sourceId, unitId, teacherId, JSON.stringify(initial.sources[0]),
        JSON.stringify({ content: capturedContent, contentSha256 })]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);
    rev1 = (await db.query('select public.skillloop_v4_confirm_plan($1,$2,$3) as plan',
      [unitId, rev1, planFingerprint(initial)])).rows[0].plan.revision;
    const detailed = graph('A specific code location.', 'code');
    detailed.nodes[0].evidenceRefs = [{ sourceId, location: 'src/main.js', kind: 'code' }];
    const graphRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', null, JSON.stringify(detailed)])).rows[0].revision;
    await db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, rev1, JSON.stringify([{ directionId: 'scene', graphId, draftRevision: graphRevision }])]);
    detailed.nodes[0].evidenceRefs[0].location = 'src/imaginary.js';
    const invalidRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', graphRevision, JSON.stringify(detailed)])).rows[0].revision;
    await assert.rejects(db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, rev1, JSON.stringify([{ directionId: 'scene', graphId, draftRevision: invalidRevision }])]),
    /Evidence location is absent/);
    const later = unit('An updated overview without this source.');
    const rev2 = (await db.query('select public.skillloop_v4_save_unit($1,$2,$3) as revision',
      [unitId, rev1, JSON.stringify(later)])).rows[0].revision;
    await db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, rev2, JSON.stringify([{ directionId: 'scene', graphId, version: 1 }])]);
    await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon;");
    const frozen = (await db.query('select sources from public.skillloop_v4_graph_versions where graph_id=$1 and version=1',
      [graphId])).rows[0].sources;
    assert.equal(frozen[0].id, sourceId);
    assert.equal(frozen[0].url, 'https://example.com/code');
  } finally { await db.close(); }
});

test('direct publication RPC rejects incomplete activities and relationships', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.skillloop_is_teacher() returns boolean language sql stable as $$ select true $$;`);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.query('insert into auth.users(id) values ($1)', [teacherId]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${teacherId}',false);`);
    const brokenUnit = unit();
    brokenUnit.activities[0].prompt = '';
    let unitRevision = (await db.query('select public.skillloop_v4_create_unit($1,$2) as revision',
      [unitId, JSON.stringify(brokenUnit)])).rows[0].revision;
    unitRevision = (await db.query('select public.skillloop_v4_confirm_plan($1,$2,$3) as plan',
      [unitId, unitRevision, planFingerprint(brokenUnit)])).rows[0].plan.revision;
    const brokenGraph = graph();
    brokenGraph.edges.push({ id: 'depends', source: 'state', target: 'state',
      label: '', reason: '', basis: 'teaching-association', evidenceRefs: [] });
    const graphRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', null, JSON.stringify(brokenGraph)])).rows[0].revision;
    const refs = JSON.stringify([{ directionId: 'scene', graphId, draftRevision: graphRevision }]);
    await assert.rejects(db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, unitRevision, refs]), /learning activity is incomplete/);
    const unsafeSource = unit();
    unsafeSource.sources = [{ id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee', title: 'Unsafe',
      url: 'http://example.com', origin: 'manual', reviewedAt: '2026-10-27T00:00:00Z' }];
    const unsafeRevision = (await db.query('select public.skillloop_v4_save_unit($1,$2,$3) as revision',
      [unitId, unitRevision, JSON.stringify(unsafeSource)])).rows[0].revision;
    await assert.rejects(db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, unsafeRevision, refs]), /Source title or HTTPS URL is invalid/);
    const fixedUnitRevision = (await db.query('select public.skillloop_v4_save_unit($1,$2,$3) as revision',
      [unitId, unsafeRevision, JSON.stringify(unit())])).rows[0].revision;
    await assert.rejects(db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, fixedUnitRevision, refs]), /Relationship has invalid concepts|Relationship is incomplete/);
    brokenGraph.nodes.push({ id: 'other', title: 'Other', description: 'Other concept.',
      claimKind: 'general', evidenceRefs: [] });
    Object.assign(brokenGraph.edges[0], { target: 'other', label: 'documents',
      reason: 'The source describes this relation.', basis: 'source-supported' });
    const unsupportedRevision = (await db.query('select public.skillloop_v4_save_graph($1,$2,$3,$4,$5) as revision',
      [graphId, unitId, 'scene', graphRevision, JSON.stringify(brokenGraph)])).rows[0].revision;
    await assert.rejects(db.query('select public.skillloop_v4_publish_unit($1,$2,$3)',
      [unitId, fixedUnitRevision, JSON.stringify([{ directionId: 'scene', graphId,
        draftRevision: unsupportedRevision }])]), /Source-supported relationship lacks evidence/);
    assert.equal((await db.query('select count(*)::int as n from public.skillloop_v4_unit_versions')).rows[0].n, 0);
  } finally { await db.close(); }
});
