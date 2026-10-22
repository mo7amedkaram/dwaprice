'use server';
// Server actions behind the admin settings forms. Every action re-checks the admin session on the
// server (not just hidden UI) and returns a 403-style error state instead of redirecting in the
// middle of a save. Writes go through lib/settings/write.ts (role api_app) and revalidate the
// public cache. CSRF is covered by Next's same-origin check on server actions.
import { getAdmin } from '@/lib/api/admin-auth';
import { getSession } from '@/lib/api/session';
import type { SettingsFormState } from '@/components/admin/SettingsForm';
import {
  SEO_LIMITS,
  parseGa4Id,
  parseVerificationToken,
  parseWhatsapp,
  type ContactSettings,
  type SeoSettings,
} from './config';
import { deleteAssets, putAssets, saveGroup } from './write';
import { generateIcons, ICON_ASSET_NAMES, validateUpload } from './favicon';

async function currentAdmin(): Promise<{ id: string; email: string } | null> {
  const s = await getSession('admin');
  const admin = s ? await getAdmin(s.id) : null;
  return admin && admin.status === 'active' ? { id: admin.id, email: admin.email } : null;
}

const forbidden: SettingsFormState = { ok: false, error: 'انتهت الجلسة أو لا تملك صلاحية. سجّل الدخول مرة أخرى.', at: Date.now() };
const str = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

// ---------------------------------------------------------------- SEO defaults

export async function saveSeoAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const value: SeoSettings = {
    homeTitle: str(form, 'homeTitle').slice(0, 200),
    homeDescription: str(form, 'homeDescription').slice(0, 400),
    titleSuffix: str(form, 'titleSuffix').slice(0, 80),
    ogText: str(form, 'ogText').slice(0, 400),
  };
  const fieldErrors: Record<string, string> = {};
  if (!value.homeTitle) fieldErrors.homeTitle = 'العنوان مطلوب.';
  else if (value.homeTitle.length > SEO_LIMITS.homeTitle) fieldErrors.homeTitle = `العنوان أطول من ${SEO_LIMITS.homeTitle} حرفًا.`;
  if (!value.homeDescription) fieldErrors.homeDescription = 'الوصف مطلوب.';
  else if (value.homeDescription.length > SEO_LIMITS.homeDescription) fieldErrors.homeDescription = `الوصف أطول من ${SEO_LIMITS.homeDescription} حرفًا.`;
  if (value.titleSuffix.length > SEO_LIMITS.titleSuffix) fieldErrors.titleSuffix = `اللاحقة أطول من ${SEO_LIMITS.titleSuffix} حرفًا.`;
  if (value.ogText.length > SEO_LIMITS.ogText) fieldErrors.ogText = `النص أطول من ${SEO_LIMITS.ogText} حرفًا.`;
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors, at: Date.now() };
  await saveGroup('seo', value, admin.email);
  return { ok: true, at: Date.now() };
}

// ---------------------------------------------------------------- Analytics (GA4)

export async function saveAnalyticsAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const raw = str(form, 'ga4MeasurementId');
  const id = parseGa4Id(raw);
  if (raw && !id) return { ok: false, fieldErrors: { ga4MeasurementId: 'المعرّف يجب أن يكون بصيغة G-XXXXXXXXXX.' }, at: Date.now() };
  await saveGroup('analytics', { ga4MeasurementId: id }, admin.email);
  return { ok: true, at: Date.now() };
}

// ---------------------------------------------------------------- Verification codes

export async function saveVerificationAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const google = parseVerificationToken(str(form, 'google'), 'google-site-verification');
  const bing = parseVerificationToken(str(form, 'bing'), 'msvalidate.01');
  const fieldErrors: Record<string, string> = {};
  if (str(form, 'google') && !google) fieldErrors.google = 'رمز غير صالح. الصق الرمز أو وسم <meta> كاملًا.';
  if (str(form, 'bing') && !bing) fieldErrors.bing = 'رمز غير صالح. الصق الرمز أو وسم <meta> كاملًا.';
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors, at: Date.now() };
  await saveGroup('verification', { google, bing }, admin.email);
  return { ok: true, at: Date.now() };
}

// ---------------------------------------------------------------- Contact + social

const SOCIAL_HOSTS: Record<keyof ContactSettings['social'], RegExp> = {
  facebook: /facebook\.com|fb\.com/i,
  x: /x\.com|twitter\.com/i,
  instagram: /instagram\.com/i,
  youtube: /youtube\.com|youtu\.be/i,
  telegram: /t\.me|telegram\.me/i,
};

function cleanUrl(input: string, host: RegExp): { value: string; error?: string } {
  const v = input.trim();
  if (!v) return { value: '' };
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { value: '', error: 'رابط غير صالح.' };
    if (!host.test(u.hostname)) return { value: '', error: 'الرابط لا يطابق المنصة.' };
    return { value: u.toString() };
  } catch {
    return { value: '', error: 'رابط غير صالح.' };
  }
}

export async function saveContactAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const email = str(form, 'email');
  const fieldErrors: Record<string, string> = {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) fieldErrors.email = 'بريد إلكتروني غير صالح.';
  const social = {} as ContactSettings['social'];
  for (const key of Object.keys(SOCIAL_HOSTS) as Array<keyof ContactSettings['social']>) {
    const { value, error } = cleanUrl(str(form, key), SOCIAL_HOSTS[key]);
    if (error) fieldErrors[key] = error;
    social[key] = value;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors, at: Date.now() };
  const value: ContactSettings = { email, whatsapp: parseWhatsapp(str(form, 'whatsapp')), social };
  await saveGroup('contact', value, admin.email);
  return { ok: true, at: Date.now() };
}

// ---------------------------------------------------------------- Branding (favicon)

export async function uploadFaviconAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const admin = await currentAdmin();
  if (!admin) return forbidden;
  const file = form.get('favicon');
  if (!(file instanceof File) || file.size === 0) return { ok: false, fieldErrors: { favicon: 'اختر ملف صورة أولًا.' }, at: Date.now() };
  if (file.size > 2 * 1024 * 1024) return { ok: false, fieldErrors: { favicon: 'حجم الملف أكبر من 2 ميجابايت.' }, at: Date.now() };
  const buf = Buffer.from(await file.arrayBuffer());
  const v = await validateUpload(buf);
  if (!v.ok) return { ok: false, fieldErrors: { favicon: v.error }, at: Date.now() };
  const assets = await generateIcons(buf);
  await putAssets(assets, admin.email);
  return { ok: true, at: Date.now() };
}

export async function resetFaviconAction(): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  await deleteAssets(ICON_ASSET_NAMES, admin.email);
}
