import { CourseError, UUID, caseContext, createConfiguredStore } from '../enhancement-v2/m4-courses.mjs';
import studio from '../enhancement-v2/m3-studio-session.cjs';

const sessionCookie = 'sl_course_access';
const tokenPattern = /^[a-zA-Z0-9._-]+$/;

function cookie(request, token = '', age = 0) {
  if (typeof token !== 'string' || (token && !tokenPattern.test(token))) throw new CourseError(502, 'Invalid sign-in response.');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookie}=${token}; Max-Age=${age}; Path=/api/courses; HttpOnly; SameSite=Lax${secure}`;
}

function token(request) {
  const pair = (request.headers.get('cookie') || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(sessionCookie + '='));
  const value = pair?.slice(sessionCookie.length + 1);
  return value && tokenPattern.test(value) ? value : null;
}

function positive(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(Number(value)) ||
      Number(value) < 1 || Number(value) > 2147483647) {
    throw new CourseError(400, `Choose a valid ${label}.`);
  }
  return Number(value);
}

function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new CourseError(400, 'Choose a valid course.');
  return value;
}

function practiceAttemptId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new CourseError(400, 'Reopen the exercise to load a valid practice attempt.');
  }
  return value;
}

async function input(request) {
  if (request.headers.get('x-skillloop-course') !== '1' ||
      request.headers.get('origin') !== new URL(request.url).origin) {
    throw new CourseError(403, 'Reopen this page and submit from the course site.');
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new CourseError(415, 'Send a JSON request.');
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > 100000) throw new CourseError(413, 'This request is too large.');
  let data;
  try { data = JSON.parse(text); } catch { throw new CourseError(400, 'Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CourseError(400, 'Invalid request.');
  return data;
}

function supabaseAuth() {
  let url;
  try { url = new URL(process.env.SUPABASE_URL); } catch { /* configuration error handled below */ }
  const local = url?.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if ((!local && url?.protocol !== 'https:') || !key) throw new CourseError(503, 'Course sign-in is not configured.');
  async function call(path, { method = 'GET', bearer, body } = {}) {
    let response;
    try {
      response = await fetch(new URL('/auth/v1/' + path, url), {
        method, redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { apikey: key, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new CourseError(502, 'Sign-in service is unavailable. Try again.');
    }
    if (response.status === 429) throw new CourseError(429, 'Too many sign-in requests. Try again shortly.');
    if (response.status >= 500) throw new CourseError(502, 'Sign-in service is unavailable. Try again.');
    if (!response.ok) return null;
    return response.json();
  }
  return {
    signIn: (email, password) => call('token?grant_type=password', { method: 'POST', body: { email, password } }),
    user: (bearer) => call('user', { bearer }),
  };
}

function json(payload, status = 200, session) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...(session ? { 'Set-Cookie': session } : {}) } });
}

export function createCourseApi({ getStore = createConfiguredStore, getAuth = supabaseAuth } = {}) {
  let store;
  const database = () => store ??= getStore();
  return {
    async fetch(request) {
      try {
        const query = new URL(request.url).searchParams;
        const op = query.get('op');
        const get = request.method === 'GET';
        const post = request.method === 'POST';
        if (get && op === 'case') return json({ case: caseContext() });
        if (get && op === 'published') {
          return json(await database().read(id(query.get('course')), positive(query.get('version'), 'version')));
        }
        const data = post ? await input(request) : {};
        if (post && op === 'logout') return json({ signedOut: true }, 200, cookie(request));
        if (post && op === 'login') {
          if (typeof data.email !== 'string' || data.email.length > 254 || !data.email.includes('@') ||
              typeof data.password !== 'string' || !data.password || data.password.length > 1024) {
            throw new CourseError(400, 'Enter your email and password.');
          }
          const result = await getAuth().signIn(data.email, data.password);
          if (!UUID.test(result?.user?.id) || !result.access_token || result.user.is_anonymous) {
            throw new CourseError(401, 'Email or password was not accepted.');
          }
          const role = await database().role(result.user.id);
          const age = Math.max(1, Math.min(Math.floor(Number(result.expires_in)) || 3600, 3600));
          return json({ role, accountId: result.user.id }, 200, cookie(request, result.access_token, age));
        }
        if (!get && !post) throw new CourseError(405, 'Method unavailable.');
        const bearer = token(request);
        const user = bearer ? await getAuth().user(bearer) : null;
        const actor = UUID.test(user?.id) && !user.is_anonymous ? user.id : null;
        if (get && op === 'session') return json({ role: actor ? await database().role(actor) : null, accountId: actor });
        if (!actor) throw new CourseError(401, 'Sign in to continue.');
        if (get && op === 'list') return json({ courses: await database().list(actor) });
        if (get && op === 'open') return json(await database().open(actor, id(query.get('course'))));
        if (post && op === 'preview') return json({ lesson: await database().preview(actor, data.form) });
        if (post && op === 'mock') {
          if (await database().role(actor) !== 'teacher') throw new CourseError(403, 'Teacher access required.');
          return json(await studio.createStudioSession().generate({ brief: data.brief }));
        }
        if (post && op === 'save') {
          const courseId = data.courseId === null ? null : id(data.courseId);
          const revision = courseId ? positive(data.revision, 'draft revision') : null;
          return json(await database().save(actor, courseId, revision, data.form), courseId ? 200 : 201);
        }
        if (post && (op === 'review' || op === 'publish')) {
          if (data.confirm !== true) throw new CourseError(400, 'Confirm this action for the saved revision.');
          return json(await database()[op](actor, id(data.courseId), positive(data.revision, 'draft revision')));
        }
        if ((get && op === 'attempt') || (post && ['start', 'submit'].includes(op))) {
          const params = get ? { courseId: query.get('course'), version: query.get('version') } : data;
          const courseId = id(params.courseId);
          const version = positive(params.version, 'version');
          const attempt = op === 'submit'
            ? await database().submit(actor, courseId, version, practiceAttemptId(data.attemptId), data.responses)
            : await database()[op](actor, courseId, version);
          return json({ attempt });
        }
        throw new CourseError(404, 'Course action unavailable.');
      } catch (error) {
        if (error instanceof CourseError || error instanceof studio.StudioError) {
          return json({ error: error.message, fields: error.fields, code: error.code }, error.status);
        }
        if (['22P05', '22021'].includes(error.code)) {
          return json({ error: 'Remove unsupported characters and try again.' }, 422);
        }
        console.error('Course service failure', { operation: new URL(request.url).searchParams.get('op'), code: error.code });
        return json({ error: 'Course service is unavailable. Try again.' }, 503);
      }
    },
  };
}

export default createCourseApi();
