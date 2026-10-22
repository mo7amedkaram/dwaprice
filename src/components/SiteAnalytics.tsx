'use client';

// Google Analytics 4, loaded on every page view (no cookie-consent gate). Privacy: IP anonymised,
// Google signals and ad personalisation off, automatic page_view off — we send page_view ourselves
// with the path only (never the ?q= search query or any query string). Not loaded on the admin area,
// and not loaded at all when the GA4 measurement id is left empty in the admin settings.
import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { pageViewParams } from '@/lib/analytics';

export function SiteAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const onAdmin = pathname.startsWith('/admin');
  const enabled = !!measurementId && !onAdmin;

  // Send a page_view on every route change — path only, never the query string.
  useEffect(() => {
    if (!enabled || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', pageViewParams(window.location.origin, pathname));
  }, [enabled, pathname]);

  if (!enabled) return null;

  return (
    <>
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('js',new Date());
gtag('config','${measurementId}',{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false,send_page_view:false});`,
        }}
      />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
    </>
  );
}
