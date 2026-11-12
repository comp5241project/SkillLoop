/**
 * Runs a level's hidden tests against a learner's code. Used by break-worker.js in the browser
 * (so a runaway loop can be stopped) and by the Node tests. The verdict comes from executing
 * the code, not from an AI.
 */
(function (root) {
  const approx = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.005;
  const throws = (fn) => {
    try {
      fn();
    } catch (_) {
      return true;
    }
    return false;
  };

  // Evaluate the code once and hand back the named functions it defines.
  function load(code, fns) {
    const exported = fns.map((name) => `${name}: typeof ${name} === 'function' ? ${name} : undefined`);
    return new Function(`${code}\nreturn { ${exported.join(', ')} };`)();
  }

  function runTests(code, fns, tests) {
    let api;
    try {
      api = load(code, fns);
    } catch (error) {
      return { error: String(error.message) };
    }
    return {
      results: tests.map((test) => {
        try {
          const check = new Function('api', 'approx', 'throws', `return (${test.check});`);
          return { name: test.name, ok: check(api, approx, throws) === true };
        } catch (error) {
          return { name: test.name, ok: false, error: String(error.message) };
        }
      }),
    };
  }

  // True when one call to a watched function shows the bug.
  function detects(bug, args, result, error) {
    try {
      return Boolean(new Function('args', 'result', 'error', `return (${bug.detect});`)(args, result, error));
    } catch (_) {
      return false;
    }
  }

  const api = { load, runTests, detects };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkillLoopRunner = api;
})(typeof self === 'object' ? self : globalThis);
