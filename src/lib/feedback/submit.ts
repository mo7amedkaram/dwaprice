import 'server-only';
// The public write path of the drug-page forms (comments, problem reports). Called by the server
// actions in ./actions.ts with the request context; kept apart from them so it can be unit-tested
// with the database and the notifier mocked.
//
// Order of work, cheapest first: parse + validate → honeypot/time check → the drug must exist (one
// read on the public web.drug_cards view, which also yields drug_id) → rate-limit counts (two
// index-only count(*) on api.* through the write role) → insert → notify the admin.
//
// Privacy: the client address is stored only as an HMAC with a server secret; the notification
// e-mail carries no visitor text (subject + admin link only), and with no e-mail configured the
// existing notifier logs just "skipped".
import { createHmac } from 'node:crypto';
import { query } from '@/lib/db';
import { apiQuery } from '@/lib/api/db';
import { notifyAdmin } from '@/lib/api/notify';
import { SITE } from '@/lib/site';
import {
  COMMENT_THANKS,
  HONEYPOT_FIELD,
  RATE_LIMITS,
  REPORT_THANKS,
  SLUG_RE,
  TIMESTAMP_FIELD,
  botCheck,
  validateComment,
  validateReport,
  type FeedbackFormState,
} from './logic';

/** What the action extracts from the request for the core. */
export interface SubmitContext {
  ip: string;
  userAgent: string | null;
  /** Injectable clock (tests). */
  now?: number;
}

/** HMAC-SHA256 of the address with a server secret: stable per visitor, never reversible to the IP. */
export function hashIp(ip: string, secret = process.env.API_SECRET || process.env.REVALIDATE_SECRET || ''): string {
  return createHmac('sha256', secret || 'dwaprice').update(ip).digest('hex').slice(0, 32);
}

interface DrugRow {
  drug_id: string;
  slug: string;
  name_ar: string | null;
  name_en: string;
}

async function findDrug(slug: string): Promise<DrugRow | null> {
  if (!SLUG_RE.test(slug)) return null;
  const rows = await query<DrugRow>('select drug_id, slug, name_ar, name_en from web.drug_cards where slug = $1', [slug]);
  return rows[0] ?? null;
}

const fail = (error: string): FeedbackFormState => ({ ok: false, error, at: Date.now() });
const TRY_AGAIN = 'لم نتمكن من استلام النموذج. انتظر لحظات ثم أعد المحاولة.';
const BUSY = 'تعذّر الإرسال الآن. حاول مرة أخرى بعد قليل.';

