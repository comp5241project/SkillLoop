import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.vercel', 'skillloop-static');
const staticTypes = new Set(['.html', '.js', '.css', '.svg', '.png', '.woff2']);

async function publish(path) {
  const target = join(output, path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, path), target);
}

async function publishFolder(folder) {
  for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'docs' && entry.name !== 'server') {
      await publishFolder(path);
    } else if (entry.isFile() && staticTypes.has(extname(entry.name))) {
      await publish(path);
    }
  }
}

await publish('index.html');
for (const folder of ['public', 'shared', 'learning-path', 'knowledge-map', 'interview', 'correction-lab']) {
  await publishFolder(folder);
}
for (const file of ['course.html', 'learner.html', 'studio.js', 'studio.css', 'course.css', 'course-client.js', 'course.js', 'learner.js']) {
  await publish(join('enhancement-v2', 'studio', file));
}
console.log('Prepared browser assets in .vercel/skillloop-static.');
