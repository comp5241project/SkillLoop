import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { importFile, importUrl, FILE_LIMIT } from '../enhancement-v3/import.mjs';
import { caseIndex, contentFor, matchesFor } from '../enhancement-v3/model.mjs';
import library from '../enhancement-v2/m5-case-library.cjs';

const fixture = name => readFile(new URL('./v3-fixtures/' + name, import.meta.url));
const response = (statusCode, headers, body = '') => Object.assign(Readable.from([Buffer.from(body)]), { statusCode, headers });
const resolve = async host => [{ address: host === 'restricted.example.org' ? '192.168.0.1' : '93.184.216.34', family: 4 }];

test('extracts actual PDF pages, DOCX paragraphs and UTF-8 text; refuses scan and damaged files', async () => {
  const doc = await importFile('boundaries.docx', await fixture('boundaries.docx'));
  assert.equal(doc.fragments[1].location.number, 2);
  assert.match(doc.fragments[1].text, /inclusive discount/);
  const pdf = await importFile('boundaries.pdf', await fixture('boundaries.pdf'));
  assert.deepEqual(pdf.fragments[0].location, { kind: 'page', number: 1 });
  assert.match(pdf.fragments[0].text, /numeric zero/);
  await assert.rejects(importFile('scan.pdf', await fixture('scan.pdf')), /no usable text/);
  await assert.rejects(importFile('macro.docx', await fixture('macro.docx')), /cannot be read safely/);
  await assert.rejects(importFile('bad.docx', Buffer.from('not a zip')), /do not match/);
  await assert.rejects(importFile('bad.txt', Buffer.from([0xff, 0xd8])), /UTF-8/);
  await assert.rejects(importFile('empty.txt', Buffer.from('   ')), /no usable text/);
  await assert.rejects(importFile('big.txt', Buffer.alloc(FILE_LIMIT + 1)), /3 MB/);
  await assert.rejects(importFile('text.txt', Buffer.from('x'.repeat(16_001))), /16,000/);
});

test('HTTPS import pins public DNS, rechecks redirects, and handles restricted pages and timeouts', async () => {
  const content = '<title>Checkout notes</title><main><script>privateScript()</script><p>Handle an empty cart!</p></main>';
  const good = await importUrl('https://public.example.org/page', { resolve, request(target) {
    assert.equal(target.address, '93.184.216.34');
    return response(200, { 'content-type': 'text/html' }, content);
  } });
  assert.equal(good.fragments[0].text, 'Handle an empty cart!');
  assert.equal(good.fragments[0].location.url, 'https://public.example.org/page');
  for (const url of ['http://public.example.org/', 'https://127.0.0.1/', 'https://169.254.169.254/', 'https://public.example.org:444/'])
    await assert.rejects(importUrl(url, { resolve, request: () => assert.fail('network must not run') }), /public HTTPS/);
  await assert.rejects(importUrl('https://public.example.org/', { resolve: async () => [
    { address: '93.184.216.34', family: 4 }, { address: '::ffff:127.0.0.1', family: 6 }],
    request: () => assert.fail() }), /restricted network/);
  let requests = 0;
  await assert.rejects(importUrl('https://public.example.org/', { resolve, request: () => {
    requests++;
    return response(302, { location: 'https://restricted.example.org/' });
  } }), /restricted network/);
  assert.equal(requests, 1);
  await assert.rejects(importUrl('https://public.example.org/', { resolve, request: () => response(404, {}) }), /unavailable/);
  await assert.rejects(importUrl('https://public.example.org/', { resolve,
    request: () => response(200, { 'content-type': 'text/html' }, '<main>Sign in<input type=password></main>') }), /require sign-in/);
  await assert.rejects(importUrl('https://public.example.org/', { resolve, timeoutMs: 20, request: () => new Promise(() => {}) }), /too long/);
  await assert.rejects(importUrl('https://public.example.org/', { resolve,
    request: () => response(200, { 'content-type': 'text/plain' }, ' '.repeat(FILE_LIMIT + 1)) }), /too large/);
});

test('cites extracted text, rejects invented matches, and omits cases without an approved runner', async () => {
  const source = await importFile('some.txt', Buffer.from('The empty cart must return numeric zero before division.'));
  const note = { title: 'Empty cart handling', summary: 'Handle the empty cart before computing the average.',
    level: 'beginner', objectives: ['Trace the empty input.', 'Verify a numeric return value.'], questions: [],
    notes: [{ id: 'note-1', heading: 'Empty input', text: 'Handle zero cart units before computing the average.',
      citations: [{ fragmentId: 's1', quote: 'must return numeric zero' }] }] };
  assert.equal(contentFor(note, source).notes.length, 1);
  note.notes[0].citations[0].quote = 'must return numeric negative one';
  assert.throws(() => contentFor(note, source), /exact source quote/);
  const [cart] = caseIndex();
  assert.throws(() => matchesFor({ matches: [{ ...cart, caseVersion: 42 }] }, note), /eligible registered case/);
  assert.throws(() => matchesFor({ matches: [{ caseId: cart.caseId, caseVersion: cart.caseVersion, conceptId: cart.conceptId,
    reason: 'Invalid case requirement reference.', concerns: [], mapping: [{ objectiveIndex: 0, requirementId: 'invented',
      noteIds: ['note-1'], reason: 'This is not in the registry.' }] }] }, note), /real requirements/);
  assert.deepEqual(caseIndex({ ...library, approvedRunner: () => null }), []);
  assert.deepEqual(matchesFor({ matches: [] }, note), []);
});
