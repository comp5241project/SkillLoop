/**
 * Runs a case's fixed tests against the learner's code and builds the code for a chosen repair.
 * Used by break-worker.js in the browser (so code that never finishes can be stopped) and by
 * the Node tests. A test's status comes from executing the code, never from an AI.
 */
(function (root) {
  const approx = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.005;
  const money = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : String(n));
  // Calls fn and reports whether it refused with a readable message.
  const refusal = (fn) => {
    try {
      return { rejected: false, value: fn() };
    } catch (error) {
      const message = error && typeof error.message === 'string' ? error.message.trim() : '';
      return { rejected: true, message };
    }
  };
  /** A save service the test controls: nothing is stored until resolve() is called. */
  const fakeApi = () => {
    let pending = null;
    const stored = [];
    return {
      stored,
      save(text) {
        return new Promise((resolve, reject) => {
          pending = { resolve, reject, text };
        });
      },
      isPending: () => Boolean(pending),
      resolve() {
        if (!pending) return false;
        const { resolve, text } = pending;
        pending = null;
        stored.push(text);
        resolve();
        return true;
      },
      reject() {
        if (!pending) return false;
        const { reject } = pending;
        pending = null;
        reject(new Error('Network error'));
        return true;
      },
    };
  };
  const helpers = { approx, money, refusal, fakeApi };

  // Evaluate the code once and hand back the named functions it defines.
  function load(code, fns) {
    const exported = fns.map((name) => `${name}: typeof ${name} === 'function' ? ${name} : undefined`);
    return new Function(`${code}\nreturn { ${exported.join(', ')} };`)();
  }

  /**
   * Returns one { testId, status, actual } per check. status is pass or fail when the check
   * ran, and error when the code could not be loaded or the check itself threw.
   */
  async function runTests(code, fns, checks) {
    let api;
    try {
      api = load(code, fns);
    } catch (error) {
      const actual = `The code could not run: ${error.message}`;
      return checks.map((check) => ({ testId: check.testId, status: 'error', actual }));
    }
    const results = [];
    for (const check of checks) {
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const outcome = await new AsyncFunction('api', 'h', check.run)(api, helpers);
        results.push({ testId: check.testId, status: outcome.pass === true ? 'pass' : 'fail', actual: String(outcome.actual) });
      } catch (error) {
        results.push({ testId: check.testId, status: 'error', actual: `The test could not finish: ${error.message}` });
      }
    }
    return results;
  }

  /** The handoff rule: any fail needs revision; otherwise any error or not_run is inconclusive. */
  function outcome(tests) {
    if (tests.some((test) => test.status === 'fail')) return 'needs_revision';
    if (!tests.length || tests.some((test) => test.status !== 'pass')) return 'inconclusive';
    return 'passed';
  }

  // True when one call to a watched function shows the issue.
  function detects(expression, args, result, error) {
    try {
      return Boolean(new Function('args', 'result', 'error', `return (${expression});`)(args, result, error));
    } catch (_) {
      return false;
    }
  }

  /**
   * Build the code for a set of repair choices. The template holds slots written as
   * a comment line (issue ID, colon, slot name); a chosen fix fills its issue's slots and
   * an issue without a choice keeps the original lines from repair.defaults.
   */
  function assemble(level, choices) {
    return level.repair.template
      .split('\n')
      .flatMap((line) => {
        const slot = /^\/\*([a-z-]+):([a-z]+)\*\/$/.exec(line.trim());
        if (!slot) return [line];
        const [, issueId, name] = slot;
        const fix = level.repair.fixes[issueId] && level.repair.fixes[issueId][choices[issueId]];
        const text = fix ? fix.parts[name] : level.repair.defaults[`${issueId}:${name}`];
        return text ? text.split('\n') : [];
      })
      .join('\n');
  }

  const api = { load, runTests, outcome, detects, assemble, helpers };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkillLoopRunner = api;
})(typeof self === 'object' ? self : globalThis);
