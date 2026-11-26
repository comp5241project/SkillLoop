import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startM4Stack } from './m4-local-stack.mjs';
import data from '../learning-path/data.js';
import diagnosis from '../learning-path/diagnosis-model.js';

test('all standalone Part 2 entries use topic tabs and a keyboard-accessible review drawer', { timeout: 120000 }, async t => {
  const stack = await startM4Stack(t);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.M4_CHROME_PATH });
  t.after(() => browser.close());
  for (const recorded of [false, true]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (recorded) {
      const item = data.findCase('cart-checkout');
      const responses = item.questions.map(q => ({ questionId: q.id,
        optionId: q.options.find(option => option.score === 0).id, explanation: '' }));
      const record = { schemaVersion: 2, caseId: item.id, learner: { background: 'student', goal: 'build' },
        responses, result: diagnosis.buildLocalDiagnosis(item, responses), source: 'local', questionSource: 'authored',
        updatedAt: '2026-11-26T00:00:00Z' };
      await page.addInitScript(record => {
        if (localStorage.getItem('skillloop.v1.learningPathDiagnosis')) return;
        localStorage.setItem('skillloop.v1.learningPathDiagnosis', JSON.stringify(record));
        localStorage.setItem('skillloop.v1.learningProgress', JSON.stringify({
          id: 'ui-regression', source: 'authored-fallback', lessons: null, entries: {},
          caseId: record.caseId, diagnosisUpdatedAt: record.updatedAt,
        }));
      }, record);
    }
    await page.goto(stack.base + '/knowledge-map/');
    if (!recorded) await page.getByRole('button', { name: 'Try a sample case' }).click();
    await page.locator('.learning-card:visible').waitFor();
    const open = page.locator('#learning-review-open');
    const drawer = page.getByRole('dialog', { name: 'Review & continue' });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator('main.learning-published > .learning-header').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await open.click();
      await drawer.getByText('Not practiced', { exact: true }).first().waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await open.evaluate(node => node === document.activeElement), true);
    }
    await open.click();
    await drawer.locator('#summary-content a').last().click();
    assert.equal(await drawer.isVisible(), false);
    await page.locator('#learning-review-end').waitFor();
    const cards = await page.locator('#learning-priorities a').count();
    for (let index = 0; index < cards; index++) {
      await page.locator('#learning-priorities a').nth(index).click();
      const card = page.locator('.learning-card:visible');
      const radios = card.locator('input[type=radio]');
      if (await radios.count()) await radios.first().check();
      else await card.locator('textarea').fill('Check the boundary condition against the expected requirement.');
      await card.getByRole('button', { name: 'Check answer' }).click();
      await card.locator('.learning-feedback h4').waitFor();
    }
    await open.click();
    assert.equal(await drawer.locator('.learning-topic-status .learning-verdict').count(), cards);
    if (recorded) await drawer.getByRole('link', { name: 'Continue to AI dialogue' }).waitFor();
    await page.keyboard.press('Escape');
    if (recorded) {
      await page.reload();
      await open.click();
      assert.equal(await drawer.locator('.learning-topic-status .learning-verdict').count(), cards);
      await drawer.getByRole('link', { name: 'Continue to AI dialogue' }).waitFor();
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});
