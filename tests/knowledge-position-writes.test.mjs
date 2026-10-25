import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function writer(write, restore, failure) {
  const source = await readFile(new URL('../knowledge-map/position-writes.js', import.meta.url), 'utf8');
  const sandbox = { Promise, Map };
  runInNewContext(source, sandbox);
  return sandbox.SkillLoopPositionWrites.create(write, restore, failure);
}

test('successive node moves save in order and a failed final move restores the last confirmed position', async () => {
  const requests = [];
  const restored = [];
  const failures = [];
  const save = await writer((id, position) => new Promise((resolve, reject) =>
    requests.push({ id, position, resolve, reject })),
  (id, position) => restored.push({ id, position }), (error) => failures.push(error.message));
  const first = save('a', { x: 0, y: 0 }, { x: 10, y: 0 });
  const second = save('a', { x: 10, y: 0 }, { x: 20, y: 0 });
  await Promise.resolve();
  assert.equal(requests.length, 1);
  requests[0].resolve();
  await first;
  await Promise.resolve();
  assert.equal(requests.length, 2);
  requests[1].reject(new Error('offline'));
  await second;
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), [{ id: 'a', position: { x: 10, y: 0 } }]);
  assert.deepEqual(failures, ['offline']);
});

test('an earlier failed move cannot restore over a newer queued move', async () => {
  const requests = [];
  const restored = [];
  const save = await writer((id, position) => new Promise((resolve, reject) =>
    requests.push({ id, position, resolve, reject })),
  (id, position) => restored.push({ id, position }), () => {});
  const first = save('a', { x: 0, y: 0 }, { x: 10, y: 0 });
  const second = save('a', { x: 10, y: 0 }, { x: 20, y: 0 });
  await Promise.resolve();
  requests[0].reject(new Error('offline'));
  await first;
  assert.equal(restored.length, 0);
  await Promise.resolve();
  requests[1].resolve();
  await second;
  assert.equal(restored.length, 0);
});
