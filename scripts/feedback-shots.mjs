// Comments + "report a problem" + WhatsApp channel button: end-to-end against a running production
// build, with screenshots at 390 and 1280 px. Flow: admin login → set the channel URL → a visitor
// posts a comment (waits past the 3 s bot window) → admin approves and replies → the public page
// shows it (polls: revalidateTag serves stale once, then regenerates) → a visitor files a PRICE
// report → admin pages. Also measures whether opening the inline report form moves anything above
// it, and checks horizontal overflow at 390 px. Everything it created is deleted at the end and the
// channel URL is restored.
// usage: BASE_URL=http://localhost:3100 ADMIN_EMAIL_FOR_TEST=… ADMIN_PASSWORD_FOR_TEST=… node scripts/feedback-shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const adminEmail = process.env.ADMIN_EMAIL_FOR_TEST;
const adminPassword = process.env.ADMIN_PASSWORD_FOR_TEST;
if (!adminEmail || !adminPassword) throw new Error('set ADMIN_EMAIL_FOR_TEST and ADMIN_PASSWORD_FOR_TEST');
const SLUG = process.env.SHOT_SLUG || 'brufen-600mg-30-tab';
const CHANNEL = process.env.CHANNEL_URL || 'https://whatsapp.com/channel/0029VaDwapriceTest00';
const out = fileURLToPath(new URL('../docs/feedback/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const env = (n) => process.env[n] || readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${n}=`))?.slice(n.length + 1).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const NAME = `زائر اختبار ${stamp}`;
const report = { checks: [], shots: [] };
let failures = 0;
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
const shot = async (page, name, opts = {}) => {
  const file = `${out}${name}.png`;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, fullPage: true, ...opts });
  report.shots.push(name);
  console.log('shot', name);
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
async function poll(fn, tries = 12, gap = 1000) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await sleep(gap);
  }
  return false;
}
/** After a form submit: the thanks text, or the first form error (so a FAIL says why, not just "timeout"). */
async function outcome(page, thanksText, tries = 20) {
  for (let i = 0; i < tries; i++) {
    if ((await page.getByText(thanksText).count()) > 0) return { ok: true };
    // only alerts with text: the page has empty live regions (search box) that are not form errors
    const alerts = (await page.locator('[role="alert"]').allTextContents()).map((t) => t.trim()).filter(Boolean);
    if (alerts.length) return { ok: false, detail: alerts.join(' | ') };
    await sleep(500);
  }
  return { ok: false, detail: 'timeout: neither thanks nor an error appeared' };
}
/** A server-action POST does not fire `load`; wait for the action response + the RSC refresh instead. */
async function action(page, click) {
  const res = page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
  await click();
  await res;
  await sleep(700);
}

