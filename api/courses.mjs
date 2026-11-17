import { CourseError, UUID, caseContext, createConfiguredStore, supportedCourses } from '../enhancement-v2/m4-courses.mjs';
import journey from '../enhancement-v2/m5-journey.cjs';
import studio from '../enhancement-v2/m3-studio-session.cjs';
import { createCourseAuthor } from '../enhancement-v2/m3-ai-author.mjs';

import { isV3Operation, runV3 } from '../enhancement-v3/api.mjs';

import { nativeEnabled } from '../enhancement-v3/native/environment.mjs';
import { nativeProgress } from '../enhancement-v3/native/progress.mjs';
import { v3Store } from '../enhancement-v3/store.mjs';

const sessionCookie = () => nativeEnabled() ? 'sl_native_course_access' : 'sl_course_access';
const tokenPattern = /^[a-zA-Z0-9._-]+$/;

function cookie(request, token = '', age = 0) {
  if (typeof token !== 'string' || (token && !tokenPattern.test(token))) throw new CourseError(502, 'Invalid sign-in response.');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookie()}=${token}; Max-Age=${age}; Path=/api/courses; HttpOnly; SameSite=Lax${secure}`;
}

function token(request) {
  const name = sessionCookie();
  const pair = (request.headers.get('cookie') || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(name + '='));
  const value = pair?.slice(name.length + 1);
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

function authoringTarget(data) {
  const { caseRef } = data;
  if (!caseRef || Object.keys(caseRef).length !== 3 || typeof caseRef.caseId !== 'string' ||
      !Number.isInteger(caseRef.caseVersion) || typeof caseRef.conceptId !== 'string') {
    throw new CourseError(400, 'Select a valid case and version.');
  }
  const courseId = data.courseId === null ? null : id(data.courseId);
  const revision = courseId ? positive(data.revision, 'draft revision') : null;
  return { courseId, revision, caseRef };
}

export function createCourseApi({
  getStore = createConfiguredStore, getAuth = supabaseAuth, author = createCourseAuthor(), v3AI,
} = {}) {
  let store;
  const database = () => store ??= getStore();
  async function authenticate(request) {
    const bearer = token(request);
    const user = bearer ? await getAuth().user(bearer) : null;
    return UUID.test(user?.id) && !user.is_anonymous ? user.id : null;
  }
  return {
    async fetch(request) {
      try {
        const query = new URL(request.url).searchParams;
        const op = query.get('op');
        if (isV3Operation(op)) return json(await runV3(request, op, {
          authenticate: () => authenticate(request), database, ai: v3AI,
        }));
        const get = request.method === 'GET';
        const post = request.method === 'POST';
        if (get && op === 'cases') return json({ cases: supportedCourses() });
        if (get && op === 'case') return json({ case: caseContext(query.has('caseId')
          ? { caseId: query.get('caseId'), caseVersion: positive(query.get('caseVersion'), 'case version'),
              conceptId: query.get('conceptId') } : undefined) });
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
        const actor = await authenticate(request);
        if (get && op === 'session') return json({ role: actor ? await database().role(actor) : null, accountId: actor });
        if (!actor) throw new CourseError(401, 'Sign in to continue.');
        if (['native-start', 'native-open', 'native-save'].includes(op)) {
          if (!nativeEnabled()) throw new CourseError(404, 'Original course experience is unavailable here.');
          const courseId = id(get ? query.get('course') : data.courseId);
          const version = positive(get ? query.get('version') : data.version, 'version');
          const native = nativeProgress(database(), v3Store(database(), v3AI).runLearnerAI);
          try {
            if (post && op === 'native-start') return json(await native.start(actor, courseId, version));
            if (get && op === 'native-open') return json(await native.open(actor, courseId, version));
            if (post && op === 'native-save') return json(await native.submit(actor, courseId, version, data));
            throw new CourseError(405, 'Method unavailable.');
          } catch (error) {
            if (error instanceof CourseError || error instanceof journey.JourneyError) throw error;
            if (error.status >= 400 && error.status < 500 || error.code === 'ai-not-configured')
              throw new CourseError(error.status, error.message, undefined, error.code);
            if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) throw error;
            console.error('Native course action failed', { action: data.action, code: error.code, message: error.message });
            throw new CourseError(502, 'The action could not finish. Your course progress is available. Retry.', undefined, error.code);
          }
        }
        if (get && op === 'list') return json({ courses: await database().list(actor) });
        if (get && op === 'open') return json(await database().open(actor, id(query.get('course'))));
        if (post && op === 'preview') return json({ lesson: await database().preview(actor, data.form, data.caseRef) });
        if (post && op === 'generate') {
          if (await database().role(actor) !== 'teacher') throw new CourseError(403, 'Teacher access required.');
          const target = authoringTarget(data);
          if (target.courseId) {
            const { draft } = await database().open(actor, target.courseId);
            if (target.revision !== draft.revision ||
                ['caseId', 'caseVersion', 'conceptId'].some((field) => target.caseRef[field] !== draft.caseRef[field])) {
              throw new CourseError(409, 'Reopen the current saved revision before generating for this course.');
            }
          }
          return json(await author.generate(actor, target, data.brief));
        }
        if (post && op === 'mock') {
          if (await database().role(actor) !== 'teacher') throw new CourseError(403, 'Teacher access required.');
          return json(await studio.createStudioSession().generate({ brief: data.brief }));
        }
        if (post && op === 'save') {
          const courseId = data.courseId === null ? null : id(data.courseId);
          const revision = courseId ? positive(data.revision, 'draft revision') : null;
          let provenance;
          if (data.aiReceipt !== undefined) {
            if (await database().role(actor) !== 'teacher') throw new CourseError(403, 'Teacher access required.');
            provenance = author.verifyReceipt(data.aiReceipt, actor, authoringTarget(data));
          } else if (data.replaceWithMock === true) {
            // Mock material keeps its existing teacher-authored save behavior.
            provenance = { origin: 'manual', proposalId: null, templateVersion: null };
          }
          return json(await database().save(actor, courseId, revision, data.form, data.caseRef, provenance),
            courseId ? 200 : 201);
        }
        if (post && (op === 'review' || op === 'publish')) {
          if (data.confirm !== true) throw new CourseError(400, 'Confirm this action for the saved revision.');
          return json(await database()[op](actor, id(data.courseId), positive(data.revision, 'draft revision')));
        }
        if (op === 'journey') {
          const stage = get ? query.get('stage') : data.stage;
          if (!journey.stages.includes(stage)) throw new CourseError(400, 'Choose a valid learning stage.');
          if (post && (!Number.isSafeInteger(data.revision) || data.revision < 0))
            throw new CourseError(400, 'Reopen the stage to load your learning record.');
          return json(await database().journey(actor, id(get ? query.get('course') : data.courseId),
            positive(get ? query.get('version') : data.version, 'version'), stage,
            post ? { attemptId: practiceAttemptId(data.attemptId), revision: data.revision, input: data.input } : null));
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
        if (error instanceof CourseError || error instanceof studio.StudioError || error instanceof journey.JourneyError) {
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
