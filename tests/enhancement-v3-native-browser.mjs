import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { startM4Stack } from './m4-local-stack.mjs';
import { nativeCase } from '../enhancement-v3/native/cases.mjs';
import runner from '../correction-lab/break-runner.js';

const web = '/enhancement-v3/web/';
const courseCases = [
  { id: 'cart-checkout', title: 'QuizShop checkout', source: 'cart-checkout-source.txt', student: 'student',
    target: 'code-reading', choices: { 'empty-cart': 2, 'discount-range': 0, 'negative-quantity': 1 }, checks: 8 },
  { id: 'retry-queue', title: 'Retry queue backoff', source: 'retry-queue-source.txt', student: 'other-student',
    target: 'edge-cases', choices: { 'delay-cap': 0, 'invalid-attempt': 1 }, checks: 3 },
];
const live = process.env.V3_LIVE_AI === '1';

test('Chrome: publish both courses in V3 and follow the original four stages', { timeout: 300000 }, async t => {
  const preview = process.env.V3_PREVIEW_UNDER_TEST === '1';
  assert.ok(!preview || live, 'Run the active preview only with real AI.');
  const stack = preview ? { base: 'http://127.0.0.1:8767',
    accounts: JSON.parse(await readFile(new URL('../.env.native-accounts.json', import.meta.url), 'utf8')) } :
    await startM4Stack(t, { native: true, authBinary: process.env.SKILLLOOP_AUTH_BINARY,
    authMigrations: process.env.SKILLLOOP_AUTH_MIGRATIONS,
    appImports: live ? [] : [new URL('./native-ai-fixture.mjs', import.meta.url).href] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.M4_CHROME_PATH });
  t.after(() => browser.close());
  const resumeBrowser = process.env.V3_RESUME_BROWSER_PATH ?
    await chromium.launch({ headless: true, executablePath: process.env.V3_RESUME_BROWSER_PATH }) : browser;
  if (resumeBrowser !== browser) t.after(() => resumeBrowser.close());
  const teacher = await browser.newPage();
  const errors = [];
  teacher.on('pageerror', error => errors.push(error.message));
  const openCourse = (page, path) => page.goto(stack.base + path);
  const click = (page, label, role = 'button') => page.getByRole(role, { name: label, exact: true }).click({ timeout: 35000 });
  async function login(page, accountName) {
    const account = stack.accounts[accountName];
    await page.locator('main').getByLabel('Email').fill(account.email);
    await page.locator('main').getByLabel('Password').fill(account.password);
    await page.locator('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  const track = (page, op, action) => page.waitForResponse(response => {
    if (new URL(response.url()).searchParams.get('op') !== op) return false;
    return !action || response.request().postDataJSON()?.action === action;
  }, { timeout: 32000 }).then(async response => {
    const data = await response.json();
    assert.equal(response.status(), 200, JSON.stringify({ error: data.error, code: data.code }));
    return data;
  });
  const existingCourse = preview && process.env.V3_PREVIEW_COURSE_ID;
  if (!existingCourse) {
    await openCourse(teacher, web + 'studio.html');
    await login(teacher, 'teacher');
    await teacher.locator('input[type=file]').waitFor();

  }
  const selected = preview && process.env.V3_PREVIEW_CASE
    ? courseCases.filter(sample => sample.id === process.env.V3_PREVIEW_CASE) : courseCases;
  assert.ok(selected.length, 'Choose a supported course for the preview check.');

  async function publish(sample) {
    await openCourse(teacher, web + 'studio.html');
    await teacher.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('../docs/enhancement-v3/' + sample.source, import.meta.url)));
    await click(teacher, 'Extract document text');
    await click(teacher, 'Review knowledge');
    const generated = track(teacher, 'v3-generate');
    await click(teacher, 'Generate knowledge notes');
    await generated;
    await teacher.getByLabel('Course title').fill((preview ? 'V3 UI check · ' : 'Original course: ') + sample.title);
    const matching = track(teacher, 'v3-match');
    await click(teacher, 'Save and find cases');
    const matched = await matching;
    assert.ok(matched.choices.some(c => c.caseId === sample.id && new Set(c.mapping.map(m => m.requirementId)).size === 2));
    await teacher.getByRole('heading', { name: sample.title, exact: true }).locator('..')
      .getByRole('button', { name: 'Confirm this case and coverage' }).click();
    await teacher.getByRole('checkbox').check();
    await click(teacher, 'Approve this version');
    const publication = track(teacher, 'v3-publish');
    await click(teacher, 'Publish approved version');
    return publication;
  }

  for (const sample of selected) {
    const { courseId, version } = existingCourse ? { courseId: existingCourse, version: 1 } : await publish(sample);
    t.diagnostic(sample.id + ' published as version ' + version +
      (preview ? ': ' + stack.base + web + 'course.html?' + new URLSearchParams({ course: courseId, version }) : '.'));
    const publicLink = web + 'course.html?' + new URLSearchParams({ course: courseId, version });
    const student = await browser.newPage({ viewport: sample.id === 'cart-checkout' ? { width: 390, height: 860 } :
      { width: 1280, height: 860 } });
    student.on('pageerror', error => errors.push(error.message));
    await openCourse(student, publicLink);
    await click(student, 'Start Learning');
    await login(student, sample.student);
    await student.waitForURL('**/learning-path/?native=1**');
    let questions;
    if (preview && process.env.V3_AUTHORED_CHECKS === '1') {
      await student.route('**/api/courses/?op=native-save**', route => {
        if (route.request().postDataJSON()?.action !== 'questions') return route.continue();
        return route.fulfill({ status: 502, json: { error: 'Recover from a provider timeout.', code: 'TIMEOUT' } });
      });
      await click(student, 'Start diagnosis');
      await click(student, 'Use authored checks');
      questions = await student.evaluate(() => window.SkillLoopNative.progress.diagnosticCase.questions);
      t.diagnostic('Authored diagnosis questions used after the configured provider timed out on question generation.');
    } else {
      const assigned = track(student, 'native-save', 'questions');
      await click(student, 'Start diagnosis');
      questions = (await assigned).data.questions;
    }
    assert.equal(questions.length, 4);
    for (const q of questions) {
      const choice = q.options.find(option => option.score === (q.conceptId === sample.target ? 0 : 2));
      await student.locator('input[name="' + q.id + '"][value="' + choice.id + '"]').check();
    }
    const diagnosed = track(student, 'native-save', 'diagnose');
    await student.locator('#lp-run').click();
    await diagnosed;
    const primary = student.getByRole('link', { name: 'Continue learning', exact: true });
    const priority = student.locator('.lp-priority-link').nth(1);
    for (const entry of [primary, priority]) {
      const destination = new URL(await entry.getAttribute('href'), stack.base);
      assert.equal(destination.pathname, '/knowledge-map/');
      assert.equal(destination.searchParams.get('native'), '1');
      assert.equal(destination.searchParams.get('course'), courseId);
      assert.equal(destination.searchParams.get('version'), String(version));
    }
    await (sample.id === 'retry-queue' ? priority : primary).click();
    await student.waitForURL('**/knowledge-map/?native=1**');
    await student.locator('.learning-card:visible').getByText('Teacher-approved notes for this topic', { exact: true })
      .waitFor({ timeout: 35000 });
    if (sample.id === 'retry-queue') {
      const topic = new URL(student.url()).hash;
      assert.match(topic, /^#topic-/);
      await student.locator('article.learning-card' + topic + ':visible').waitFor();
    }
    const tabs = student.locator('#learning-priorities a');
    const dialog = student.getByRole('dialog', { name: 'Review & continue' });
    const openReview = student.locator('#learning-review-open');
    await openReview.click();
    await dialog.getByText('Not practiced', { exact: true }).first().waitFor();
    assert.equal(await dialog.getByRole('link', { name: 'Continue to AI dialogue' }).count(), 0);
    await student.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await openReview.evaluate(node => node === document.activeElement), true);
    await tabs.last().click();
    await student.locator('#learning-review-end').waitFor();
    const location = new URL(student.url()).hash;
    const answerField = page => page.locator('article.learning-card:visible textarea');
    const originalAnswer = 'The boundary should follow the expected result in the published teacher notes.';
    await answerField(student).fill(originalAnswer);
    await student.getByText('Practice saved.', { exact: true }).waitFor();
    const resumedLearning = await resumeBrowser.newPage();
    await openCourse(resumedLearning, publicLink);
    await click(resumedLearning, 'Start Learning');
    await login(resumedLearning, sample.student);
    await resumedLearning.waitForURL('**/knowledge-map/?native=1**');
    await answerField(resumedLearning).waitFor();
    assert.equal(new URL(resumedLearning.url()).hash, location);
    assert.equal(await answerField(resumedLearning).inputValue(), originalAnswer);
    assert.equal(await resumedLearning.locator('#learning-case').getByText('Priority topics', { exact: true }).count(), 0);

    let releaseReflection;
    let delayReflection = true;
    const waiting = new Promise(resolve => { releaseReflection = resolve; });
    await student.route('**/api/courses/?op=native-save**', async route => {
      if (route.request().postDataJSON()?.action !== 'reflection' || !delayReflection) return route.continue();
      delayReflection = false;
      await waiting;
      return route.fulfill({ status: 502, json: { error: 'Test reflection unavailable.' } });
    });

    for (const topic of await tabs.all()) {
      await topic.click();
      await answerField(student).fill(originalAnswer);
      const checked = track(student, 'native-save', 'feedback');
      await click(student, 'Check answer');
      await checked;
      await student.locator('article.learning-card:visible .learning-feedback h4').waitFor();
    }
    await student.locator('#learning-review-end').click();
    try {
      await dialog.getByText('Preparing AI reflection…', { exact: true }).waitFor();
      await dialog.getByLabel('Explain your reasoning', { exact: true }).fill('Consider the observed behavior at this boundary.');
      await dialog.getByRole('heading', { name: 'Formal case check', exact: true }).locator('..').locator('select').selectOption('1');
      const caseCheck = track(student, 'native-save', 'case-check');
      await dialog.getByRole('button', { name: 'Check my reasoning' }).click();
      await dialog.getByRole('link', { name: 'Continue to AI dialogue' }).waitFor({ timeout: 7000 });
      await caseCheck;
    } finally { releaseReflection(); }
    await dialog.getByRole('button', { name: 'Retry AI reflection' }).click();
    await student.waitForFunction(() => {
      const content = document.getElementById('ai-reflection').textContent;
      return content && !/Preparing|unavailable/.test(content);
    });
    const reflection = await student.locator('#ai-reflection').textContent();
    await student.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const revision = 'A newer draft to revisit before checking this answer again.';
    await answerField(student).fill(revision);
    await student.getByText('Practice saved.', { exact: true }).waitFor();
    await resumedLearning.goto(resumedLearning.url().split('#')[0]);
    await answerField(resumedLearning).waitFor();
    assert.equal(await answerField(resumedLearning).inputValue(), revision);
    const resumedCard = resumedLearning.locator('article.learning-card:visible');
    await resumedCard.getByText('Last submitted answer', { exact: true }).click();
    assert.equal(await resumedCard.locator('.learning-submitted p').textContent(), originalAnswer);
    await resumedCard.locator('.learning-feedback h4').waitFor();
    assert.equal(await resumedLearning.locator('#ai-reflection').textContent(), reflection);
    await resumedLearning.close();
    await openReview.click();
    await dialog.getByRole('link', { name: 'Continue to AI dialogue' }).click();
    await student.waitForURL('**/interview/?native=1**');
    const opening = track(student, 'native-save', 'dialogue');
    await student.locator('#start-live').click();
    await opening;
    await student.locator('#reply').fill('Walk me through the current boundary behavior in your implementation.');
    const reply = track(student, 'native-save', 'dialogue');
    await student.locator('#send').click();
    await reply;
    const summarized = track(student, 'native-save', 'dialogue');
    await student.locator('#finish-chat').click();
    await summarized;
    for (const field of await student.locator('#plan-items textarea').all())
      await field.fill('Implement the requirement and confirm it with the listed boundary check.');
    const reviewed = track(student, 'native-save', 'dialogue');
    await student.locator('#refresh-summary').click();
    await reviewed;
    const confirmed = track(student, 'native-save', 'confirm-plan');
    await student.locator('#confirm-plan').click();
    await confirmed;
    await student.locator('#continue-verification').click();
    await student.waitForURL('**/correction-lab/?native=1**');
    const trusted = nativeCase({ caseId: sample.id, caseVersion: 1, conceptId: 'edge-cases' });
    const correctCode = runner.assemble(trusted.level, sample.choices);
    await student.locator('#bk-mode-code').click();
    await student.locator('#bk-code').fill(correctCode);
    const verification = track(student, 'native-save', 'verify');
    await student.locator('#bk-run').click();
    const { data: result } = await verification;
    assert.equal(result.outcome, 'passed', JSON.stringify(result.tests));
    assert.equal(result.tests.length, sample.checks);
    await student.getByText(`All tests pass for this case. ${sample.checks} of ${sample.checks} pass.`, { exact: true }).waitFor();

    const resumed = await resumeBrowser.newPage();
    resumed.on('pageerror', error => errors.push(error.message));
    await openCourse(resumed, publicLink);
    await click(resumed, 'Start Learning');
    await login(resumed, sample.student);
    await resumed.waitForURL('**/correction-lab/?native=1**');
    await resumed.getByText(`All tests pass for this case. ${sample.checks} of ${sample.checks} pass.`, { exact: true }).waitFor();
    assert.equal(await resumed.locator('#bk-code').inputValue(), correctCode);
    assert.equal(new URL(resumed.url()).searchParams.get('version'), String(version));
    t.diagnostic(sample.id + ': v3 publication, original pages, ' + sample.checks + ' trusted checks, and browser recovery. ' +
      (preview ? stack.base + publicLink : ''));
    await student.close();
    await resumed.close();
  }
  const demo = await browser.newPage();
  demo.on('pageerror', error => errors.push(error.message));
  await openCourse(demo, '/knowledge-map/');
  await demo.getByRole('button', { name: 'Try a sample case', exact: true }).click();
  await demo.locator('article.learning-card:visible').waitFor();
  await demo.locator('#learning-review-open').click();
  await demo.getByRole('dialog', { name: 'Review & continue' }).waitFor();
  await demo.keyboard.press('Escape');
  await demo.close();
  assert.deepEqual(errors, []);
});
