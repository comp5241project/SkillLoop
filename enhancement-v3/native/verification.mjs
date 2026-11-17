import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Sandbox } from '@vercel/sandbox';

const engine = new URL('./check-engine.mjs', import.meta.url);
const entry = new URL('./check-process.mjs', import.meta.url);
const dependencies = fileURLToPath(new URL('../../node_modules/', import.meta.url));

function localChecks(input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [
      '--permission', '--allow-fs-read=' + fileURLToPath(new URL('./', import.meta.url)),
      '--allow-fs-read=' + dependencies, fileURLToPath(entry),
    ], { stdio: ['pipe', 'pipe', 'ignore'], env: {}, windowsHide: true });
    let raw = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('The verification runner timed out.')); }, 7000);
    child.stdout.on('data', chunk => {
      raw += chunk;
      if (raw.length > 16000) child.kill();
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('The verification runner could not finish.'));
      try { resolveResult(JSON.parse(raw)); }
      catch (error) { reject(error); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

async function sandboxChecks(input) {
  const files = [{ path: 'check-engine.mjs', content: await readFile(engine) },
    { path: 'run.mjs', content: Buffer.from(
      'import { readFile } from "node:fs/promises"; import { runRegisteredChecks } from "./check-engine.mjs"; ' +
      'process.stdout.write(JSON.stringify(await runRegisteredChecks(JSON.parse(await readFile("input.json", "utf8")))));') },
    { path: 'input.json', content: Buffer.from(JSON.stringify(input)) }];
  const packages = ['quickjs-emscripten', 'quickjs-emscripten-core', ...(await readdir(resolve(dependencies, '@jitl')))
    .filter(name => name.startsWith('quickjs-')).map(name => '@jitl/' + name)];
  async function add(path) {
    const entries = await readdir(resolve(dependencies, path), { withFileTypes: true });
    for (const entry of entries) {
      const name = path + '/' + entry.name;
      if (entry.isDirectory() && entry.name === 'dist') await add(name);
      else if (entry.isFile() && /(?:package\.json|\.(?:js|cjs|mjs|wasm))$/.test(entry.name))
        files.push({ path: 'node_modules/' + name, content: await readFile(resolve(dependencies, name)) });
    }
  }
  await Promise.all(packages.map(add));
  const sandbox = await Sandbox.create({ resources: { vcpus: 1 }, timeout: 15000, persistent: false, networkPolicy: 'deny-all' });
  try {
    await sandbox.writeFiles(files);
    const cmd = await sandbox.runCommand({ cmd: 'node', args: ['run.mjs'], cwd: '/vercel/sandbox' });
    if (cmd.exitCode !== 0) throw new Error('The verification sandbox could not finish.');
    return JSON.parse(await cmd.stdout());
  } finally {
    await sandbox.stop();
  }
}

export async function verifySubmission(input) {
  const results = await (process.env.SKILLLOOP_NATIVE_VERIFIER === 'vercel' ? sandboxChecks(input) : localChecks(input));
  if (!Array.isArray(results) || results.length !== input.checks.length || results.some((r, i) =>
    r?.testId !== input.checks[i].testId || !['pass', 'fail', 'error'].includes(r.status) ||
    typeof r.actual !== 'string' || r.actual.length > 300)) throw new Error('The verification response was invalid.');
  return results;
}
