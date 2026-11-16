import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startM4Stack } from './m4-local-stack.mjs';

const web = '/enhancement-v3/web/';
const live = process.env.V3_LIVE_AI === '1';
const source = fileURLToPath(new URL('../docs/enhancement-v3/cart-checkout-source.txt', import.meta.url));

test('Chrome: teacher publication → two real diagnoses → different AI lessons → trusted verification', { timeout: 240000 }, async t => {
  const stack = await startM4Stack(t, { appImports: live ? [] : [new URL('./enhancement-v3-ai-fixture.mjs', import.meta.url).href] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.M4_CHROME_PATH });
  t.after(() => browser.close());
  const teacher = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  const studentA = await browser.newPage({ viewport: { width: 375, height: 850 }, isMobile: true, deviceScaleFactor: 1, hasTouch: true });
  const studentB = await browser.newPage({ viewport: { width: 1240, height: 850 } });
  const errors = [];
  for (const page of [teacher, studentA, studentB]) page.on('pageerror', err => errors.push(err.message));
  const snap = async (page, name) => {
    if (process.env.V3_SCREENSHOTS) {
      await mkdir(process.env.V3_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: join(process.env.V3_SCREENSHOTS, name + '.png'), fullPage: true });
    }
  };
  const click = (page, name, role = 'button') => page.getByRole(role, { name, exact: true }).first().click({ timeout: 45000 });
  const heading = (page, name) => page.getByRole('heading', { name }).first().waitFor({ timeout: 45000 });
  const signIn = async (page, name) => {
    const account = stack.accounts[name];
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.locator('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  };
  await teacher.goto(stack.base + web + 'studio.html');
  await signIn(teacher, 'teacher');
  await teacher.locator('input[type=file]').setInputFiles(source);
  await click(teacher, 'Extract document text');
  await teacher.getByText('Text extracted', { exact: true }).waitFor();
  await click(teacher, 'Review knowledge');
  await click(teacher, 'Generate knowledge notes');
  await teacher.getByLabel('Course title').waitFor({ timeout: 45000 });
  await teacher.getByLabel('Course title').fill('Cart checkout boundary practice');
  await click(teacher, 'Save draft');
  await teacher.getByText('Draft saved.', { exact: true }).waitFor();
  await teacher.reload();
  assert.equal(await teacher.getByLabel('Course title').inputValue(), 'Cart checkout boundary practice');
  await snap(teacher, 'teacher-review');
  const find = teacher.waitForResponse(response => new URL(response.url()).searchParams.get('op') === 'v3-match', { timeout: 34000 });
  await click(teacher, 'Save and find cases');
  const matchedResponse = await find;
  const matched = await matchedResponse.json();
  assert.equal(matchedResponse.status(), 200, JSON.stringify({ error: matched.error, code: matched.code }));
  assert.ok(matched.choices.some(choice => choice.caseId === 'cart-checkout' &&
    ['empty-cart', 'discount'].every(req => choice.mapping.some(item => item.requirementId === req))),
    JSON.stringify(matched.choices));
  await heading(teacher, /Match a trusted case/);
  await teacher.getByRole('button', { name: 'Confirm this case and coverage' }).first().click();
  await heading(teacher, 'Student preview');
  await teacher.getByRole('checkbox').check();
  await click(teacher, 'Approve this version');
  await click(teacher, 'Publish approved version');
  await teacher.getByRole('link', { name: 'View published course' }).waitFor();

  function getViewport(page) {
    return page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  }
  async function learner(page, account, wrongQuestion) {
    await page.goto(stack.base + '/');
    await click(page, 'Browse Courses', 'link');
    await heading(page, 'Cart checkout boundary practice');
    await click(page, 'View course', 'link');
    await click(page, 'Start Learning');
    await signIn(page, account);
    await heading(page, 'Check your understanding');
    for (const select of await page.locator('main form select').all()) {
      await select.selectOption((await select.getAttribute('name')) === wrongQuestion ? 'off' : 'best');
    }
    await click(page, 'Record diagnosis');
    await click(page, 'Open personalized lesson', 'link');
    await heading(page, 'AI Personalized Learning');
    const make = page.waitForResponse(response => new URL(response.url()).searchParams.get('op') === 'v3-generate-lesson', { timeout: 34000 });
    await click(page, 'Generate personalized lesson');
    const generatedResponse = await make;
    const generated = await generatedResponse.json();
    assert.equal(generatedResponse.status(), 200, JSON.stringify({ error: generated.error, code: generated.code }));
    assert.ok(generated.lesson, generated.generationError);
    await heading(page, 'Supplemental practice');
    const keys = await page.evaluate(async () => {
      const query = new URLSearchParams(location.search);
      query.set('op', 'v3-lesson');
      const value = await (await fetch('/api/courses/?' + query)).json();
      return { id: value.context.requirement.id, model: value.lesson.model, source: value.lesson.aiSource,
        practice: value.lesson.practicePrompt, explanation: value.lesson.explanation, references: value.lesson.sourceReferences };
    });
    assert.equal(keys.source, 'api');
    assert.equal(keys.model === 'v3-test-model', !live);
    assert.ok(keys.references.length);
    await page.reload();
    await heading(page, 'Supplemental practice');
    assert.ok(await page.getByText(keys.practice, { exact: true }).isVisible());
    const { width, content } = await getViewport(page);
    assert.ok(content <= width, 'Lesson must fit its viewport');
    return keys;
  }

  const first = await learner(studentA, 'student', 'cart-checkout-code-reading');
  await snap(studentA, 'learner-mobile');
  const second = await learner(studentB, 'other-student', 'cart-checkout-edge-cases');
  await snap(studentB, 'learner-desktop');
  assert.deepEqual([first.id, second.id], ['empty-cart', 'discount']);
  assert.notEqual(first.explanation, second.explanation);
  assert.notEqual(first.practice, second.practice);
  t.diagnostic('Provider: ' + (live ? first.model : 'fixture') + '; diagnosis targets: ' + first.id + ', ' + second.id);
  t.diagnostic('Practice A: ' + first.practice + ' | Practice B: ' + second.practice);

  async function verify(page, option, reason) {
    await page.getByLabel('Your reasoning').fill(reason);
    const sent = page.waitForResponse(response => new URL(response.url()).searchParams.get('op') === 'v3-answer', { timeout: 35000 });
    await click(page, 'Save answer and get feedback');
    const modelResponse = await sent;
    const saved = await modelResponse.json();
    assert.equal(modelResponse.status(), 200, JSON.stringify({ error: saved.error, code: saved.code }));
    assert.equal(saved.answer, reason);
    if (saved.feedback) await heading(page, 'AI feedback');
    else {
      assert.ok(live, saved.feedbackError);
      assert.ok(saved.feedbackError);
      t.diagnostic('Feedback recovery verified: ' + saved.feedbackError);
      await page.reload();
      assert.equal(await page.getByLabel('Your reasoning').inputValue(), reason);
      await page.getByRole('button', { name: 'Retry feedback' }).waitFor();
    }
    await click(page, 'Continue to Case Learning', 'link');
    await heading(page, 'Try a boundary');
    await page.locator('main form select').selectOption(String(option));
    await page.getByLabel('Explain your reasoning').fill(reason);
    await click(page, 'Check my reasoning');
    await click(page, 'Continue to repair', 'link');
    await heading(page, 'Repair dialogue');
    await page.getByLabel('Your question or repair request').fill('How can I check that the boundary is correctly handled?');
    await click(page, 'Ask for repair guidance');
    await page.getByText(/Local guide:/).waitFor();
    for (const item of await page.locator('main fieldset').all()) {
      const select = item.locator('select');
      const id = await select.getAttribute('name');
      await item.locator('textarea').fill('Apply the requirement and verify the relevant boundary.');
      await select.selectOption(String({ 'empty-cart': 2, 'discount-range': 0, 'negative-quantity': 1 }[id]));
    }
    await click(page, 'Save repair plan');
    await click(page, 'Continue to verification', 'link');
    await click(page, 'Run verification');
    await heading(page, 'All tests passed');
    assert.equal(await page.locator('main li').filter({ hasText: / · pass · / }).count(), 8);
    await page.goto(stack.base + '/');
    await heading(page, 'My Learning');
    await page.getByText('Verification: passed', { exact: true }).waitFor();
    return Boolean(saved.feedback);
  }
  const feedbackA = await verify(studentA, 1, 'For an empty cart, return numeric zero before division.');
  const feedbackB = await verify(studentB, 2, 'Reject discounts outside 0 to 100 inclusive. Both endpoints are accepted.');
  assert.ok(feedbackA || feedbackB, 'At least one student receives real coaching feedback.');
  assert.deepEqual(errors, []);
});
