/** Run the same checks locally and in CI without contacting live AI services. */
const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
run(python, ['scripts/check_site.py']);
const tests = ['api', 'tests', 'interview', 'correction-lab'].flatMap((folder) =>
  readdirSync(path.join(root, folder))
    .filter((name) => /\.test\.(cjs|mjs)$/.test(name))
    .map((name) => `${folder}/${name}`)
);
run(process.execPath, ['--test', ...tests]);
