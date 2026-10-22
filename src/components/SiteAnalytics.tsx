'use client';

// Google Analytics 4 with Consent Mode v2, loaded only after the visitor accepts analytics
// cookies (a small, non-blocking Arabic notice). If they refuse, nothing from Google is loaded.
// Privacy: IP anonymised, Google signals and ad personalisation off, automatic page_view off — we
// send page_view ourselves with the path only (never the ?q= search query or any query string).
// Not loaded on the admin area.
import Script from 'next/script';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { pageViewParams } from '@/lib/analytics';

const CONSENT_KEY = 'dw_consent';
type Consent = 'granted' | 'denied' | null;

export function SiteAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent>(null);
  const onAdmin = pathname.startsWith('/admin');

  useEffect(() => {
    let stored: Consent = null;
    try {
      const v = localStorage.getItem(CONSENT_KEY);
      stored = v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : null;
    } catch {
      /* private mode */
    }
    const raf = requestAnimationFrame(() => setConsent(stored));
    return () => cancelAnimationFrame(raf);
  }, []);

  const enabled = !!measurementId && consent === 'granted' && !onAdmin;

  // Send a page_view on every route change — path only, never the query string.
  useEffect(() => {
    if (!enabled || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', pageViewParams(window.location.origin, pathname));
  }, [enabled, pathname]);

  const choose = useCallback((v: 'granted' | 'denied') => {
    try {
      localStorage.setItem(CONSENT_KEY, v);
    } catch {
      /* ignore */
    }
    setConsent(v);
  }, []);

  if (!measurementId || onAdmin) return null;

  return (
    <>
      {enabled && (
        <>
          <Script
            id="ga-init"
            strategy="afterInteractive"
            // Consent Mode v2: everything denied by default, then analytics granted (the visitor just accepted).
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});
gtag('consent','update',{analytics_storage:'granted'});
gtag('js',new Date());
gtag('config','${measurementId}',{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false,send_page_view:false});`,
            }}
          />
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
        </>
      )}
      {consent === null && <CookieNotice onAccept={() => choose('granted')} onReject={() => choose('denied')} />}
    </>
  );
}

// Small, non-blocking, fixed to the bottom (position:fixed, so it never shifts the layout: CLS 0).
function CookieNotice({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="إشعار ملفات تعريف الارتباط"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-card border border-border bg-bg p-4 shadow-lg md:inset-x-auto md:end-4 md:start-auto md:w-96"
    >
      <p className="type-small text-text-2">
        نستخدم Google Analytics لإحصاء الزيارات فقط، ولا نرسل ما تبحث عنه. بقبولك توافق على حفظ ملف تعريف ارتباط للقياس.{' '}
        <a href="/privacy" className="text-primary underline">
          سياسة الخصوصية
        </a>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onAccept} className="tap flex-1 rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover">
          موافق
        </button>
        <button type="button" onClick={onReject} className="tap flex-1 rounded-control border border-border px-4 py-2 text-sm font-medium text-text-2 hover:bg-surface hover:text-ink">
          رفض
        </button>
      </div>
    </div>
  );
}
