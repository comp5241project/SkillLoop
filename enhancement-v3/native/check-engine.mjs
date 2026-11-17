import { getQuickJS } from 'quickjs-emscripten';

const approx = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.005;
const money = n => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : String(n));
class GuestError extends Error {}
const refusal = fn => {
  try { return { rejected: false, value: fn() }; }
  catch (error) {
    if (!(error instanceof GuestError)) throw error;
    return { rejected: true, message: error.message.trim() };
  }
};
const helpers = Object.freeze({ approx, money, refusal });
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function runRegisteredChecks({ code, fns, checks }) {
  const quick = await getQuickJS();
  const runtime = quick.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 2000;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  const unwrap = result => {
    if (!result.error) return result.value;
    try {
      if (Date.now() >= deadline) throw new Error('The code exceeded the execution limit.');
      const message = vm.getProp(result.error, 'message');
      try {
        throw new GuestError(vm.typeof(message) === 'string' ? vm.getString(message).slice(0, 160) : '');
      } finally { message.dispose(); }
    } finally { result.error.dispose(); }
  };
  let functions;
  try {
    // Return the function table from the guest. No host function, filesystem, or network is exposed in it.
    const exportCode = fns.map(name => `typeof ${name} === 'function' ? ${name} : undefined`).join(',');
    functions = unwrap(vm.evalCode(`(function () {\n${code}\n; return [${exportCode}];\n})()`, 'submission.js'));
    const api = Object.fromEntries(fns.map((name, index) => [name, (...args) => {
      const fn = vm.getProp(functions, index);
      let values;
      let result;
      try {
        if (vm.typeof(fn) !== 'function') throw new Error('Expected case function is missing.');
        // The arguments are bounded, maintainer-owned fixture values.
        values = unwrap(vm.evalCode('(' + JSON.stringify(args) + ')'));
        const handles = args.map((_, i) => vm.getProp(values, i));
        try { result = unwrap(vm.callFunction(fn, vm.undefined, handles)); }
        finally { handles.forEach(handle => handle.dispose()); }
        // The supported case functions return scalars. Read them without guest serialization hooks.
        if (vm.typeof(result) === 'number') return vm.getNumber(result);
        if (vm.typeof(result) === 'string') return vm.getString(result).slice(0, 300);
        if (vm.typeof(result) === 'boolean') return vm.eq(result, vm.true);
        if (vm.eq(result, vm.null)) return null;
        if (vm.eq(result, vm.undefined)) return undefined;
        return '[non-scalar result]';
      } finally {
        result?.dispose();
        values?.dispose();
        fn.dispose();
      }
    }]));
    const results = [];
    for (const check of checks) {
      try {
        // Only the server's registered fixture is compiled in the harness.
        const result = await new AsyncFunction('api', 'h', check.run)(api, helpers);
        results.push({ testId: check.testId, status: result.pass === true ? 'pass' : 'fail',
          actual: String(result.actual).slice(0, 300) });
      } catch {
        results.push({ testId: check.testId, status: 'error', actual: 'The submitted code could not finish this check.' });
      }
    }
    return results;
  } catch {
    return checks.map(({ testId }) => ({ testId, status: 'error', actual: 'The submitted code could not load.' }));
  } finally {
    functions?.dispose();
    vm.dispose();
    runtime.dispose();
  }
}
