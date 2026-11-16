import { UUID } from '../enhancement-v2/m4-courses.mjs';
import { createV3AI } from './ai.mjs';
import { FILE_LIMIT, importFile, importUrl, limited } from './import.mjs';
import { clean, fail } from './model.mjs';
import { v3Store } from './store.mjs';

const publicOps = new Set(['v3-catalog', 'v3-overview']);
const readOps = new Set([...publicOps, 'v3-list', 'v3-open', 'v3-learning', 'v3-lesson']);
const writeOps = new Set(['v3-import-url', 'v3-import-file', 'v3-generate', 'v3-save', 'v3-match', 'v3-select',
  'v3-preview', 'v3-review', 'v3-publish', 'v3-generate-lesson', 'v3-answer']);
const progressOps = new Set(['v3-generate-lesson', 'v3-answer']);
const id = value => {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'Choose a valid course or draft.');
  return value;
};
const positive = value => {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2147483647)
    fail(400, 'Choose a valid revision or version.');
  return Number(value);
};
export function isV3Operation(op) { return readOps.has(op) || writeOps.has(op); }

export async function runV3(request, op, { authenticate, database, ai }) {
  const read = readOps.has(op);
  if (request.method !== (read ? 'GET' : 'POST')) fail(405, 'Method unavailable.');
  const url = new URL(request.url);
  if (!read && (request.headers.get('origin') !== url.origin || request.headers.get('x-skillloop-course') !== '1'))
    fail(403, 'Reopen this page and submit from the course site.');
  const actor = publicOps.has(op) ? null : await authenticate();
  if (!publicOps.has(op) && !actor) fail(401, 'Sign in to continue.');
  const store = v3Store(database(), ai ?? createV3AI());
  const query = url.searchParams;
  if (read) {
    switch (op) {
      case 'v3-catalog': return { courses: await store.catalog() };
      case 'v3-overview': return store.overview(id(query.get('course')), positive(query.get('version')));
      case 'v3-list': return { drafts: await store.list(actor) };
      case 'v3-open': return store.open(actor, id(query.get('draft')));
      case 'v3-learning': return { courses: await store.learning(actor) };
      case 'v3-lesson': return store.lesson(actor, id(query.get('course')), positive(query.get('version')));
    }
  }
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (op === 'v3-import-file') {
    await store.assertTeacher(actor);
    if (type !== 'application/octet-stream') fail(415, 'Select a PDF, DOCX or TXT file to upload.');
    if (Number(request.headers.get('content-length')) > FILE_LIMIT) fail(413, 'Files may be at most 3 MB.');
    let filename;
    try { filename = decodeURIComponent(request.headers.get('x-skillloop-filename') ?? ''); }
    catch { fail(400, 'The source filename is invalid.'); }
    return store.import(actor, await importFile(filename, await limited(request.body, FILE_LIMIT)));
  }
  if (type !== 'application/json') fail(415, 'Send a JSON request.');
  const bytes = await limited(request.body, 100_000);
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(400, 'Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Invalid request.');
  if (op === 'v3-import-url') {
    await store.assertTeacher(actor);
    return store.import(actor, await importUrl(data.url));
  }
  if (progressOps.has(op)) {
    const course = id(data.courseId);
    const version = positive(data.version);
    if (typeof data.evidenceKey !== 'string' || !/^[a-f0-9]{64}$/.test(data.evidenceKey))
      fail(400, 'Reopen the lesson to use your saved diagnosis.');
    if (op === 'v3-generate-lesson') return store.generateLesson(actor, course, version, data.evidenceKey);
    if (!clean(data.answer, 1, 1800)) fail(422, 'Enter an answer of 1–1,800 characters.');
    return store.answer(actor, course, version, data.evidenceKey, data.answer.trim());
  }

  const draft = id(data.id);
  const revision = positive(data.revision);
  if (['v3-select', 'v3-review', 'v3-publish'].includes(op) && data.confirm !== true)
    fail(400, 'Confirm this action for the saved revision.');
  switch (op) {
    case 'v3-generate': return store.generate(actor, draft, revision);
    case 'v3-save': return store.save(actor, draft, revision, data.content);
    case 'v3-match': return store.match(actor, draft, revision);
    case 'v3-select': {
      if (!Number.isInteger(data.selection) || data.selection < 0 || data.selection > 2)
        fail(400, 'Choose a recommended case and confirm its coverage.');
      return store.select(actor, draft, revision, data.selection);
    }
    case 'v3-preview': return store.preview(actor, draft, revision);
    case 'v3-review': return store.review(actor, draft, revision);
    case 'v3-publish': return store.publish(actor, draft, revision);
  }
}