const db = new pg.Client({ connectionString: env('API_DATABASE_URL'), ssl: { rejectUnauthorized: false } });
await db.connect();
const browser = await chromium.launch({ channel: 'chrome' });
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let previousChannel = null;
try {
  // ---- admin login
  await admin.goto(`${base}/admin/api/login`, { waitUntil: 'load' });
  await admin.fill('input[name="email"]', adminEmail);
  await admin.fill('input[name="password"]', adminPassword);
  await Promise.all([admin.waitForURL(/\/admin(\/api)?$/, { timeout: 15000 }).catch(() => null), admin.getByRole('button', { name: 'دخول' }).click()]);
  await admin.goto(`${base}/admin`, { waitUntil: 'load' });
  check('admin login', /\/admin$/.test(admin.url()));

  // ---- channel URL setting (remember the old one)
  await admin.goto(`${base}/admin/contact`, { waitUntil: 'load' });
  previousChannel = await admin.inputValue('input[name="whatsappChannelUrl"]');
  await admin.fill('input[name="whatsappChannelUrl"]', CHANNEL);
  await admin.getByRole('button', { name: 'حفظ' }).click();
  check('channel URL saved', await poll(async () => (await admin.locator('[role="status"]').count()) > 0, 10, 500));
  await shot(admin, 'admin-contact-channel-1280');
  const homeHasButton = await poll(async () => (await (await fetch(`${base}/`)).text()).includes('whatsapp.com/channel/'), 12, 1000);
  check('home shows the WhatsApp channel button after the save', homeHasButton);

  // ---- visitor posts a comment (wait past the 3 s bot window)
  await visitor.goto(`${base}/dawa/${SLUG}`, { waitUntil: 'load' });
  await visitor.locator('#comments-section').scrollIntoViewIfNeeded();
  await visitor.fill('#c-name', NAME);
  await visitor.fill('#c-body', 'تجربتي مع هذا الدواء كانت جيدة، أخفّ من غيره على المعدة عندي. تعليق اختبار يُحذف آليًا.');
  await visitor.check('input[name="is_pharmacist"]');
  await sleep(3500);
  await visitor.getByRole('button', { name: 'أرسل التعليق' }).click();
  const commentOutcome = await outcome(visitor, 'تم استلام تعليقك');
  check('comment accepted with the "after review" message', commentOutcome.ok, commentOutcome.detail);
  // not public yet
  const beforeHtml = await (await fetch(`${base}/dawa/${SLUG}`)).text();
  check('PENDING comment is NOT on the public page', !beforeHtml.includes(NAME));

  // ---- visitor files a PRICE report
  await visitor.getByRole('button', { name: /بلّغنا/ }).click();
  await visitor.selectOption('#r-type', 'PRICE');
  await visitor.fill('#r-price', '110');
  await visitor.fill('#r-details', `بلاغ اختبار ${stamp}: السعر في الصيدلية 110 وليس كما هو معروض.`);
  await visitor.fill('#r-contact', 'tester@example.com');
  await sleep(3500);
  await visitor.getByRole('button', { name: 'أرسل البلاغ' }).click();
  const reportOutcome = await outcome(visitor, 'هنراجع البلاغ');
  check('report accepted', reportOutcome.ok, reportOutcome.detail);

  // ---- admin approves + replies
  await admin.goto(`${base}/admin/comments`, { waitUntil: 'load' });
  const row = admin.locator('li', { hasText: NAME }).first();
  check('pending comment listed for the admin', (await row.count()) > 0);
  check('sidebar shows the pending-count badge', (await admin.locator('aside a[href="/admin/comments"] span.rounded-full').count()) > 0);
  await shot(admin, 'admin-comments-pending-1280');
  await action(admin, () => row.getByRole('button', { name: 'اعتماد' }).click());
  await admin.goto(`${base}/admin/comments?status=APPROVED`, { waitUntil: 'load' });
  const approved = admin.locator('li', { hasText: NAME }).first();
  check('comment is APPROVED', (await approved.count()) > 0);
  await approved.locator('summary').click();
  await approved.locator('textarea[name="reply"]').fill('شكرًا لمشاركتك. يسعدنا أن الدواء ناسبك — استشر الصيدلي دائمًا قبل تغيير الجرعة.');
  await action(admin, () => approved.getByRole('button', { name: 'حفظ الرد' }).click());
  await admin.goto(`${base}/admin/comments?status=APPROVED`, { waitUntil: 'load' });
  check('official reply saved', (await admin.locator('li', { hasText: NAME }).first().getByText('رد فريق الموقع').count()) > 0);
  await shot(admin, 'admin-comments-approved-1280');

  // ---- public page shows the approved comment (poll: stale-while-revalidate)
  const shown = await poll(async () => (await (await fetch(`${base}/dawa/${SLUG}`)).text()).includes(NAME), 15, 1000);
  check('APPROVED comment is server-rendered on the public page', shown);
  const html = await (await fetch(`${base}/dawa/${SLUG}`)).text();
  check('comment section has a stable heading and the pharmacist + team badges', html.includes('id="comments"') && html.includes('صيدلي') && html.includes('فريق الموقع'));
  check('no comment JSON-LD', !/"Comment"|"UserComments"/.test(html));
  check('page <title> unchanged by comments', !/تعليق/.test(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''));

  // ---- screenshots: drug page (390 + 1280), report form open, home, last prices, admin reports
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${base}/dawa/${SLUG}`, { waitUntil: 'load' });
    check(`drug page no horizontal overflow @${width}`, !(await overflow(page)));
    await shot(page, `drug-comments-${width}`);
    // report form: does opening it move anything ABOVE the trigger?
    const trigger = page.getByRole('button', { name: /بلّغنا/ });
    // document (absolute) positions, not viewport ones: clicking scrolls the trigger into view
    const positions = () =>
      page.evaluate(() => {
        const y = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
        return { h1: y(document.querySelector('h1')), price: y(document.querySelector('[aria-label="السعر الحالي"]')), info: y(document.getElementById('info')) };
      });
    const before = await positions();
    await trigger.click();
    await page.waitForSelector('#r-type');
    const after = await positions();
    check(`report form @${width}: H1 and price card did not move`, before.h1 === after.h1 && before.price === after.price, `h1 ${before.h1}→${after.h1}, price ${before.price}→${after.price}`);
    report[`info_shift_${width}`] = before.info !== null && after.info !== null ? after.info - before.info : null;
    console.log(`info section shift @${width}: ${report[`info_shift_${width}`]} px (content BELOW the form on phones moves by the form height)`);
    await page.selectOption('#r-type', 'PRICE');
    check(`report form @${width} no horizontal overflow`, !(await overflow(page)));
    await trigger.scrollIntoViewIfNeeded();
    await shot(page, `drug-report-form-${width}`, { fullPage: false });
    await page.goto(`${base}/`, { waitUntil: 'load' });
    check(`home has the WhatsApp button @${width}`, (await page.locator(`a[href="${CHANNEL}"]`).count()) > 0);
    check(`home no horizontal overflow @${width}`, !(await overflow(page)));
    await shot(page, `home-whatsapp-${width}`, { fullPage: false });
    await page.goto(`${base}/last-prices`, { waitUntil: 'load' });
    check(`last-prices has the WhatsApp button @${width}`, (await page.locator(`a[href="${CHANNEL}"]`).count()) > 0);
    await shot(page, `last-prices-whatsapp-${width}`, { fullPage: false });
    await page.close();
  }
  await admin.goto(`${base}/admin/reports`, { waitUntil: 'load' });
  check('new report listed with our price next to the suggested one', (await admin.locator('li', { hasText: `بلاغ اختبار ${stamp}` }).count()) > 0 && (await admin.getByText('السعر المقترح').count()) > 0);
  await shot(admin, 'admin-reports-1280');
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto(`${base}/admin/comments?status=APPROVED`, { waitUntil: 'load' });
  check('admin comments no horizontal overflow @390', !(await overflow(admin)));
  await shot(admin, 'admin-comments-390');
  await admin.goto(`${base}/admin/reports`, { waitUntil: 'load' });
  check('admin reports no horizontal overflow @390', !(await overflow(admin)));
  await shot(admin, 'admin-reports-390');
  await admin.goto(`${base}/admin`, { waitUntil: 'load' });
  check('dashboard has the two cards', (await admin.getByText('تعليقات بانتظار المراجعة').count()) > 0 && (await admin.getByText('بلاغات جديدة').count()) > 0);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${base}/admin`, { waitUntil: 'load' });
  await shot(admin, 'admin-dashboard-1280');
} finally {
  // ---- cleanup: the test rows, and the channel URL back to what it was
  try {
    const c = await db.query('delete from api.drug_comments where name = $1 returning id', [NAME]);
    const r = await db.query('delete from api.drug_reports where details like $1 returning id', [`بلاغ اختبار ${stamp}%`]);
    console.log(`cleanup: deleted ${c.rowCount} comment(s), ${r.rowCount} report(s)`);
  } catch (e) {
    console.log('cleanup failed:', e.message);
  }
  if (previousChannel !== null) {
    try {
      await admin.setViewportSize({ width: 1280, height: 900 });
      await admin.goto(`${base}/admin/contact`, { waitUntil: 'load' });
      await admin.fill('input[name="whatsappChannelUrl"]', previousChannel);
      await admin.getByRole('button', { name: 'حفظ' }).click();
      await sleep(1500);
      console.log(`channel URL restored to "${previousChannel}"`);
    } catch (e) {
      console.log('restore failed:', e.message);
    }
  }
  await browser.close();
  await db.end();
  writeFileSync(`${out}report.json`, JSON.stringify(report, null, 2));
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
}
