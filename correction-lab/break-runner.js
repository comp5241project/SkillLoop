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

  // Longest text accepted in a part 3 plan field, the same limit part 3 uses.
  const TEXT_LIMIT = 1000;

  /**
   * Check part 3's output before this part uses it: same case, confirmed by the learner,
   * one plan item per issue of the case, and only test IDs of the case. Returns the plan
   * with known fields only, or the problems found. Wrong change requests are allowed; the
   * tests are there to expose them.
   */
  function checkDialogue(output, item) {
    const problems = [];
    // Says what is wrong with one text field, or nothing when it is fine.
    const text = (value, where, label) => {
      if (typeof value !== 'string' || !value.trim()) return `${where} has no ${label}.`;
      if (value.length > TEXT_LIMIT) return `${where}: the ${label} is too long (${value.length} characters, at most ${TEXT_LIMIT}).`;
      return '';
    };
    const add = (problem) => problem && problems.push(problem);
    const dialogue = output && typeof output === 'object' ? output.dialogue : null;
    if (!output || typeof output !== 'object') return { problems: ['There is no part 3 output.'] };
    // A plan for another case cannot be checked item by item; say only that.
    if (output.caseId !== item.caseId) return { problems: [`It is for case "${output.caseId}", not "${item.caseId}".`] };
    if (!['sample', 'api'].includes(output.aiSource)) problems.push('aiSource must be sample or api.');
    if (!dialogue || typeof dialogue !== 'object') return { problems: problems.concat('The dialogue is missing.') };
    if (dialogue.confirmed !== true) problems.push('The learner has not confirmed the plan yet.');
    if (typeof dialogue.feedback !== 'string') problems.push('feedback must be a string.');
    const issueIds = item.issues.map((issue) => issue.issueId);
    const testIds = item.tests.map((test) => test.testId);
    const plan = Array.isArray(dialogue.plan) ? dialogue.plan : [];
    if (!Array.isArray(dialogue.plan)) problems.push('plan must be an array.');
    const seen = [];
    plan.forEach((step, index) => {
      const where = `Plan item ${index + 1}`;
      if (!step || typeof step !== 'object') return problems.push(`${where} is not an object.`);
      if (!issueIds.includes(step.issueId)) problems.push(`${where} has an unknown issueId "${step.issueId}".`);
      else if (seen.includes(step.issueId)) problems.push(`${where} repeats issue "${step.issueId}".`);
      seen.push(step.issueId);
      add(text(step.problem, where, 'problem description'));
      add(text(step.changeRequest, where, 'change request'));
      const checks = Array.isArray(step.checks) ? step.checks : [];
      if (!checks.length) problems.push(`${where} has no checks.`);
      checks.forEach((check) => {
        if (!check || !testIds.includes(check.testId)) return problems.push(`${where} has an unknown testId "${check && check.testId}".`);
        add(text(check.input, `${where}, check "${check.testId}",`, 'input'));
        add(text(check.expected, `${where}, check "${check.testId}",`, 'expected result'));
      });
    });
    issueIds
      .filter((id) => !seen.includes(id))
      .forEach((id) => problems.push(`The plan does not cover issue "${id}".`));
    if (problems.length) return { problems };
    return {
      problems,
      dialogue: {
        plan: plan.map((step) => ({
          issueId: step.issueId,
          problem: step.problem,
          changeRequest: step.changeRequest,
          checks: step.checks.map(({ testId, input, expected }) => ({ testId, input, expected })),
        })),
        feedback: dialogue.feedback,
        confirmed: true,
      },
    };
  }

  /**
   * Part 3 keeps its reviews in the `codeReview` store: an array of sessions, each with
   * `output` once the learner confirms the plan. Returns the output of the most recently
   * confirmed session for this case, or null. checkDialogue still decides whether it is usable.
   */
  function latestPart3(records, caseId) {
    if (!Array.isArray(records)) return null;
    const confirmedAt = (session) => {
      const last = Array.isArray(session.revisions) ? session.revisions[session.revisions.length - 1] : null;
      const time = last ? Date.parse(last.at) : NaN;
      return Number.isNaN(time) ? 0 : time;
    };
    let best = null;
    records.forEach((session, index) => {
      if (!session || session.confirmed !== true || session.pending === true) return;
      const output = session.output;
      if (!output || typeof output !== 'object' || output.caseId !== caseId) return;
      const rank = [confirmedAt(session), index];
      if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) best = { rank, output };
    });
    return best ? best.output : null;
  }

  const api = { load, runTests, outcome, detects, assemble, checkDialogue, latestPart3, TEXT_LIMIT, helpers };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkillLoopRunner = api;
})(typeof self === 'object' ? self : globalThis);
