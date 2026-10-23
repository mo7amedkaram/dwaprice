// Pure rules of the drug-page comment and report forms (lib/feedback/logic.ts) and the WhatsApp
// channel URL setting: lengths, HTML stripping, the URL ban, honeypot + submit-time bot check.
import { describe, expect, it } from 'vitest';
import {
  COMMENT_LIMITS,
  REPORT_LIMITS,
  SUBMIT_MAX_MS,
  SUBMIT_MIN_MS,
  botCheck,
  cleanText,
  containsUrl,
  validateComment,
  validateReport,
} from '@/lib/feedback/logic';
import { parseWhatsappChannelUrl } from '@/lib/settings/config';

/** Exactly n characters of plain Arabic text, no trailing space (cleanText trims). */
const ok = (n: number) => 'كلمة '.repeat(Math.ceil(n / 5) + 1).slice(0, n).replace(/ $/, 'ك');

describe('text cleaning', () => {
  it('strips tags and control characters, keeps Arabic text and line breaks', () => {
    expect(cleanText('<b>مرحبا</b> <script>alert(1)</script>بك', 100)).toBe('مرحبا alert(1) بك');
    expect(cleanText('سطر\u0000 أول\r\n\r\n\r\n\r\nسطر ثانٍ\u0007', 100)).toBe('سطر أول\n\nسطر ثانٍ');
    expect(cleanText('   كثير    من   المسافات  ', 100)).toBe('كثير من المسافات');
  });
  it('truncates at the given length', () => {
    expect(cleanText('x'.repeat(50), 10)).toHaveLength(10);
  });
});

describe('URL rejection', () => {
  it('finds links in any common spelling', () => {
    for (const s of ['زوروا https://example.com الآن', 'see www.site.net', 'اطلبه من pharmacy.com', 'http://x.io/y', 'ftp://files.org', 'موقعنا dawa.eg']) {
      expect(containsUrl(s), s).toBe(true);
    }
  });
  it('does not flag ordinary text, prices or dosages', () => {
    for (const s of ['الجرعة 2.5 مجم مرتين يوميًا', 'السعر 99.00 جنيه', 'قرص بعد الأكل. جيد جدًا', 'Brufen 600 mg', 'نسبة 12.5% فقط']) {
      expect(containsUrl(s), s).toBe(false);
    }
  });
});

describe('comment validation', () => {
  const good = { name: 'أحمد', email: '', body: ok(40), isPharmacist: 'on' };
  it('accepts a good comment and reads the pharmacist checkbox', () => {
    const { value, errors } = validateComment(good);
    expect(errors).toEqual({});
    expect(value.isPharmacist).toBe(true);
    expect(validateComment({ ...good, isPharmacist: undefined }).value.isPharmacist).toBe(false);
  });
  it('enforces the lengths: name ≤ 60, comment 20–1000', () => {
    expect(validateComment({ ...good, name: '' }).errors.name).toBeTruthy();
    expect(validateComment({ ...good, name: 'أ'.repeat(COMMENT_LIMITS.name + 1) }).errors.name).toMatch(/60/);
    expect(validateComment({ ...good, name: 'أ'.repeat(COMMENT_LIMITS.name) }).errors.name).toBeUndefined();
    expect(validateComment({ ...good, body: ok(COMMENT_LIMITS.bodyMin - 1) }).errors.body).toMatch(/20/);
    expect(validateComment({ ...good, body: ok(COMMENT_LIMITS.bodyMin) }).errors.body).toBeUndefined();
    expect(validateComment({ ...good, body: ok(COMMENT_LIMITS.bodyMax + 1) }).errors.body).toMatch(/1000/);
  });
  it('rejects links in the comment or the name, and bad e-mails; e-mail is optional', () => {
    expect(validateComment({ ...good, body: `${ok(30)} www.spam.com` }).errors.body).toMatch(/روابط/);
    expect(validateComment({ ...good, name: 'buy.shop' }).errors.name).toMatch(/روابط/);
    expect(validateComment({ ...good, email: 'not-an-email' }).errors.email).toBeTruthy();
    expect(validateComment({ ...good, email: 'A@B.CO' }).value.email).toBe('a@b.co');
  });
  it('stores plain text: HTML in the body is stripped before the length check', () => {
    const { value, errors } = validateComment({ ...good, body: `<p>${ok(30)}</p><img src=x onerror=alert(1)>` });
    expect(errors).toEqual({});
    expect(value.body).not.toMatch(/</);
  });
});

