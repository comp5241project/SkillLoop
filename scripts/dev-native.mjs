import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startM4Stack } from '../tests/m4-local-stack.mjs';

const authBinary = process.env.SKILLLOOP_AUTH_BINARY;
const authMigrations = process.env.SKILLLOOP_AUTH_MIGRATIONS;
if (!authBinary || !authMigrations) {
  throw new Error('Set SKILLLOOP_AUTH_BINARY and SKILLLOOP_AUTH_MIGRATIONS to a local Supabase Auth release.');
}

const stack = await startM4Stack(null, { native: true, port: 8767, authBinary, authMigrations });
try {
  const accountFile = new URL('../.env.native-accounts.json', import.meta.url);
  await writeFile(accountFile, JSON.stringify(stack.accounts, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(`SkillLoop isolated preview at ${stack.base}/enhancement-v3/web/\n`);
  process.stdout.write(`Local test accounts: ${fileURLToPath(accountFile)}\n`);
} catch (error) {
  await stack.close();
  throw error;
}

let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await stack.close();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
