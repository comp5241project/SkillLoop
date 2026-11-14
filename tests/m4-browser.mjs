import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startM4Stack } from './m4-local-stack.mjs';

const chromePath = process.env.M4_CHROME_PATH;
const visible = async (locator) => locator.waitFor({ state: 'visible' });

async function signIn(page, account, formId) {
  const form = page.locator(formId);
  await form.getByLabel('Email').fill(account.email);
  await form.getByLabel('Password').fill(account.password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('real Chromium teacher and student publication journey', { timeout: 180000 }, async (t) => {
  const stack = await startM4Stack(t);
  const browser = await chromium.launch({ ...(chromePath ? { executablePath: chromePath } : {}), headless: true });
  t.after(() => browser.close());
  const teacherContext = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const learnerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const teacher = await teacherContext.newPage();
  const learner = await learnerContext.newPage();
  const errors = [];
  for (const page of [teacher, learner]) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15000);
  }

  await teacher.goto(stack.base + '/enhancement-v2/studio/course/');
  await signIn(teacher, stack.accounts.teacher, '#course-sign-in');
  await teacher.getByRole('button', { name: 'New draft' }).click();
  await visible(teacher.getByRole('heading', { name: 'Choose a teaching focus' }));
  await teacher.getByRole('button', { name: 'Draft a discount-boundary lesson' }).click();
  await visible(teacher.getByText('Mock example loaded into the form.', { exact: false }));
  const title = 'Protect the checkout discount boundaries';
  await teacher.getByLabel('Title', { exact: true }).fill(title);
  const explanation = teacher.getByLabel('Explanation', { exact: true });
  await explanation.fill((await explanation.inputValue()) + ' Try a value just below 0 and just above 100.');
  await teacher.getByLabel(/Teacher-only answer guidance/).fill('Private review note: check both invalid neighbors.');
  await teacher.getByRole('button', { name: 'Save draft', exact: true }).click();
  await visible(teacher.getByText('Saved revision 1.', { exact: true }));

  await teacher.getByRole('button', { name: 'Sign out' }).click();
  await signIn(teacher, stack.accounts.teacher, '#course-sign-in');
  await teacher.getByLabel('Saved draft').selectOption({ label: title + ' · revision 1' });
  await teacher.getByRole('button', { name: 'Reopen draft', exact: true }).click();
  await visible(teacher.getByText('Opened ' + title + '.'));
  assert.equal(await teacher.getByLabel('Title', { exact: true }).inputValue(), title);
  await teacher.getByRole('button', { name: 'Review saved revision' }).click();
  await visible(teacher.getByRole('heading', { name: 'Review revision 1 · ' + title }));
  assert.doesNotMatch(await teacher.locator('#review-lesson').innerText(), /Private review note/);
  await teacher.getByLabel('I checked the requirements', { exact: false }).check();
  await teacher.getByRole('button', { name: 'Approve this revision' }).click();
  teacher.once('dialog', (dialog) => dialog.accept());
  await teacher.getByRole('button', { name: 'Publish new version' }).click();
  const link = teacher.getByRole('link', { name: 'Version 1 · ' + title });
  await visible(link);
  const publishedUrl = await link.getAttribute('href');

  await learner.goto(publishedUrl);
  await visible(learner.getByRole('heading', { name: title, exact: true }));
  assert.match(await learner.locator('#lesson-version').innerText(), /Course version 1 · cart-checkout@1/i);
  assert.doesNotMatch(await learner.locator('main').innerText(), /Private review note|Teacher-only answer guidance/);
  assert.match(await learner.locator('#student-lesson').innerText(), /just above 100/);
  await learner.locator('#student-lesson summary').focus();
  await learner.keyboard.press('Enter');
  assert.equal(await learner.locator('#student-lesson details').evaluate((node) => node.open), true);
  assert.equal(await learner.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await signIn(learner, stack.accounts.student, '#learner-sign-in');
  await learner.getByRole('button', { name: 'Start practice' }).click();
  await learner.locator('#responses textarea').fill('Test 0, 100, and the values just outside the valid interval.');
  await learner.getByRole('button', { name: 'Submit practice' }).click();
  await visible(learner.getByText('Practice submitted. Your responses are saved to this version.'));
  await learner.reload();
  await visible(learner.getByText('Practice submitted. Your responses are saved to this version.'));
  assert.match(await learner.locator('#responses textarea').inputValue(), /just outside/);

  await teacher.getByRole('button', { name: 'Reopen draft', exact: true }).click();
  await visible(teacher.getByText('1 started · 1 submitted', { exact: true }));
  await teacher.getByLabel('Title', { exact: true }).fill('Discount boundaries, revised for the next lesson');
  await teacher.getByRole('button', { name: 'Save draft', exact: true }).click();
  await visible(teacher.getByText('Saved revision 2.', { exact: true }));
  await learner.reload();
  await visible(learner.getByRole('heading', { name: title, exact: true }));
  assert.deepEqual(errors, []);
});
