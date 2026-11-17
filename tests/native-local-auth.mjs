import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request } from 'node:http';

function token(secret, claims) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode(claims);
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}

export async function startLocalAuth({ binary, migrations, accounts, databaseUrl, port, key }) {
  if (!migrations) throw new Error('Set SKILLLOOP_AUTH_MIGRATIONS to the Supabase Auth migrations directory.');
  const origin = 'http://127.0.0.1:' + port;
  const secret = randomBytes(40).toString('hex');
  const authDatabase = new URL(databaseUrl);
  authDatabase.searchParams.set('search_path', 'auth,public');
  const env = {
    SystemRoot: process.env.SystemRoot,
    GOTRUE_API_HOST: '127.0.0.1', PORT: String(port), API_EXTERNAL_URL: origin,
    GOTRUE_SITE_URL: origin, GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: authDatabase.href,
    DATABASE_URL: authDatabase.href, DB_NAMESPACE: 'auth', GOTRUE_DB_MIGRATIONS_PATH: migrations,
    GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_MAILER_AUTOCONFIRM: 'true', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
  };
  const start = command => {
    const child = spawn(binary, [command], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      logs = (logs + data.toString()).replaceAll(authDatabase.href, '[local database]').replaceAll(databaseUrl, '[local database]').replaceAll(secret, '[secret]').slice(-4000);
    });
    return { child, logs: () => logs };
  };
  const migration = start('migrate');
  if ((await once(migration.child, 'exit'))[0] !== 0) throw new Error('Supabase Auth migration failed: ' + migration.logs());
  const service = start('serve');
  const close = async () => {
    if (service.child.exitCode !== null || service.child.signalCode !== null) return;
    const closed = once(service.child, 'exit');
    service.child.kill();
    await closed;
  };
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (service.child.exitCode !== null) break;
      try { ready = (await fetch(origin + '/health')).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error('Supabase Auth failed to start: ' + service.logs());
    const auth = token(secret, { role: 'service_role', exp: Math.floor(Date.now() / 1000) + 120 });
    for (const account of Object.values(accounts)) {
      const result = await fetch(origin + '/admin/users', {
        method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password, email_confirm: true }),
      });
      if (!result.ok) {
        const detail = await result.json().catch(() => ({}));
        throw new Error('Supabase Auth could not create an isolated account (HTTP ' + result.status + ', ' +
          (detail.error_code ?? detail.code ?? 'unknown') + '). ' + service.logs());
      }
      account.id = (await result.json()).id;
    }
    const proxy = createServer((req, res) => {
      if (req.headers.apikey !== key || !req.url.startsWith('/auth/v1/')) {
        res.writeHead(401).end();
        return;
      }
      const upstream = request(origin + req.url.slice('/auth/v1'.length), {
        method: req.method, headers: req.headers,
      }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
      upstream.on('error', () => { res.writeHead(502).end(); });
      req.pipe(upstream);
    });
    return { proxy, close };
  } catch (error) {
    await close();
    throw error;
  }
}
