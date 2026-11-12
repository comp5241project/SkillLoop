/** Run: node --test correction-lab/*.test.cjs. Checks every "break the app" level by running it. */
const test = require('node:test');
const assert = require('node:assert/strict');
const runner = require('./break-runner.js');

global.window = {};
require('./levels.js');
const levels = global.window.SkillLoopLevels;

// One call per bug that a learner could cause through the app's UI.
const triggers = {
  'negative-quantity': (api) => api.cartTotal([{ price: 19.99, qty: -3 }], 0),
  'discount-range': (api) => api.cartTotal([{ price: 9.99, qty: 1 }], 150),
  'empty-cart': (api) => api.averagePrice([]),
  'hidden-button-only': (api) => api.canDeleteQuizzes({ user: 'alice', role: 'student' }),
  'password-boundary': (api) => api.isValidPassword('abcdefgh'),
  'no-lockout': (api) => api.login('alice', 'wrong', 5),
};

// Record the watched call the way the sandbox harness does, then ask the detector.
function fires(level, bug, code) {
  const api = runner.load(code, level.fns);
  let seen = false;
  const original = api[bug.fn];
  api[bug.fn] = (...args) => {
    let result;
    let error = null;
    try {
      result = original(...args);
    } catch (thrown) {
      error = thrown;
    }
    seen = seen || runner.detects(bug, args, result, error);
    if (error) throw error;
    return result;
  };
  try {
    triggers[bug.id](api);
  } catch (_) {
    /* A fixed version may reject the input; that is not the bug. */
  }
  return seen;
}

for (const level of levels) {
  test(`${level.id}: the AI-written code fails some hidden tests`, () => {
    const { results } = runner.runTests(level.code, level.fns, level.tests);
    assert.ok(results.some((r) => !r.ok));
    assert.ok(results.some((r) => r.ok), 'the happy path should already work');
  });

  test(`${level.id}: the reference fix passes every hidden test`, () => {
    const { results, error } = runner.runTests(level.reference, level.fns, level.tests);
    assert.equal(error, undefined);
    assert.deepEqual(results.filter((r) => !r.ok), []);
  });

  for (const bug of level.bugs) {
    test(`${level.id}: "${bug.id}" can be triggered, and not after the fix`, () => {
      assert.ok(triggers[bug.id], 'add a trigger for this bug');
      assert.equal(fires(level, bug, level.code), true);
      assert.equal(fires(level, bug, level.reference), false);
    });
  }

  test(`${level.id}: the lesson question has a valid answer`, () => {
    assert.equal(level.lesson.options.length, 3);
    assert.ok([0, 1, 2].includes(level.lesson.answer));
  });
}

test('broken code reports a syntax error instead of crashing', () => {
  const out = runner.runTests('function (', ['x'], [{ name: 't', check: 'true' }]);
  assert.match(out.error, /./);
});