function fields(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

// ---------------------------------------------------------------- comments

export async function submitComment(form: FormData, ctx: SubmitContext): Promise<FeedbackFormState> {
  const f = fields(form);
  const { value, errors } = validateComment({ name: f.name, email: f.email, body: f.body, isPharmacist: f.is_pharmacist });
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, at: Date.now() };

  const bot = botCheck(f[HONEYPOT_FIELD], f[TIMESTAMP_FIELD], ctx.now);
  // A filled honeypot is a bot: say "received" and store nothing — but leave a content-free trace,
  // so a drop can be told apart from a lost request when someone looks (never the visitor's text).
  if (bot === 'honeypot') {
    console.warn('[feedback] comment dropped: honeypot filled');
    return { ok: true, message: COMMENT_THANKS, at: Date.now() };
  }
  if (bot !== 'ok') return fail(TRY_AGAIN);

  const drug = await findDrug(String(f.slug ?? ''));
  if (!drug) return fail('هذه الصفحة غير موجودة.');

  const ipHash = hashIp(ctx.ip);
  try {
    const [perHour, perDrug] = await Promise.all([
      apiQuery<{ n: string }>("select count(*) n from api.drug_comments where ip_hash = $1 and created_at > now() - interval '1 hour'", [ipHash]),
      apiQuery<{ n: string }>("select count(*) n from api.drug_comments where ip_hash = $1 and drug_id = $2 and created_at > now() - interval '1 day'", [ipHash, drug.drug_id]),
    ]);
    if (Number(perHour[0]?.n ?? 0) >= RATE_LIMITS.commentsPerIpPerHour) return fail('وصلت إلى الحد الأقصى (3 تعليقات في الساعة من نفس الاتصال). حاول لاحقًا.');
    if (Number(perDrug[0]?.n ?? 0) >= RATE_LIMITS.commentsPerDrugPerIpPerDay) return fail('سبق إرسال تعليق على هذا الدواء من نفس الاتصال اليوم؛ يُسمح بتعليق واحد لكل دواء في اليوم.');

    const inserted = await apiQuery<{ id: string }>(
      `insert into api.drug_comments (drug_id, drug_slug, name, email, body, is_pharmacist, ip_hash, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id::text`,
      [drug.drug_id, drug.slug, value.name, value.email || null, value.body, value.isPharmacist, ipHash, ctx.userAgent?.slice(0, 300) ?? null],
    );
    // The e-mail names the drug and links to the moderation queue — never the visitor's text, name or address.
    await notifyAdmin('تعليق جديد بانتظار المراجعة', `تعليق جديد (#${inserted[0]?.id}) على صفحة ${drug.name_ar ?? drug.name_en}.\n\nراجعه هنا: ${SITE.url}/admin/comments\n`).catch(() => false);
  } catch (error) {
    console.error('comment submit failed', (error as Error).message);
    return fail(BUSY);
  }
  return { ok: true, message: COMMENT_THANKS, at: Date.now() };
}

// ---------------------------------------------------------------- reports

export async function submitReport(form: FormData, ctx: SubmitContext): Promise<FeedbackFormState> {
  const f = fields(form);
  const { value, errors } = validateReport({
    type: f.type,
    details: f.details,
    suggestedPrice: f.suggested_price,
    contact: f.contact,
    pageUrl: f.page_url,
    referrer: f.referrer,
  });
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, at: Date.now() };

  const bot = botCheck(f[HONEYPOT_FIELD], f[TIMESTAMP_FIELD], ctx.now);
  if (bot === 'honeypot') {
    console.warn('[feedback] report dropped: honeypot filled');
    return { ok: true, message: REPORT_THANKS, at: Date.now() };
  }
  if (bot !== 'ok') return fail(TRY_AGAIN);

  const drug = await findDrug(String(f.slug ?? ''));
  if (!drug) return fail('هذه الصفحة غير موجودة.');

  const ipHash = hashIp(ctx.ip);
  try {
    const perHour = await apiQuery<{ n: string }>("select count(*) n from api.drug_reports where ip_hash = $1 and created_at > now() - interval '1 hour'", [ipHash]);
    if (Number(perHour[0]?.n ?? 0) >= RATE_LIMITS.reportsPerIpPerHour) return fail('وصلت إلى الحد الأقصى من البلاغات لهذه الساعة. حاول لاحقًا.');

    const inserted = await apiQuery<{ id: string }>(
      `insert into api.drug_reports (drug_id, drug_slug, type, details, suggested_price, contact, page_url, referrer, ip_hash, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::text`,
      [drug.drug_id, drug.slug, value.type, value.details, value.suggestedPrice, value.contact || null, value.pageUrl || null, value.referrer || null, ipHash, ctx.userAgent?.slice(0, 300) ?? null],
    );
    await notifyAdmin('بلاغ جديد عن بيانات دواء', `بلاغ جديد (#${inserted[0]?.id}) عن صفحة ${drug.name_ar ?? drug.name_en}.\n\nراجعه هنا: ${SITE.url}/admin/reports\n`).catch(() => false);
  } catch (error) {
    console.error('report submit failed', (error as Error).message);
    return fail(BUSY);
  }
  return { ok: true, message: REPORT_THANKS, at: Date.now() };
}
