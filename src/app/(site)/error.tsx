'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Container, buttonClass } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { InfoIcon } from '@/components/icons';
import { SITE } from '@/lib/site';

/** Styled 500 for errors inside a page (the layout, header and footer still render). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-12 md:py-16">
      <title>{`حدث خطأ | ${SITE.name}`}</title>
      <meta name="robots" content="noindex" />
      <EmptyState
        headingLevel={1}
        icon={<InfoIcon size={28} />}
        title="حدث خطأ غير متوقع"
        description="تعذّر عرض هذه الصفحة الآن. حاول مرة أخرى بعد لحظات."
        action={
          <>
            <button type="button" onClick={reset} className={buttonClass('primary')}>
              إعادة المحاولة
            </button>
            <Link href="/" className={buttonClass('secondary')}>
              الصفحة الرئيسية
            </Link>
          </>
        }
      />
      <p className="type-small mt-4 text-center text-muted">
        خطأ 500{error.digest ? <> — <span dir="ltr" lang="en">{error.digest}</span></> : null}
      </p>
    </Container>
  );
}
