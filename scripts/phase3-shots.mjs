// Phase 3 showcase: screenshots of every API page (Arabic and English) at 360 and 1280 px with
// head checks (robots, canonical, hreflang, JSON-LD), the language flow (Arabic docs → English →
// "Try the sample" stays English → dashboard login in English → back to Arabic), plus the
// end-to-end flows: request access → admin e-mail + password login → approve → issue key →
// developer magic-link login → create / rotate / revoke keys.
// Needs the server with API_DEV_LOGIN_LINKS=true and an admin account
// (node scripts/api-admin.mjs admin:create --email … --name … --password …).
// usage: BASE_URL=http://localhost:3100 ADMIN_EMAIL_FOR_TEST=… ADMIN_PASSWORD_FOR_TEST=… node scripts/phase3-shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.BASE_URL || 'http://localhost:3100';
const adminEmail = process.env.ADMIN_EMAIL_FOR_TEST;
const adminPassword = process.env.ADMIN_PASSWORD_FOR_TEST;
if (!adminEmail || !adminPassword) throw new Error('set ADMIN_EMAIL_FOR_TEST and ADMIN_PASSWORD_FOR_TEST');
const out = fileURLToPath(new URL('../docs/api/phase3/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const report = { pages: [], flow: [] };
const stamp = Date.now().toString(36);
const applicantEmail = `applicant-${stamp}@example.com`;
// magic links are built on SITE_URL (production); point them at the local server
const local = (link) => base + new URL(link).pathname + new URL(link).search;
const path = (page) => new URL(page.url()).pathname;

const PAGES = [
  ['home', '/'], ['landing-ar', '/api'], ['landing-en', '/api/en'], ['sample', '/api/sample'], ['sample-en', '/api/en/sample'], ['docs', '/api/docs'], ['docs-en', '/api/en/docs'],
  ['request-access', '/api/request-access'], ['request-access-en', '/api/en/request-access'], ['terms', '/api/terms'], ['terms-en', '/api/en/terms'],
  ['developer-login', '/developer/login'], ['admin-login', '/admin/api/login'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const checks = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const small = [...document.querySelectorAll('a, button, input, select, summary')]
      .filter((el) => el.offsetParent !== null && !el.closest('p, li, td, dd') && !el.classList.contains('sr-only'))
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30));
    const main = document.getElementById('main');
    return {
      overflowX: doc.scrollWidth > window.innerWidth,
      title: document.title,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      hreflang: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => `${l.getAttribute('hreflang')}=${l.getAttribute('href')}`),
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { const j = JSON.parse(s.textContent); return (Array.isArray(j) ? j : [j]).map((x) => x['@type']).join('+'); } catch { return 'ERR'; } }),
      h1: document.querySelector('h1')?.textContent?.trim().slice(0, 80),
      // language of the chrome around the page: the English chrome is a div[lang=en] wrapping #main
      chrome: main?.closest('[lang]')?.getAttribute('lang') ?? doc.getAttribute('lang'),
      smallTargets: small.slice(0, 5),
    };
  });

