const local = url => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);

export function nativeEnabled(env = process.env) {
  if (env.SKILLLOOP_NATIVE_COURSES !== '1') return false;
  try {
    return local(env.SKILLLOOP_COURSE_DATABASE_URL) && local(env.SUPABASE_URL);
  } catch {
    return false;
  }
}

export const nativeCaseIds = Object.freeze(['cart-checkout', 'retry-queue']);
