/**
 * Run: node --test correction-lab/*.test.cjs
 * Checks part 4 against the team materials in docs/team-samples and runs every case for real.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const runner = require('./break-runner.js');
const sync = require('./sync-shared.cjs');
const shared = require('./shared-samples.js');

global.window = {};
require('./levels.js');
const levels = global.window.SkillLoopLevels;
const source = JSON.parse(fs.readFileSync(sync.sourceFile, 'utf8'));
const squash = (code) => code.replace(/\s+/g, '');
const STATUSES = ['pass', 'fail', 'error', 'not_run'];

test('shared-samples.js is up to date with docs/team-samples/samples.json', () => {
  assert.equal(fs.readFileSync(sync.targetFile, 'utf8'), sync.build(source), 'run: node correction-lab/sync-shared.cjs');
});

test('part 3 sample outputs pass the dialogue check; broken ones are refused with reasons', () => {
  for (const [caseId, sample] of Object.entries(source.samples)) {
    const item = source.cases[caseId];
    const output = sample.part3.output;
    const ok = runner.checkDialogue(output, item);
    assert.deepEqual(ok.problems, [], caseId);
    assert.equal(ok.dialogue.plan.length, item.issues.length);
    const copy = () => JSON.parse(JSON.stringify(output));
    const broken = [
      [null, /no part 3/],
      [{ ...copy(), caseId: 'other' }, /not "/],
      [{ ...copy(), aiSource: 'model' }, /aiSource/],
      [{ ...copy(), dialogue: { ...copy().dialogue, confirmed: false } }, /not confirmed/],
      [{ ...copy(), dialogue: { ...copy().dialogue, plan: copy().dialogue.plan.slice(1) } }, /does not cover/],
      [{ ...copy(), dialogue: { ...copy().dialogue, plan: [...copy().dialogue.plan, copy().dialogue.plan[0]] } }, /repeats/],
    ];
    const badTest = copy();
    badTest.dialogue.plan[0].checks[0].testId = 'made-up';
    broken.push([badTest, /unknown testId/]);
    const noRequest = copy();
    noRequest.dialogue.plan[0].changeRequest = ' ';
    broken.push([noRequest, /no change request/]);
    for (const [bad, reason] of broken) {
      const result = runner.checkDialogue(bad, item);
      assert.equal(result.dialogue, undefined, `${caseId} ${reason}`);
      assert.match(result.problems.join(' '), reason);
    }
  }
});

test("part 3's codeReview store gives the most recently confirmed plan for the case", () => {
  const output = (caseId, tag) => ({ caseId, aiSource: 'api', dialogue: { tag } });
  const session = (caseId, tag, at, extra = {}) => ({
    confirmed: true, pending: false, output: output(caseId, tag), revisions: at ? [{ at, output: output(caseId, tag) }] : [], ...extra,
  });
  const records = [
    session('notes-save', 'newer', '2026-11-13T10:00:00Z'),
    session('notes-save', 'older', '2026-11-13T09:00:00Z'),
    session('notes-save', 'draft', '2026-11-13T11:00:00Z', { confirmed: false, output: null }),
    session('notes-save', 'waiting', '2026-11-13T12:00:00Z', { pending: true }),
    session('cart-checkout', 'cart', '2026-11-13T13:00:00Z'),
    null,
    'garbage',
  ];
  assert.equal(runner.latestPart3(records, 'notes-save').dialogue.tag, 'newer');
  assert.equal(runner.latestPart3(records, 'cart-checkout').dialogue.tag, 'cart');
  assert.equal(runner.latestPart3(records, 'quiz-permissions'), null);
  // Without timestamps the later record in the list wins.
  assert.equal(runner.latestPart3([session('notes-save', 'a'), session('notes-save', 'b')], 'notes-save').dialogue.tag, 'b');
  for (const bad of [null, undefined, {}, 'x', 3]) assert.equal(runner.latestPart3(bad, 'notes-save'), null);
});

test('the three shared cases are all runnable here', () => {
  assert.deepEqual(Object.keys(levels).sort(), Object.keys(source.cases).sort());
});

for (const [caseId, level] of Object.entries(levels)) {
  const item = source.cases[caseId];
  const testIds = item.tests.map((spec) => spec.testId);
  const issueIds = item.issues.map((issue) => issue.issueId);
  const best = Object.fromEntries(issueIds.map((id) => [id, level.repair.fixes[id].findIndex((fix) => fix.correct)]));
  const run = (code) => runner.runTests(code, level.fns, level.checks);
  const failing = async (code) => (await run(code)).filter((r) => r.status !== 'pass').map((r) => r.testId);

  test(`${caseId}: checks use exactly the shared test IDs, in order`, () => {
    assert.deepEqual(level.checks.map((check) => check.testId), testIds);
  });

  test(`${caseId}: repair options and questions use exactly the shared issue IDs`, () => {
    assert.deepEqual(Object.keys(level.repair.fixes).sort(), [...issueIds].sort());
    assert.deepEqual(Object.keys(level.explain).sort(), [...issueIds].sort());
    Object.keys(level.detectors).forEach((id) => assert.ok(issueIds.includes(id), id));
    for (const id of issueIds) {
      assert.equal(level.repair.fixes[id].length, 3);
      assert.equal(level.repair.fixes[id].filter((fix) => fix.correct).length, 1);
      level.repair.fixes[id].filter((fix) => !fix.correct).forEach((fix) => assert.ok(fix.why));
      assert.ok([0, 1, 2].includes(level.explain[id].answer));
    }
  });

  test(`${caseId}: the template with no repair is the shared starter code`, () => {
    assert.equal(squash(runner.assemble(level, {})), squash(item.starterCode));
  });

  test(`${caseId}: results have the handoff shape and the starter code needs revision`, async () => {
    const results = await run(item.starterCode);
    assert.deepEqual(results.map((r) => r.testId), testIds);
    results.forEach((r) => {
      assert.deepEqual(Object.keys(r), ['testId', 'status', 'actual']);
      assert.ok(STATUSES.includes(r.status));
      assert.equal(typeof r.actual, 'string');
    });
    assert.equal(runner.outcome(results), 'needs_revision');
    // Tests that guard existing behaviour already pass on the starter code.
    item.tests.filter((spec) => spec.issueId === null).forEach((spec) => {
      assert.equal(results.find((r) => r.testId === spec.testId).status, 'pass', spec.testId);
    });
  });

  test(`${caseId}: the shared reference code passes every test`, async () => {
    assert.deepEqual(await failing(item.referenceCode), []);
    assert.equal(runner.outcome(await run(item.referenceCode)), 'passed');
  });

  test(`${caseId}: choosing every correct repair passes every test`, async () => {
    assert.deepEqual(await failing(runner.assemble(level, best)), []);
  });

  test(`${caseId}: every wrong repair, and every skipped issue, leaves a test of that issue failing`, async () => {
    for (const id of issueIds) {
      const own = item.tests.filter((spec) => spec.issueId === id).map((spec) => spec.testId);
      const skipped = { ...best };
      delete skipped[id];
      assert.ok((await failing(runner.assemble(level, skipped))).some((t) => own.includes(t)), `${id} skipped`);
      for (const [index, fix] of level.repair.fixes[id].entries()) {
        if (fix.correct) continue;
        const results = await run(runner.assemble(level, { ...best, [id]: index }));
        assert.ok(results.every((r) => r.status !== 'error'), `${id} option ${index} must still run`);
        assert.ok(results.some((r) => r.status === 'fail'), `${id} option ${index}`);
      }
    }
  });

  test(`${caseId}: the sample plan only refers to this case's issues and tests`, () => {
    const dialogue = shared.sampleDialogues[caseId];
    assert.equal(dialogue.confirmed, true);
    for (const step of dialogue.plan) {
      assert.ok(issueIds.includes(step.issueId));
      step.checks.forEach((check) => assert.ok(testIds.includes(check.testId)));
    }
  });
}

test('cart: detectors fire on the starter code and not on the reference', () => {
  const level = levels['cart-checkout'];
  const calls = {
    'negative-quantity': ['cartTotal', [[{ price: 19.99, qty: -3 }], 0]],
    'discount-range': ['cartTotal', [[{ price: 9.99, qty: 1 }], 150]],
    'empty-cart': ['averagePrice', [[]]],
  };
  for (const [issueId, [fn, args]] of Object.entries(calls)) {
    const seen = (code) => {
      let result;
      let error = null;
      try {
        result = runner.load(code, level.fns)[fn](...args);
      } catch (thrown) {
        error = thrown;
      }
      return runner.detects(level.detectors[issueId].detect, args, result, error);
    };
    assert.equal(level.detectors[issueId].fn, fn);
    assert.equal(seen(source.cases['cart-checkout'].starterCode), true, issueId);
    assert.equal(seen(source.cases['cart-checkout'].referenceCode), false, issueId);
  }
});

test('outcome follows the handoff rule', () => {
  const t = (...statuses) => statuses.map((status, i) => ({ testId: `t${i}`, status, actual: '' }));
  assert.equal(runner.outcome(t('pass', 'pass')), 'passed');
  assert.equal(runner.outcome(t('pass', 'fail', 'error')), 'needs_revision');
  assert.equal(runner.outcome(t('pass', 'error')), 'inconclusive');
  assert.equal(runner.outcome(t('pass', 'not_run')), 'inconclusive');
  assert.equal(runner.outcome([]), 'inconclusive');
});

test('code that cannot be loaded gives error for every test, not fail', async () => {
  const level = levels['cart-checkout'];
  const results = await runner.runTests('function (', level.fns, level.checks);
  assert.ok(results.every((r) => r.status === 'error'));
  assert.equal(runner.outcome(results), 'inconclusive');
});