try {
  for (const [name, p] of PAGES) {
    for (const width of [360, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const res = await page.goto(`${base}${p}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const c = await checks(page);
      await page.screenshot({ path: `${out}${name}-${width}.png`, fullPage: true });
      report.pages.push({ name, path: p, width, status: res?.status(), ...c });
      console.log(JSON.stringify(report.pages.at(-1)));
      await page.close();
    }
  }

  // ---- language flow: nothing in the English section may fall back to Arabic
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/api/docs`, { waitUntil: 'load' });
    const nav = page.locator('nav[aria-label="أقسام الـ API"], nav[aria-label="API sections"]');
    await nav.locator('a:has-text("English")').click();
    await page.waitForURL(/\/api\/en\/docs$/);
    const steps = [{ step: 'docs ar → English switch', path: path(page), h1: await page.locator('h1').first().textContent() }];
    await nav.locator('a:has-text("Try the sample")').click();
    await page.waitForURL(/\/api\/en\/sample$/);
    steps.push({ step: 'English docs → Try the sample', path: path(page), h1: await page.locator('h1').first().textContent(), chrome: (await checks(page)).chrome });
    await page.screenshot({ path: `${out}lang-1-sample-en-from-docs-1280.png`, fullPage: true });
    await page.fill('#ex-q', 'augmentn');
    await page.click('button:has-text("Run request")');
    await page.waitForFunction(() => /"sample": true/.test(document.querySelector('section[aria-labelledby="ex-response"] pre')?.textContent ?? ''), null, { timeout: 15000 });
    steps.push({ step: 'English explorer: q=augmentn', ok: true });
    await nav.locator('a:has-text("Developer dashboard")').click();
    await page.waitForURL(/\/developer\/login$/);
    steps.push({ step: 'English → Developer dashboard (login)', path: path(page), h1: await page.locator('h1').first().textContent(), chrome: (await checks(page)).chrome });
    await page.screenshot({ path: `${out}lang-2-developer-login-en-1280.png`, fullPage: true });
    await nav.locator('a:has-text("Overview")').click();
    await page.waitForURL(/\/api\/en$/);
    await nav.locator('a:has-text("Request access")').click();
    await page.waitForURL(/\/api\/en\/request-access$/);
    await nav.locator('a:has-text("License terms")').click();
    await page.waitForURL(/\/api\/en\/terms$/);
    steps.push({ step: 'English overview → request access → terms', path: path(page), h1: await page.locator('h1').first().textContent() });
    await nav.locator('a:has-text("العربية")').click();
    await page.waitForURL(/\/api\/terms$/);
    await nav.locator('a:has-text("لوحة المطورين")').click();
    await page.waitForURL(/\/developer\/login$/);
    steps.push({ step: 'back to Arabic → dashboard login in Arabic', path: path(page), h1: await page.locator('h1').first().textContent(), chrome: (await checks(page)).chrome });
    report.flow.push(...steps);
    await ctx.close();
  }

  // ---- sample explorer (Arabic): run a misspelled search, screenshot the result
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}/api/sample`, { waitUntil: 'load' });
    await page.fill('#ex-q', 'اوجمنتن');
    await page.click('button:has-text("نفّذ الطلب")');
    await page.waitForFunction(() => /"sample": true/.test(document.querySelector('section[aria-labelledby="ex-response"] pre')?.textContent ?? ''), null, { timeout: 15000 });
    const text = await page.locator('section[aria-labelledby="ex-response"] pre').textContent();
    await page.click('button[role="tab"]:has-text("Python")');
    await page.screenshot({ path: `${out}sample-explorer-result-1280.png`, fullPage: true });
    report.flow.push({ step: 'sample explorer: q=اوجمنتن', ids: [...text.matchAll(/"id": "([^"]+)"/g)].map((m) => m[1]).slice(0, 5) });
    await page.close();
  }

  // ---- flow 1: request access
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // the form allows 5 requests per network per day; each showcase run comes from its own test network
  await ctx.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.${Math.floor(Math.random() * 250)}.9` });
  const page = await ctx.newPage();
  await page.goto(`${base}/api/request-access?plan=business`, { waitUntil: 'load' });
  await page.fill('#ar-name', 'اختبار المرحلة الثالثة');
  await page.fill('#ar-company', `صيدلية الاختبار ${stamp}`);
  await page.fill('#ar-email', applicantEmail);
  await page.fill('#ar-phone', '+20 100 000 0000');
  await page.fill('#ar-use', 'نظام نقاط بيع لصيدلية: مزامنة الأسعار يوميًا والبحث بالباركود عند البيع.');
  await page.selectOption('#ar-volume', '10k-100k');
  await page.check('input[name="contact_pref"][value="whatsapp"]');
  await page.click('button:has-text("أرسل الطلب")');
  await page.waitForURL(/sent=1/);
  await page.screenshot({ path: `${out}flow-1-request-sent-1280.png`, fullPage: true });
  report.flow.push({ step: 'request access submitted', url: page.url() });

  // ---- flow 2: admin password login, approve, issue key
  await page.goto(`${base}/admin/api/login`, { waitUntil: 'load' });
  await page.fill('#admin-email', adminEmail);
  await page.fill('#admin-password', 'definitely-not-the-password');
  await page.click('button:has-text("دخول")');
  const wrong = page.locator('p[role="alert"]:has-text("غير صحيحة")'); // not Next's route announcer, which is also role=alert
  await wrong.waitFor({ timeout: 15000 });
  report.flow.push({ step: 'admin login with a wrong password', alert: (await wrong.textContent()).trim().slice(0, 80), emailKept: await page.inputValue('#admin-email') });
  await page.fill('#admin-email', adminEmail); // the form is reset after the failed action; the e-mail is echoed back, the password is not
  await page.fill('#admin-password', adminPassword);
  await page.click('button:has-text("دخول"):not([disabled])');
  await page.waitForURL(/\/admin\/api$/);
  report.flow.push({ step: 'admin login with e-mail + password', path: path(page) });
  await page.screenshot({ path: `${out}flow-2-admin-requests-1280.png`, fullPage: true });
  const card = page.locator('li', { hasText: `صيدلية الاختبار ${stamp}` }).first();
  await card.locator('select[name="plan_id"]').selectOption('business');
  await card.locator('input[name="paid_until"]').fill('2026-12-31');
  await card.locator('input[name="billing_reference"]').fill('INV-TEST-1');
  await card.locator('button:has-text("قبول وإنشاء الحساب")').click();
  await page.waitForURL(/\/admin\/api\/clients\//);
  const clientUrl = page.url();
  await page.fill('#key-name', 'admin-issued');
  await page.click('button:has-text("إنشاء مفتاح")');
  await page.waitForSelector('[role="status"] code');
  const adminKey = (await page.locator('[role="status"] code').first().textContent()).trim();
  await page.screenshot({ path: `${out}flow-3-admin-client-key-1280.png`, fullPage: true });
  report.flow.push({ step: 'approved → client page → key issued once', clientUrl, keyPrefix: adminKey.slice(0, 16) + '…' });
  // the admin key works on the real API
  const probe = await (await fetch(`${base}/api/v1/meta`, { headers: { Authorization: `Bearer ${adminKey.trim()}` } })).json();
  report.flow.push({ step: 'issued key works against /v1/meta', dataset_version: probe.data?.dataset_version ?? null });
  await page.goto(`${base}/admin/api/clients`, { waitUntil: 'load' });
  await page.screenshot({ path: `${out}flow-4-admin-clients-1280.png`, fullPage: true });
  await page.goto(`${base}/admin/api/plans`, { waitUntil: 'load' });
  await page.screenshot({ path: `${out}flow-5-admin-plans-1280.png`, fullPage: true });
  await ctx.close();
  // without the cookie the admin pages redirect to the login
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${base}/admin/api/clients`, { waitUntil: 'load' });
  report.flow.push({ step: 'admin pages without a session', path: path(anon) });
  await anon.context().close();

  // ---- flow 3: developer login as the approved applicant, create / rotate / revoke
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dev = await ctx2.newPage();
  await dev.goto(`${base}/developer`, { waitUntil: 'load' });
  await dev.waitForURL(/\/developer\/login/);
  await dev.fill('#login-email', applicantEmail);
  await dev.click('button:has-text("أرسل رابط الدخول")');
  const devLink = await dev.locator('a[href*="/developer/login/verify?token="]').getAttribute('href', { timeout: 15000 });
  await dev.goto(local(devLink), { waitUntil: 'load' });
  await dev.click('button:has-text("تأكيد الدخول")');
  await dev.waitForURL(/\/developer$/);
  await dev.fill('#key-name', 'POS backend');
  await dev.click('button:has-text("إنشاء مفتاح")');
  await dev.waitForSelector('[role="status"] code');
  await dev.screenshot({ path: `${out}flow-6-developer-dashboard-key-1280.png`, fullPage: true });
  const rotate = dev.locator('button:has-text("تدوير")').first();
  await rotate.click();
  await dev.waitForFunction(() => document.querySelectorAll('[role="status"] code').length >= 2);
  await dev.locator('summary:has-text("إلغاء")').first().click();
  await dev.locator('button:has-text("تأكيد الإلغاء")').first().click();
  await dev.waitForLoadState('load');
  await dev.reload({ waitUntil: 'load' }); // the server action refreshed the data; show the settled page
  await dev.screenshot({ path: `${out}flow-7-developer-after-rotate-revoke-1280.png`, fullPage: true });
  const statuses = await dev.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').slice(0, 120)));
  report.flow.push({ step: 'developer: create → rotate → revoke', keys: statuses });
  // the same dashboard in English (cookie set by the language switch)
  await dev.goto(`${base}/api/lang/en?next=%2Fdeveloper`, { waitUntil: 'load' });
  await dev.waitForURL(/\/developer$/);
  report.flow.push({ step: 'dashboard after switching to English', h1: await dev.locator('h1').first().textContent(), keysHeading: await dev.locator('#keys').textContent(), chrome: (await checks(dev)).chrome });
  await dev.screenshot({ path: `${out}flow-7b-developer-dashboard-en-1280.png`, fullPage: true });
  await dev.goto(`${base}/api/lang/ar?next=%2Fdeveloper`, { waitUntil: 'load' });
  const dev360 = await ctx2.newPage({ viewport: { width: 360, height: 800 } });
  await dev360.goto(`${base}/developer`, { waitUntil: 'load' });
  await dev360.screenshot({ path: `${out}flow-8-developer-dashboard-360.png`, fullPage: true });
  await dev.locator('button:has-text("تسجيل الخروج")').click();
  await dev.waitForURL(/\/developer\/login/);
  report.flow.push({ step: 'logout → /developer/login', ok: true });
  await ctx2.close();
} finally {
  await browser.close();
}
writeFileSync(`${out}../shots-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.flow, null, 1));
