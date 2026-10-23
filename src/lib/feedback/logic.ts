// Pure rules of the visitor forms on drug pages — comments and "report a problem": field limits,
// text cleaning, the URL ban, the honeypot + submit-time bot check, and the labels. No server or
// database code here, so the client forms (live validation), the server actions and the unit tests
// share one definition. Server code: lib/feedback/actions.ts (public) and lib/feedback/admin.ts.

export const COMMENT_LIMITS = { name: 60, bodyMin: 20, bodyMax: 1000, email: 200 } as const;
export const REPORT_LIMITS = { detailsMin: 10, detailsMax: 800, contact: 200, pageUrl: 500 } as const;

export const COMMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SPAM'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];
export const COMMENT_STATUS_LABEL: Record<CommentStatus, string> = {
  PENDING: 'بانتظار المراجعة',
  APPROVED: 'منشور',
  REJECTED: 'مرفوض',
  SPAM: 'مزعج',
};

export const REPORT_TYPES = ['PRICE', 'UNAVAILABLE', 'DATA', 'DUPLICATE', 'OTHER'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  PRICE: 'السعر غلط',
  UNAVAILABLE: 'الدواء غير متوفر',
  DATA: 'بيانات الدواء غلط',
  DUPLICATE: 'دواء مكرر',
  OTHER: 'أخرى',
};

export const REPORT_STATUSES = ['NEW', 'IN_REVIEW', 'FIXED', 'REJECTED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  NEW: 'جديد',
  IN_REVIEW: 'قيد المراجعة',
  FIXED: 'تم التصحيح',
  REJECTED: 'مرفوض',
};

/** Rate limits (rows of EVERY status count, so a rejection does not refill a sender's budget). */
export const RATE_LIMITS = {
  commentsPerIpPerHour: 3,
  commentsPerDrugPerIpPerDay: 1,
  reportsPerIpPerHour: 5,
} as const;

/** Submit-time window: a form posted faster than this is a bot; older than the max is a stale/replayed page. */
export const SUBMIT_MIN_MS = 3_000;
export const SUBMIT_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Names of the two hidden anti-bot fields (shared by the forms and the actions). The honeypot name
 * is deliberately meaningless: a semantic name such as "website" or "url" is exactly what browser
 * autofill matches when a visitor autofills their name/e-mail — Chrome then fills the hidden field
 * too, the server sees a "bot" and drops a real comment with a fake success (this happened).
 */
export const HONEYPOT_FIELD = 'fx_k2';
export const TIMESTAMP_FIELD = 't';

