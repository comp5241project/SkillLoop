const local = url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);

function localServices(env) {
  try {
    return local(new URL(env.SKILLLOOP_COURSE_DATABASE_URL)) && local(new URL(env.SUPABASE_URL));
  } catch {
    return false;
  }
}

function hostedServices(env) {
  if (env.VERCEL !== '1' || env.SKILLLOOP_NATIVE_VERIFIER !== 'vercel') return false;
  try {
    const database = new URL(env.SKILLLOOP_COURSE_DATABASE_URL);
    const auth = new URL(env.SUPABASE_URL);
    return ['postgres:', 'postgresql:'].includes(database.protocol) && auth.protocol === 'https:' &&
      !local(database) && !local(auth) && Boolean(database.hostname && env.SUPABASE_PUBLISHABLE_KEY?.trim());
  } catch {
    return false;
  }
}

export function nativeRuntimeAvailable(env = process.env) {
  return localServices(env) || hostedServices(env);
}

export function nativeEnabled(env = process.env) {
  return env.SKILLLOOP_NATIVE_COURSES === '1' && nativeRuntimeAvailable(env);
}

export function isNativePreview(env = process.env) {
  return (env.SKILLLOOP_NATIVE_PREVIEW === '1' || env.PORT === '8767') && localServices(env);
}

export const nativeCaseIds = Object.freeze(['cart-checkout', 'retry-queue']);
