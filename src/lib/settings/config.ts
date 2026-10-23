// Shape, keys and defaults of the editable site settings. Pure (no server-only), so both the
// public read (lib/settings/read.ts) and the admin actions share one source of truth. One row per
// group in api.site_settings (key = 'seo' | 'analytics' | 'verification' | 'contact'); the value
// is the jsonb object below. Defaults come from SITE / env, so an empty database behaves exactly
// like today.
import { SITE } from '@/lib/site';

export const SETTING_GROUPS = ['seo', 'analytics', 'verification', 'contact'] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export interface SeoSettings {
  /** Home page <title> (absolute, the site name is appended by the UI where needed). */
  homeTitle: string;
  /** Home page meta description. */
  homeDescription: string;
  /** Suffix appended to inner page titles (" | …"). */
  titleSuffix: string;
  /** Default Open Graph / social description. */
  ogText: string;
}

export interface AnalyticsSettings {
  /** GA4 Measurement ID "G-XXXXXXXXXX", or "" for no analytics at all. */
  ga4MeasurementId: string;
}

export interface VerificationSettings {
  /** google-site-verification token (value only, no tag). */
  google: string;
  /** msvalidate.01 token (Bing). */
  bing: string;
}

export interface SocialLinks {
  facebook: string;
  x: string;
  instagram: string;
  youtube: string;
  telegram: string;
}

export interface ContactSettings {
  email: string;
  /** Digits only, international format without "+". "" = hidden. */
  whatsapp: string;
  /** WhatsApp Channel URL (https://whatsapp.com/channel/…). "" = the channel button is hidden everywhere. */
  whatsappChannelUrl: string;
  social: SocialLinks;
}

export interface SiteSettings {
  seo: SeoSettings;
  analytics: AnalyticsSettings;
  verification: VerificationSettings;
  contact: ContactSettings;
}

// The home <title> STARTS with the site name (Google reads the site name from the home page title,
// the WebSite JSON-LD and og:site_name — they must agree, and the name must come first here).
// Inner pages keep the name as the " | …" suffix (titleSuffix below).
export const HOME_TITLE_DEFAULT = `${SITE.name} | أسعار الأدوية في مصر محدثة يومياً`;
// Kept within SEO_LIMITS.homeDescription (160) so the default prefill is itself valid.
export const HOME_DESCRIPTION_DEFAULT =
  'اعرف سعر أي دواء في مصر بآخر تحديث، مع المثائل الأرخص بنفس المادة الفعالة والبدائل، وأحدث تغييرات الأسعار، والأدوية حسب الشركة والتصنيف.';

/** Settings with no override yet: the site behaves exactly as it does from code/env today. */
export function defaultSettings(): SiteSettings {
  return {
    seo: {
      homeTitle: HOME_TITLE_DEFAULT,
      homeDescription: HOME_DESCRIPTION_DEFAULT,
      titleSuffix: ` | ${SITE.name}`,
      ogText: SITE.description,
    },
    analytics: { ga4MeasurementId: '' },
    verification: { google: '', bing: '' },
    contact: {
      email: SITE.contactEmail,
      whatsapp: (process.env.WHATSAPP_NUMBER ?? '').replace(/\D/g, ''),
      whatsappChannelUrl: '',
      social: { facebook: '', x: '', instagram: '', youtube: '', telegram: '' },
    },
  };
}

/** Length limits used by the SEO form's live counters and the server validation. */
export const SEO_LIMITS = { homeTitle: 60, homeDescription: 160, titleSuffix: 40, ogText: 200 } as const;

export const GA4_RE = /^G-[A-Z0-9]{8,12}$/;

/** Accepts a bare token or a full pasted <meta …> tag, returns the token (or ""). */
export function parseVerificationToken(input: string, attr: 'google-site-verification' | 'msvalidate.01'): string {
  const raw = (input ?? '').trim();
  if (!raw) return '';
  // full tag pasted: pull content="…"
  const tag = new RegExp(`name=["']${attr}["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*name=["']${attr}["']`, 'i').exec(raw);
  const value = (tag ? (tag[1] ?? tag[2]) : raw).trim();
  // tokens are url-safe base64-ish; strip anything else defensively
  return /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : '';
}

/** Normalises a GA4 Measurement ID; returns "" when not a valid G-XXXXXXXXXX. */
export function parseGa4Id(input: string): string {
  const v = (input ?? '').trim().toUpperCase();
  return GA4_RE.test(v) ? v : '';
}

/** Digits only (WhatsApp / phone), max 15 (E.164). */
export function parseWhatsapp(input: string): string {
  return (input ?? '').replace(/\D/g, '').slice(0, 15);
}

/** A WhatsApp Channel link: https://whatsapp.com/channel/<id> (www. allowed). Returns "" when not one. */
export const WHATSAPP_CHANNEL_RE = /^https:\/\/(www\.)?whatsapp\.com\/channel\/[A-Za-z0-9_-]{6,}$/;
export function parseWhatsappChannelUrl(input: string): string {
  const v = (input ?? '').trim().replace(/\/+$/, '');
  return WHATSAPP_CHANNEL_RE.test(v) ? v : '';
}