/** Plain text only: tags removed, control characters dropped, whitespace tidied. Rendered as text anyway. */
export function cleanText(input: unknown, max: number): string {
  return String(input ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Single-line field: as cleanText but no line breaks. */
export function cleanLine(input: unknown, max: number): string {
  return cleanText(input, max).replace(/\s*\n\s*/g, ' ').trim();
}

const TLDS = 'com|net|org|info|biz|io|me|co|eg|ly|link|site|online|xyz|shop|store|app|dev|tv|ru|cn|uk|de|fr|es|it|nl|pro|club|top|live|life|news|blog|page|cc|ws|tk|ml|ga|cf|gq';
/** Anything that looks like a link: a scheme, "www.", or a bare domain with a common TLD. */
export const URL_RE = new RegExp(`(https?:\\/\\/|ftp:\\/\\/|www\\.|\\b[\\w-]+(\\.[\\w-]+)*\\.(${TLDS})\\b)`, 'i');
export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Honeypot filled, or posted outside the plausible time window → a bot. `now` is injectable for tests. */
export function botCheck(honeypot: unknown, timestamp: unknown, now = Date.now()): 'ok' | 'honeypot' | 'too-fast' | 'stale' {
  if (String(honeypot ?? '').trim() !== '') return 'honeypot';
  const t = Number(timestamp);
  if (!Number.isFinite(t) || t <= 0) return 'too-fast';
  const age = now - t;
  if (age < SUBMIT_MIN_MS) return 'too-fast';
  if (age > SUBMIT_MAX_MS) return 'stale';
  return 'ok';
}

export interface CommentInput {
  name: string;
  email: string;
  body: string;
  isPharmacist: boolean;
}
export type FieldErrors = Record<string, string>;

/** Server-side (and live client) validation of a comment; returns the cleaned values + per-field errors. */
export function validateComment(raw: { name?: unknown; email?: unknown; body?: unknown; isPharmacist?: unknown }): { value: CommentInput; errors: FieldErrors } {
  const value: CommentInput = {
    name: cleanLine(raw.name, COMMENT_LIMITS.name + 1),
    email: cleanLine(raw.email, COMMENT_LIMITS.email + 1).toLowerCase(),
    body: cleanText(raw.body, COMMENT_LIMITS.bodyMax + 1),
    isPharmacist: raw.isPharmacist === true || raw.isPharmacist === 'on' || raw.isPharmacist === 'true',
  };
  const errors: FieldErrors = {};
  if (!value.name) errors.name = 'الاسم مطلوب.';
  else if (value.name.length > COMMENT_LIMITS.name) errors.name = `الاسم أطول من ${COMMENT_LIMITS.name} حرفًا.`;
  else if (containsUrl(value.name)) errors.name = 'لا تضع روابط في الاسم.';
  if (!value.body) errors.body = 'التعليق مطلوب.';
  else if (value.body.length < COMMENT_LIMITS.bodyMin) errors.body = `التعليق قصير جدًا (${COMMENT_LIMITS.bodyMin} حرفًا على الأقل).`;
  else if (value.body.length > COMMENT_LIMITS.bodyMax) errors.body = `التعليق أطول من ${COMMENT_LIMITS.bodyMax} حرف.`;
  else if (containsUrl(value.body)) errors.body = 'لا يُسمح بالروابط في التعليقات.';
  if (value.email && (!EMAIL_RE.test(value.email) || value.email.length > COMMENT_LIMITS.email)) errors.email = 'بريد إلكتروني غير صالح.';
  return { value, errors };
}

export interface ReportInput {
  type: ReportType;
  details: string;
  suggestedPrice: number | null;
  contact: string;
  pageUrl: string;
  referrer: string;
}

/** Server-side (and live client) validation of a problem report. */
export function validateReport(raw: {
  type?: unknown;
  details?: unknown;
  suggestedPrice?: unknown;
  contact?: unknown;
  pageUrl?: unknown;
  referrer?: unknown;
}): { value: ReportInput; errors: FieldErrors } {
  const type = String(raw.type ?? '') as ReportType;
  const priceRaw = String(raw.suggestedPrice ?? '').trim().replace(/,/g, '.').replace(/[^\d.]/g, '');
  const price = priceRaw ? Number(priceRaw) : null;
  const value: ReportInput = {
    type: REPORT_TYPES.includes(type) ? type : 'OTHER',
    details: cleanText(raw.details, REPORT_LIMITS.detailsMax + 1),
    suggestedPrice: type === 'PRICE' && price !== null && Number.isFinite(price) && price >= 0 && price < 1_000_000 ? Math.round(price * 100) / 100 : null,
    contact: cleanLine(raw.contact, REPORT_LIMITS.contact + 1),
    pageUrl: cleanLine(raw.pageUrl, REPORT_LIMITS.pageUrl),
    referrer: cleanLine(raw.referrer, REPORT_LIMITS.pageUrl),
  };
  const errors: FieldErrors = {};
  if (!REPORT_TYPES.includes(type)) errors.type = 'اختر نوع المشكلة.';
  if (!value.details) errors.details = 'اكتب تفاصيل المشكلة.';
  else if (value.details.length < REPORT_LIMITS.detailsMin) errors.details = `التفاصيل قصيرة جدًا (${REPORT_LIMITS.detailsMin} أحرف على الأقل).`;
  else if (value.details.length > REPORT_LIMITS.detailsMax) errors.details = `التفاصيل أطول من ${REPORT_LIMITS.detailsMax} حرف.`;
  else if (containsUrl(value.details)) errors.details = 'لا يُسمح بالروابط في البلاغ.';
  if (type === 'PRICE' && priceRaw && value.suggestedPrice === null) errors.suggestedPrice = 'سعر غير صالح.';
  if (value.contact.length > REPORT_LIMITS.contact) errors.contact = `بيانات التواصل أطول من ${REPORT_LIMITS.contact} حرف.`;
  else if (value.contact && !EMAIL_RE.test(value.contact) && !/^\+?[\d\s-]{8,20}$/.test(value.contact)) errors.contact = 'اكتب بريدًا إلكترونيًا أو رقم واتساب صالحًا.';
  // Only a same-site page URL is kept (the client fills it from location.href); anything else is dropped, not an error.
  if (value.pageUrl && !/^(https?:\/\/[^/]+)?\/dawa\/[a-z0-9-]+/.test(value.pageUrl)) value.pageUrl = '';
  return { value, errors };
}

/** True when a slug can be a drug page slug (web.drug_cards.slug). */
export const SLUG_RE = /^[a-z0-9-]{1,200}$/;

/** Result of a public form submission (useActionState). `at` changes per submit so the UI re-reacts. */
export interface FeedbackFormState {
  ok?: boolean;
  /** Form-level message (rate limit, bot check, server trouble). */
  error?: string;
  /** Success text to show in place of the form. */
  message?: string;
  fieldErrors?: FieldErrors;
  at?: number;
}

export const COMMENT_THANKS = 'تم استلام تعليقك وسيظهر بعد المراجعة.';
export const REPORT_THANKS = 'شكراً، هنراجع البلاغ ونصحّحه لو لزم.';
export const COMMENT_NOTE = 'التعليقات للمعلومات العامة ولا تُعد نصيحة طبية. لا تذكر بيانات شخصية.';