describe('report validation', () => {
  const good = { type: 'PRICE', details: ok(30), suggestedPrice: '120.5', contact: '', pageUrl: 'https://dwaprice.com/dawa/brufen-600mg-30-tab', referrer: '' };
  it('accepts a good report; the suggested price is numeric and only for PRICE', () => {
    const { value, errors } = validateReport(good);
    expect(errors).toEqual({});
    expect(value.suggestedPrice).toBe(120.5);
    expect(value.pageUrl).toBe(good.pageUrl);
    expect(validateReport({ ...good, type: 'DATA' }).value.suggestedPrice).toBeNull();
    expect(validateReport({ ...good, suggestedPrice: '١٢٠' }).value.suggestedPrice).toBeNull(); // Arabic-Indic digits are not parsed silently
  });
  it('enforces type, 10–800 details, URL ban, contact shape', () => {
    expect(validateReport({ ...good, type: 'HACK' }).errors.type).toBeTruthy();
    expect(validateReport({ ...good, details: ok(REPORT_LIMITS.detailsMin - 1) }).errors.details).toMatch(/10/);
    expect(validateReport({ ...good, details: ok(REPORT_LIMITS.detailsMax + 1) }).errors.details).toMatch(/800/);
    expect(validateReport({ ...good, details: `${ok(20)} http://a.b` }).errors.details).toMatch(/روابط/);
    expect(validateReport({ ...good, contact: 'hello' }).errors.contact).toBeTruthy();
    expect(validateReport({ ...good, contact: '+20 100 123 4567' }).errors.contact).toBeUndefined();
    expect(validateReport({ ...good, contact: 'a@b.co' }).errors.contact).toBeUndefined();
  });
  it('keeps only a same-site drug page URL', () => {
    expect(validateReport({ ...good, pageUrl: 'https://evil.example/phish' }).value.pageUrl).toBe('');
    expect(validateReport({ ...good, pageUrl: '/dawa/x-1' }).value.pageUrl).toBe('/dawa/x-1');
  });
});

describe('honeypot and submit-time check', () => {
  const now = 1_700_000_000_000;
  it('a filled honeypot is a bot whatever the timing', () => {
    expect(botCheck('http://bot', String(now - 10_000), now)).toBe('honeypot');
  });
  it('too fast, fine, stale', () => {
    expect(botCheck('', String(now - SUBMIT_MIN_MS + 1), now)).toBe('too-fast');
    expect(botCheck('', String(now - SUBMIT_MIN_MS), now)).toBe('ok');
    expect(botCheck('', String(now - 60_000), now)).toBe('ok');
    expect(botCheck('', String(now - SUBMIT_MAX_MS - 1), now)).toBe('stale');
  });
  it('a missing or garbage timestamp counts as too fast (the hidden field was never filled by a browser)', () => {
    expect(botCheck('', '', now)).toBe('too-fast');
    expect(botCheck('', 'abc', now)).toBe('too-fast');
    expect(botCheck('', undefined, now)).toBe('too-fast');
  });
});

describe('WhatsApp channel URL setting', () => {
  it('accepts only https://whatsapp.com/channel/<id> (www. allowed, trailing slash dropped)', () => {
    expect(parseWhatsappChannelUrl('https://whatsapp.com/channel/0029VaAbCdEfGhIjK')).toBe('https://whatsapp.com/channel/0029VaAbCdEfGhIjK');
    expect(parseWhatsappChannelUrl(' https://www.whatsapp.com/channel/0029VaAbCdEf/ ')).toBe('https://www.whatsapp.com/channel/0029VaAbCdEf');
    for (const bad of ['http://whatsapp.com/channel/0029VaAbCdEf', 'https://wa.me/201000000000', 'https://whatsapp.com/channel/', 'https://evil.com/whatsapp.com/channel/x', 'javascript:alert(1)', '']) {
      expect(parseWhatsappChannelUrl(bad), bad).toBe('');
    }
  });
});
