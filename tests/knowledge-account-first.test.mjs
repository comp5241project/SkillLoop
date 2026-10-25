import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import handler from '../api/knowledge.mjs';

const source = (name) => readFileSync(new URL(`../knowledge-map/${name}`, import.meta.url), 'utf8');

test('legacy Knowledge Home topic opens the original concept route before loading the directory', async () => {
  let requested = false;
  const location = { search: '?topic=foundations&version=v1', replace(url) { this.target = url; } };
  const sandbox = { location, URLSearchParams, window: { KnowledgeNetwork: {
    href: (page, extra) => `/knowledge-map/${page}.html?graph=software-development&version=v1&topic=${extra.topic}`,
    api: () => { requested = true; },
  } } };
  runInNewContext(source('home.js'), sandbox);
  assert.equal(location.target, '/knowledge-map/concept.html?graph=software-development&version=v1&topic=foundations');
  assert.equal(requested, false);
});

test('public home and links never treat an existing account session as a redirect', () => {
  const home = source('home.js');
  const account = source('account-entry.js');
  assert.doesNotMatch(home, /session|login|logout/);
  const initialRefresh = account.slice(account.lastIndexOf('  refresh();'));
  assert.doesNotMatch(initialRefresh, /location\.assign|location\.replace/);
  assert.match(account, /const confirmed = await K\.api\('session'\)/);
  assert.match(account, /location\.assign\(confirmed\.role === 'teacher'/);
});

test('account knowledge never reads or writes the old local network', () => {
  const personal = source('personal.js');
  const publicPages = source('public-pages.js');
  const core = source('network-core.js');
  for (const text of [personal, publicPages, core]) {
    assert.doesNotMatch(text, /saveLocal|referenceNode\(|knowledgeV2|knowledgeStudyV2|SkillLoop\.write\('knowledge'/);
  }
  assert.match(personal, /await K\.api\('personal-note', 'POST', node\)/);
  assert.match(personal, /await K\.api\('personal-edge', 'POST', edge\)/);
  assert.match(publicPages, /const result = await K\.api\('reference', 'POST'/);
});

test('private preview checks the teacher draft API before reading the browser snapshot', async () => {
  let read = false;
  const sandbox = {
    window: {}, URLSearchParams, location: { search: '?graph=graph-one&draftPreview=1' },
    sessionStorage: { getItem: () => { read = true; return '{}'; } },
    fetch: async () => ({ ok: false, status: 403, json: async () => ({ error: 'Teacher access required.' }) }),
  };
  runInNewContext(source('network-core.js'), sandbox);
  await assert.rejects(sandbox.window.KnowledgeNetwork.loadGraph(), { status: 403 });
  assert.equal(read, false);
});

test('private preview rejects a teacher without this graph draft', async () => {
  let read = false;
  const sandbox = {
    window: {}, URLSearchParams, location: { search: '?graph=graph-one&draftPreview=1' },
    sessionStorage: { getItem: () => { read = true; return '{}'; } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ draft: null }) }),
  };
  runInNewContext(source('network-core.js'), sandbox);
  await assert.rejects(sandbox.window.KnowledgeNetwork.loadGraph(), /unavailable to this account/);
  assert.equal(read, false);
});

test('retained import API rejects an anonymous writer', async () => {
  const response = await handler.fetch(new Request('https://skillloop.example/api/knowledge?op=import-personal', {
    method: 'POST', headers: { Origin: 'https://skillloop.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes: [], edges: [] }),
  }));
  assert.equal(response.status, 401);
  const sql = readFileSync(new URL('../supabase/migrations/20261021000200_knowledge_network_v2.sql', import.meta.url), 'utf8');
  assert.match(sql, /create function public\.skillloop_import_personal[\s\S]*?if auth\.uid\(\) is null then raise sqlstate 'PT401'/);
  const importFunction = sql.split('create function public.skillloop_import_personal')[1].split('revoke all on function public.skillloop_import_personal')[0];
  assert.match(importFunction, /values \(auth\.uid\(\)/);
  assert.match(sql, /revoke all on function public\.skillloop_import_personal\(jsonb,jsonb\) from public, anon/);
  assert.match(sql, /grant execute on function public\.skillloop_import_personal\(jsonb,jsonb\) to authenticated/);
});
