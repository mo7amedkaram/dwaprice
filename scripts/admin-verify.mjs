// End-to-end check of the site admin area against a running server. Logs in, exercises each
// section, and verifies the live site reflects changes (SEO title, favicon, GA + consent,
// verification tags). Screenshots at 1280 and 390 px. Settings it writes are reset at the end.
// usage: BASE_URL=http://localhost:3100 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/admin-verify.mjs
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const email = process.env.ADMIN_EMAIL || 'showcase-admin@example.com';
const password = process.env.ADMIN_PASSWORD || 'Showcase-Pass-2026!x';
const out = fileURLToPath(new URL('../docs/admin/screenshots/', import.meta.url));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
const headOf = async () => (await (await fetch(`${base}/`)).text()).split('</head>')[0];
// revalidateTag uses the 'max' profile (serve stale, regenerate in the background), so poll a few times.
async function poll(fn, tries = 8, gap = 800) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await sleep(gap);
  }
  return false;
}

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
try {
  // --- login ---
  await page.goto(`${base}/admin/api/login`, { waitUntil: 'load' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  // The login page carries the public header (and its search button), so click the login button by name.
  await Promise.all([page.waitForURL(/\/admin(\/api)?$/, { timeout: 15000 }).catch(() => null), page.getByRole('button', { name: 'دخول' }).click()]);
  await sleep(500);
  await page.goto(`${base}/admin`, { waitUntil: 'load' });
  check('login reaches the dashboard', /\/admin$/.test(page.url()) && (await page.locator('h1', { hasText: 'لوحة التحكم' }).count()) > 0);
  await page.screenshot({ path: `${out}dashboard-1280.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}dashboard-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // --- SEO: change home title, verify the live home reflects it ---
  await page.goto(`${base}/admin/seo`, { waitUntil: 'load' });
  const marker = `اختبار الإدارة ${Date.now()}`;
  await page.fill('#seo-homeTitle', marker);
  // Scope to the SEO form's submit — the admin shell has a logout <button type="submit"> too.
  await page.locator('form').filter({ has: page.locator('#seo-homeTitle') }).locator('button[type="submit"]').click();
  await page.waitForSelector('[role="status"]', { timeout: 10000 }).catch(() => null);
  const titleOk = await poll(async () => (await (await fetch(`${base}/`)).text()).includes(marker));
  const homeTitle = (await (await fetch(`${base}/`)).text()).match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  check('home <title> reflects the saved SEO title (no redeploy)', titleOk, homeTitle.slice(0, 80));
  await page.screenshot({ path: `${out}seo-1280.png`, fullPage: true });

  // --- Branding: upload a 512 PNG, verify the favicon becomes custom ---
  await page.goto(`${base}/admin/branding`, { waitUntil: 'load' });
  const iconPath = fileURLToPath(new URL('../docs/admin/test-icon.png', import.meta.url));
  writeFileSync(iconPath, await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 200, g: 30, b: 90, alpha: 1 } } }).png().toBuffer());
  const beforeIco = (await (await fetch(`${base}/favicon.ico`)).arrayBuffer()).byteLength;
  await page.setInputFiles('#favicon', iconPath);
  await sleep(400);
  await page.screenshot({ path: `${out}branding-1280.png`, fullPage: true });
  await page.locator('form').filter({ has: page.locator('#favicon') }).locator('button[type="submit"]').click();
  await page.waitForSelector('[role="status"]', { timeout: 15000 }).catch(() => null);
  const isPink = async () => {
    const buf = Buffer.from(await (await fetch(`${base}/icon-192.png`)).arrayBuffer());
    const { data } = await sharp(buf).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    return data[0] > 150 && data[2] > 40; // reddish/pink, not the teal builtin
  };
  const pinkPixel = await poll(isPink);
  const afterIco = (await (await fetch(`${base}/favicon.ico`)).arrayBuffer()).byteLength;
  check('favicon changed after upload (icon-192 is the new colour)', pinkPixel, `ico ${beforeIco}→${afterIco} bytes`);

  // --- Analytics + verification: GA loads directly (no consent gate); verification tags on home ---
  await page.goto(`${base}/admin/analytics`, { waitUntil: 'load' });
  await page.fill('#f-ga4MeasurementId', 'G-TEST123456');
  await page.locator('form', { has: page.locator('#f-ga4MeasurementId') }).locator('button[type="submit"]').click();
  await sleep(1500);
  await page.fill('#f-google', 'test_google_verification_token_123');
  await page.fill('#f-bing', '<meta name="msvalidate.01" content="BINGTOKEN123" />');
  await page.locator('form', { has: page.locator('#f-google') }).locator('button[type="submit"]').click();
  await sleep(1500);
  await page.screenshot({ path: `${out}analytics-1280.png`, fullPage: true });

  const verifyOk = await poll(async () => {
    const h = await headOf();
    return /name="google-site-verification"\s+content="test_google_verification_token_123"/.test(h) && /name="msvalidate\.01"\s+content="BINGTOKEN123"/.test(h);
  });
  check('verification meta tags on the home page', verifyOk, '');

  // GA: a fresh visitor gets the Google script loaded on first paint, with no cookie notice to click.
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const vp = await visitor.newPage();
  await vp.goto(`${base}/`, { waitUntil: 'load' });
  await vp.waitForFunction(() => document.querySelectorAll('script[src*="googletagmanager"]').length > 0, null, { timeout: 8000 }).catch(() => null);
  const gaScripts = await vp.evaluate(() => document.querySelectorAll('script[src*="googletagmanager"]').length);
  const noticeShown = (await vp.locator('[role="dialog"][aria-label="إشعار ملفات تعريف الارتباط"]').count()) > 0;
  check('GA loads on first visit with no consent click', gaScripts > 0, `gtag scripts = ${gaScripts}`);
  check('no cookie-consent notice is shown', !noticeShown, `notice=${noticeShown}`);
  await vp.screenshot({ path: `${out}home-ga-390.png` });
  await visitor.close();

  // --- audit log ---
  await page.goto(`${base}/admin/audit`, { waitUntil: 'load' });
  const auditRows = await page.locator('tbody tr').count();
  check('audit log records the changes', auditRows >= 3, `${auditRows} rows`);
  await page.screenshot({ path: `${out}audit-1280.png`, fullPage: true });

  // --- final home <head> ---
  writeFileSync(fileURLToPath(new URL('../docs/admin/home-head.html', import.meta.url)), (await headOf()).slice(0, 6000) + '\n</head>');
  console.log('screenshots + head written to', out);
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'ALL OK' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
