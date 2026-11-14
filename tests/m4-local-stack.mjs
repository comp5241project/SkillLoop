import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const migrations = new URL('../supabase/migrations/', import.meta.url);
const secret = () => randomBytes(24).toString('hex');

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function authFixture(accounts, key) {
  const tokens = new Map();
  return createServer(async (req, res) => {
    let result;
    if (req.headers.apikey === key && req.method === 'POST' && req.url === '/auth/v1/token?grant_type=password') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const { email, password } = JSON.parse(Buffer.concat(chunks));
      const account = Object.values(accounts).find((entry) => entry.email === email && entry.password === password);
      if (account) {
        const access_token = secret();
        const user = { id: account.id, is_anonymous: false, user_metadata: { role: 'teacher' } };
        tokens.set(access_token, user);
        result = { user, access_token, expires_in: 3600 };
      }
    }
    if (req.headers.apikey === key && req.method === 'GET' && req.url === '/auth/v1/user') {
      result = tokens.get(req.headers.authorization?.substring(7));
    }
    res.writeHead(result ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result ?? { error: 'Invalid credentials' }));
  });
}

export async function startM4Stack(t) {
  const scratch = await mkdtemp(join(tmpdir(), 'skillloop-m4-'));
  const databaseDir = join(scratch, 'postgres');
  const port = await freePort();
  const db = new EmbeddedPostgres({
    databaseDir, port, user: 'postgres', password: secret(), persistent: true,
    autoRehydrateSymlinks: true, onLog() {}, onError() {},
  });
  let started = false;
  let server;
  let runtime;
  let current;
  let admin;
  const closeApp = async () => {
    if (!current) return;
    const process = current;
    current = null;
    if (process.exitCode === null && process.signalCode === null) {
      const exit = once(process, 'exit');
      process.kill();
      await exit;
    }
  };
  const close = async () => {
    await closeApp();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await runtime?.end();
    await admin?.end();
    if (started) await db.stop();
    await rm(scratch, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
  };
  t?.after(close);
  try {
    await db.initialise();
    await db.start();
    started = true;
    admin = db.getPgClient();
    await admin.connect();
    const password = secret();
    const key = secret();
    const accounts = Object.fromEntries(['teacher', 'other-teacher', 'student', 'other-student'].map((role) =>
      [role, { id: randomUUID(), email: `${role}@skillloop.test`, password: secret() }]));
    // Supabase platform primitives for the disposable PostgreSQL cluster.
    await admin.query(`create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
    for (const name of (await readdir(migrations)).filter((entry) => entry.endsWith('.sql')).sort()) {
      await admin.query(await readFile(new URL(name, migrations), 'utf8'));
    }
    await admin.query(`create role course_test_login login noinherit password '${password}';
      grant skillloop_course_server to course_test_login;`);
    for (const [name, account] of Object.entries(accounts)) {
      await admin.query('insert into auth.users(id) values ($1)', [account.id]);
      if (name.endsWith('teacher')) await admin.query("insert into skillloop_roles values ($1, 'teacher')", [account.id]);
    }
    const databaseUrl = `postgres://course_test_login:${password}@127.0.0.1:${port}/postgres`;
    runtime = new pg.Pool({ connectionString: databaseUrl });
    server = authFixture(accounts, key);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const appPort = await freePort();
    const base = `http://127.0.0.1:${appPort}`;
    const startApp = async () => {
      current = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, windowsHide: true,
        env: { ...process.env, PORT: String(appPort), SKILLLOOP_COURSE_DATABASE_URL: databaseUrl,
          SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_PUBLISHABLE_KEY: key },
        stdio: ['ignore', 'pipe', 'pipe'] });
      const child = current;
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
      await new Promise((resolve, reject) => {
        child.stdout.on('data', (chunk) => {
          if (String(chunk).includes(base)) resolve();
        });
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`App exited (${code}): ${stderr}`)));
      });
    };
    await startApp();
    return { base, admin, runtime, accounts, close, restartApp: async () => { await closeApp(); await startApp(); } };
  } catch (error) {
    if (!t) await close();
    throw error;
  }
}
