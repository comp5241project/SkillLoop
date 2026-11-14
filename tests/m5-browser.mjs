import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startM4Stack } from './m4-local-stack.mjs';
import { checkout, retryQueue, client, publishCourse } from './m5-test-support.mjs';

test('real Chrome runs the published learning journey on all four student routes', { timeout: 180000 }, async (t) => {
  const stack = await startM4Stack(t);
  const call = client(stack);
  const { email, password } = stack.accounts.teacher;
  const teacher = await call('login', { body: { email, password } });
  const cart = await publishCourse(call, teacher, checkout, 'empty-cart', 'Published checkout lesson');
  const executablePath = process.env.M4_CHROME_PATH;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const teacherContext = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const studio = await teacherContext.newPage();
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  studio.on('pageerror', (error) => errors.push(error.message));
  studio.setDefaultTimeout(12000);
  await studio.goto(stack.base + '/enhancement-v2/studio/course/');
  await studio.getByLabel('Email').fill(email);
  await studio.getByLabel('Password').fill(password);
  await studio.getByRole('button', { name: 'Sign in' }).click();
  await studio.getByRole('button', { name: 'New draft' }).click();
  await studio.getByLabel('Case for a new draft').selectOption(retryQueue.caseId);
  await studio.getByRole('heading', { name: 'Retry queue backoff' }).waitFor();
  await studio.getByLabel('Course topic').fill('Trace the retry queue');
  await studio.getByLabel('Learning objective', { exact: true }).fill('Explain when the raw delay reaches the ceiling.');
  await studio.getByLabel('Teaching objective text').fill('Predict which scheduled delay hits the ceiling.');
  await studio.getByLabel('Published requirements').first().selectOption('backoff-cap');
  await studio.getByLabel('Title', { exact: true }).fill('Published retry lesson');
  await studio.getByLabel('Explanation', { exact: true }).fill('Trace the raw delay and the required maximum before choosing the scheduled value.');
  await studio.getByLabel('Public code excerpt').fill('return 100 * 2 ** attempt;');
  await studio.getByLabel('Code-reading prompt').fill('Trace the result for attempt four.');
  await studio.getByLabel('Exercise prompt').fill('What scheduled delay should the learner expect?');
  await studio.getByLabel('Published requirements').nth(1).selectOption('backoff-cap');
  await studio.getByLabel(/Teacher-only answer guidance/).fill('Expect the learner to describe the cap.');
  await studio.getByRole('button', { name: 'Save draft', exact: true }).click();
  await studio.getByText('Saved revision 1.', { exact: true }).waitFor();
  await studio.getByRole('button', { name: 'Review saved revision' }).click();
  await studio.getByLabel('I checked the requirements', { exact: false }).check();
  await studio.getByRole('button', { name: 'Approve this revision' }).click();
  studio.once('dialog', dialog => dialog.accept());
  await studio.getByRole('button', { name: 'Publish new version' }).click();
  const retryLink = studio.getByRole('link', { name: 'Version 1 · Published retry lesson' });
  await retryLink.waitFor();
  const retryUrl = new URL(await retryLink.getAttribute('href'));
  const retry = { id: retryUrl.searchParams.get('course'), version: retryUrl.searchParams.get('version') };
  const click = (name) => page.getByRole('button', { name, exact: true }).click();
  const heading = (name) => page.getByRole('heading', { name, exact: true }).waitFor();
  const next = async (name, path) => {
    await page.getByRole('link', { name, exact: true }).click();
    await page.waitForURL(url => url.pathname === path);
  };
  const begin = async (course) => {
    await page.goto(stack.base + '/enhancement-v2/studio/learner/?' + new URLSearchParams({ course: course.id, version: course.version }));
    await next('Start or resume the four-stage learning journey', '/learning-path/');
    if (await page.getByLabel('Email').isVisible()) {
      await page.getByLabel('Email').fill(stack.accounts.student.email);
      await page.getByLabel('Password').fill(stack.accounts.student.password);
      await click('Sign in');
    }
    await click('Start diagnosis');
    await heading('Check your understanding');
  };
  const diagnose = async (off) => {
    const selects = page.locator('main form select');
    for (const select of await selects.all()) await select.selectOption((await select.getAttribute('name')) === off ? 'off' : 'best');
    await click('Record diagnosis');
    await next('Continue to learning', '/knowledge-map/');
  };
  const learn = async (option, reason) => {
    await heading('Try a boundary');
    await page.locator('main form select').selectOption(String(option));
    await page.getByLabel('Explain your reasoning').fill(reason);
    await click('Check my reasoning');
    await next('Continue to repair', '/interview/');
  };
  const repair = async (choices) => {
    await heading('Repair dialogue');
    await page.getByLabel('Your question or repair request').fill('How can I show the selected boundary works?');
    await click('Ask for repair guidance');
    await page.getByText(/Local guide:/).waitFor();
    for (const item of await page.locator('main fieldset').all()) {
      const select = item.locator('select');
      const id = await select.getAttribute('name');
      await item.locator('textarea').fill('Apply the requirement and verify the relevant boundary.');
      await select.selectOption(String(choices[id]));
    }
    await click('Save repair plan');
    await next('Continue to verification', '/correction-lab/');
    await click('Run verification');
    await heading('All tests passed');
  };

  await begin(cart);
  await diagnose('cart-checkout-code-reading');
  await heading('Teacher-published explanation');
  await page.getByLabel('What must averagePrice([]) return?').waitFor();
  await publishCourse(call, teacher, checkout, 'discount', 'Newer checkout lesson', cart);
  await page.reload();
  await page.getByText(/Published checkout lesson · Course version 1/).waitFor();
  await learn(1, 'Empty input has count zero. The requirement says numeric zero.');
  await repair({ 'empty-cart': 2, 'discount-range': 0, 'negative-quantity': 1 });
  assert.equal(await page.locator('main li').filter({ hasText: / · pass · / }).count(), 8);
  await page.reload();
  await heading('All tests passed');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await context.clearCookies();
  await page.goto(stack.base + '/enhancement-v2/studio/learner/?' +
    new URLSearchParams({ course: cart.id, version: cart.version }));
  await next('Start or resume the four-stage learning journey', '/learning-path/');
  await page.getByLabel('Email').fill(stack.accounts['other-student'].email);
  await page.getByLabel('Password').fill(stack.accounts['other-student'].password);
  await click('Sign in');
  await click('Start diagnosis');
  await heading('Check your understanding');
  await diagnose('cart-checkout-edge-cases');
  await heading('Diagnosis-matched teaching · local template');
  await page.getByLabel('What happens when a customer enters a 101% discount?').waitFor();
  await learn(2, 'The input is over the inclusive upper boundary.');
  await repair({ 'empty-cart': 2, 'discount-range': 0, 'negative-quantity': 1 });

  await begin(retry);
  await diagnose('retry-cap-check');
  await page.getByLabel('What delay should be scheduled when the raw delay is 1,600 ms?').waitFor();
  await learn(1, 'Cap the delay at the maximum before scheduling.');
  await repair({ 'delay-cap': 0, 'invalid-attempt': 1 });
  assert.equal(await page.locator('main li').filter({ hasText: / · pass · / }).count(), 3);
  await studio.getByRole('button', { name: 'Reopen draft', exact: true }).click();
  await studio.getByText('1 diagnosed · 1 practised · 1 ran verification').waitFor();
  assert.deepEqual(errors, []);
});
