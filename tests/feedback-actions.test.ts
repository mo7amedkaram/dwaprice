// The write paths with the database and the notifier mocked: a comment is stored PENDING with the
// right drug_id, the rate limits refuse, a report keeps drug_id + page_url, the admin actions answer
// 403 for a non-admin, and the public read goes through the APPROVED-only view. Then, when
// API_DATABASE_URL is available, a real round trip: a PENDING row is invisible to web_reader through
// web.drug_comments and visible once APPROVED (deleted at the end).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HONEYPOT_FIELD } from '@/lib/feedback/logic';

const webQuery = vi.fn();
const apiQuery = vi.fn();
const notify = vi.fn(async () => true);
const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
let session: { id: string; email: string } | null = null;
let adminRow: { id: string; email: string; status: string } | null = null;

vi.mock('@/lib/db', () => ({ query: webQuery }));
vi.mock('@/lib/api/db', () => ({ apiQuery }));
vi.mock('@/lib/api/notify', () => ({ notifyAdmin: notify }));
vi.mock('next/cache', () => ({
  revalidateTag,
  revalidatePath,
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/api/session', () => ({ getSession: async () => session }));
vi.mock('@/lib/api/admin-auth', () => ({ getAdmin: async () => adminRow }));

const DRUG = { drug_id: 'a0708bea-fb96-4eda-a772-4e1077606174', slug: 'brufen-600mg-30-tab', name_ar: 'بروفين', name_en: 'Brufen' };
const ctx = { ip: '203.0.113.9', userAgent: 'vitest', now: 1_700_000_000_000 };
const body = 'جرّبته مع الطبيب وكان مفيدًا جدًا للصداع';
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const commentForm = (over: Record<string, string> = {}) => form({ slug: DRUG.slug, name: 'أحمد', body, t: String(ctx.now - 10_000), [HONEYPOT_FIELD]: '', ...over });
const count = (n: number) => [{ n: String(n) }];

beforeEach(() => {
  webQuery.mockReset();
  apiQuery.mockReset();
  notify.mockClear();
  revalidateTag.mockReset();
  revalidatePath.mockReset();
  session = null;
  adminRow = null;
  webQuery.mockResolvedValue([DRUG]);
});
afterEach(() => vi.restoreAllMocks());

describe('submitComment', () => {
  it('stores a valid comment as PENDING (default) with the drug_id of the page, and e-mails only a link', async () => {
    apiQuery.mockResolvedValueOnce(count(0)).mockResolvedValueOnce(count(0)).mockResolvedValueOnce([{ id: '7' }]);
    const { submitComment } = await import('@/lib/feedback/submit');
    const res = await submitComment(commentForm({ is_pharmacist: 'on', email: 'A@b.co' }), ctx);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/بعد المراجعة/);
    const insert = apiQuery.mock.calls[2];
    expect(String(insert[0])).toMatch(/insert into api\.drug_comments/);
    expect(String(insert[0])).not.toMatch(/status/); // PENDING comes from the column default
    const params = insert[1] as unknown[];
    expect(params[0]).toBe(DRUG.drug_id);
    expect(params[1]).toBe(DRUG.slug);
    expect(params[3]).toBe('a@b.co');
    expect(params[5]).toBe(true);
    expect(params[6]).toMatch(/^[0-9a-f]{32}$/); // ip hash, never the address
    expect(params[6]).not.toContain('203.0.113');
    // the admin notification never carries the visitor's text, name or e-mail
    const [subject, text] = notify.mock.calls[0] as unknown as [string, string];
    expect(text).toContain('/admin/comments');
    expect(text).not.toContain(body);
    expect(text).not.toContain('أحمد');
    expect(subject + text).not.toContain('a@b.co');
  });

  it('refuses the 4th comment of an IP within an hour, and a 2nd on the same drug within a day', async () => {
    const { submitComment } = await import('@/lib/feedback/submit');
    apiQuery.mockResolvedValueOnce(count(3)).mockResolvedValueOnce(count(0));
    const hour = await submitComment(commentForm(), ctx);
    expect(hour.ok).toBe(false);
    expect(hour.error).toMatch(/الساعة/);
    apiQuery.mockReset();
    apiQuery.mockResolvedValueOnce(count(1)).mockResolvedValueOnce(count(1));
    const day = await submitComment(commentForm(), ctx);
    expect(day.ok).toBe(false);
    expect(day.error).toMatch(/اليوم/);
    expect(apiQuery.mock.calls.some((c) => /insert/.test(String(c[0])))).toBe(false);
  });

  it('returns field errors without touching the database, and drops honeypot posts silently', async () => {
    const { submitComment } = await import('@/lib/feedback/submit');
    const bad = await submitComment(commentForm({ body: 'قصير', name: '' }), ctx);
    expect(bad.ok).toBe(false);
    expect(bad.fieldErrors?.body).toBeTruthy();
    expect(bad.fieldErrors?.name).toBeTruthy();
    const bot = await submitComment(commentForm({ [HONEYPOT_FIELD]: 'http://spam' }), ctx);
    expect(bot.ok).toBe(true); // looks accepted to the bot …
    const fast = await submitComment(commentForm({ t: String(ctx.now - 500) }), ctx);
    expect(fast.ok).toBe(false);
    expect(webQuery).not.toHaveBeenCalled(); // … but nothing was looked up or stored
    expect(apiQuery).not.toHaveBeenCalled();
  });

  it('rejects an unknown drug slug after one read', async () => {
    webQuery.mockResolvedValue([]);
    const { submitComment } = await import('@/lib/feedback/submit');
    const res = await submitComment(commentForm({ slug: 'no-such-drug' }), ctx);
    expect(res.ok).toBe(false);
    expect(webQuery).toHaveBeenCalledTimes(1);
    expect(apiQuery).not.toHaveBeenCalled();
  });
});

describe('submitReport', () => {
  it('saves the right drug_id, type, suggested price and page URL; 5 per hour', async () => {
    apiQuery.mockResolvedValueOnce(count(0)).mockResolvedValueOnce([{ id: '3' }]);
    const { submitReport } = await import('@/lib/feedback/submit');
    const res = await submitReport(
      form({ slug: DRUG.slug, type: 'PRICE', details: 'السعر في الصيدلية 110 وليس 99', suggested_price: '110', contact: '', page_url: 'https://dwaprice.com/dawa/brufen-600mg-30-tab?x=1', referrer: 'https://google.com/', t: String(ctx.now - 10_000), [HONEYPOT_FIELD]: '' }),
      ctx,
    );
    expect(res.ok).toBe(true);
    const insert = apiQuery.mock.calls[1];
    expect(String(insert[0])).toMatch(/insert into api\.drug_reports/);
    const p = insert[1] as unknown[];
    expect(p[0]).toBe(DRUG.drug_id);
    expect(p[2]).toBe('PRICE');
    expect(p[4]).toBe(110);
    expect(p[6]).toBe('https://dwaprice.com/dawa/brufen-600mg-30-tab?x=1');
    expect(p[7]).toBe('https://google.com/');
    apiQuery.mockReset();
    apiQuery.mockResolvedValueOnce(count(5));
    const limited = await submitReport(form({ slug: DRUG.slug, type: 'OTHER', details: 'مكرر مع صفحة أخرى', t: String(ctx.now - 10_000), [HONEYPOT_FIELD]: '' }), ctx);
    expect(limited.ok).toBe(false);
    expect(limited.error).toMatch(/البلاغات/);
  });
});

describe('admin moderation: non-admins get 403', () => {
  it('every action refuses without an active admin session and touches nothing', async () => {
    const m = await import('@/lib/feedback/moderation');
    const f = form({ id: '1', status: 'APPROVED', reply: 'x', note: 'y' });
    for (const fn of [m.moderateComments, m.deleteComment, m.replyToComment, m.setReportStatus, m.noteReport]) {
      expect(await fn(f)).toEqual({ ok: false, status: 403 });
    }
    session = { id: 'u1', email: 'disabled@example.com' };
    adminRow = { id: 'u1', email: 'disabled@example.com', status: 'disabled' };
    expect(await m.moderateComments(f)).toEqual({ ok: false, status: 403 });
    expect(apiQuery).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('an active admin approves and only the comments tag of that drug page is refreshed', async () => {
    session = { id: 'u1', email: 'admin@example.com' };
    adminRow = { id: 'u1', email: 'admin@example.com', status: 'active' };
    apiQuery.mockResolvedValueOnce([{ drug_slug: DRUG.slug }]).mockResolvedValueOnce([]);
    const { moderateComments } = await import('@/lib/feedback/moderation');
    expect(await moderateComments(form({ id: '12', status: 'APPROVED' }))).toEqual({ ok: true, status: 200 });
    const update = apiQuery.mock.calls[1];
    expect(String(update[0])).toMatch(/update api\.drug_comments set status/);
    expect(update[1]).toEqual([['12'], 'APPROVED', 'admin@example.com']);
    expect(revalidateTag).toHaveBeenCalledWith(`comments:${DRUG.slug}`, 'max');
    expect(revalidateTag.mock.calls.some((c) => String(c[0]).startsWith('drug:'))).toBe(false);
  });

  it('rejects an unknown status (PENDING cannot be set back) and bad ids', async () => {
    session = { id: 'u1', email: 'admin@example.com' };
    adminRow = { id: 'u1', email: 'admin@example.com', status: 'active' };
    const { moderateComments } = await import('@/lib/feedback/moderation');
    expect(await moderateComments(form({ id: '1', status: 'PENDING' }))).toEqual({ ok: false, status: 400 });
    expect(await moderateComments(form({ id: 'abc; drop', status: 'APPROVED' }))).toEqual({ ok: false, status: 400 });
    expect(apiQuery).not.toHaveBeenCalled();
  });
});

describe('public read', () => {
  it('reads only through the APPROVED-only view with the read-only role, never the api table', async () => {
    webQuery.mockResolvedValue([{ id: '1', name: 'x', body: 'y', is_pharmacist: false, admin_reply: null, created_at: '2026-10-23T00:00:00Z' }]);
    const { getApprovedComments } = await import('@/lib/feedback/read');
    const rows = await getApprovedComments(DRUG.drug_id, DRUG.slug);
    expect(rows).toHaveLength(1);
    const sql = String(webQuery.mock.calls[0][0]);
    expect(sql).toMatch(/from web\.drug_comments/);
    expect(sql).not.toMatch(/api\./);
    expect(sql).not.toMatch(/email|ip_hash|user_agent/);
    expect(apiQuery).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- real database round trip
const envLine = (n: string) => {
  try {
    return readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${n}=`))?.slice(n.length + 1).trim();
  } catch {
    return undefined;
  }
};
const API_DB = process.env.API_DATABASE_URL || envLine('API_DATABASE_URL');
const WEB_DB = process.env.WEB_DATABASE_URL || envLine('WEB_DATABASE_URL');

(API_DB && WEB_DB ? describe : describe.skip)('database: a comment is hidden from the public view until APPROVED', () => {
  it('PENDING → invisible to web_reader; APPROVED → visible; then removed', { timeout: 60_000 }, async () => {
    const { default: pg } = await import('pg');
    const api = new pg.Client({ connectionString: API_DB, ssl: { rejectUnauthorized: false } });
    const web = new pg.Client({ connectionString: WEB_DB, ssl: { rejectUnauthorized: false } });
    await Promise.all([api.connect(), web.connect()]);
    let id: string | null = null;
    try {
      const drug = (await web.query<{ drug_id: string; slug: string }>('select drug_id, slug from web.drug_cards where slug = $1', [DRUG.slug])).rows[0];
      expect(drug).toBeTruthy();
      id = (
        await api.query<{ id: string }>(
          `insert into api.drug_comments (drug_id, drug_slug, name, email, body, is_pharmacist, ip_hash, user_agent)
           values ($1, $2, 'vitest', 'secret@example.com', $3, true, 'testhash', 'vitest') returning id::text`,
          [drug.drug_id, drug.slug, 'تعليق اختبار آلي يُحذف بعد قليل'],
        )
      ).rows[0].id;
      const visible = async () => (await web.query('select * from web.drug_comments where id = $1', [id])).rows;
      expect(await visible()).toHaveLength(0); // PENDING: not on the site
      await api.query("update api.drug_comments set status = 'APPROVED' where id = $1", [id]);
      const rows = await visible();
      expect(rows).toHaveLength(1);
      // the view never exposes the private columns
      expect(Object.keys(rows[0]).sort()).toEqual(['admin_reply', 'body', 'created_at', 'drug_id', 'drug_slug', 'id', 'is_pharmacist', 'name']);
      // and web_reader cannot reach the table itself
      await expect(web.query('select email from api.drug_comments where id = $1', [id])).rejects.toThrow();
    } finally {
      if (id) await api.query('delete from api.drug_comments where id = $1', [id]);
      await Promise.all([api.end(), web.end()]);
    }
  });
});
