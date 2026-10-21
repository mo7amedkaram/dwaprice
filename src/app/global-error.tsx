'use client';

import './globals.css';
import { SITE } from '@/lib/site';

/** Last-resort 500 when the root layout itself fails (renders its own <html>). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-dvh items-center justify-center bg-surface p-6 font-sans text-ink">
        <title>{`حدث خطأ | ${SITE.name}`}</title>
        <meta name="robots" content="noindex" />
        <main className="w-full max-w-md rounded-card border border-border bg-bg p-8 text-center">
          <h1 className="type-h1">حدث خطأ غير متوقع</h1>
          <p className="mt-2 text-text-2">الموقع غير متاح مؤقتًا. حاول مرة أخرى بعد لحظات.</p>
          <button
            type="button"
            onClick={reset}
            className="tap mt-6 inline-flex items-center justify-center rounded-control bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover"
          >
            إعادة المحاولة
          </button>
          <p className="type-small mt-4 text-muted">خطأ 500</p>
        </main>
      </body>
    </html>
  );
}
