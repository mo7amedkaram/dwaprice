// Tiny client helper for GA4 events. No-op until the Google script is loaded (SiteAnalytics loads
// it directly on every public page; there is no consent gate). Never pass drug names or search
// text — only the coarse, non-personal parameters below.
export type DwEvent =
  | { name: 'search_used'; params: { method: 'suggestion_clicked' | 'full_search' } }
  | { name: 'voice_search_used'; params?: never }
  | { name: 'view_alternatives'; params?: never }
  | { name: 'toggle_info_language'; params: { lang: 'ar' | 'en' } }
  | { name: 'outbound_click'; params: { domain: string } }
  | { name: 'whatsapp_channel_click'; params: { placement: 'home' | 'header' | 'footer' | 'last_prices' } }
  /** A wildcard pattern ("Au*in") produced suggestions or results. Never the query text. */
  | { name: 'wildcard_search_used'; params?: never };

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: DwEvent): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', event.name, 'params' in event ? event.params : {});
}

/**
 * page_view parameters for GA4 — the path only, never the query string (so ?q=… search text and
 * any other query parameters are never sent to Google). `pathname` comes from usePathname(); any
 * query passed in is dropped defensively.
 */
export function pageViewParams(origin: string, pathname: string): { page_location: string; page_path: string } {
  const path = (pathname || '/').split('?')[0].split('#')[0];
  return { page_location: origin.replace(/\/+$/, '') + path, page_path: path };
}
