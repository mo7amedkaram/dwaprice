import Link from 'next/link';
import type { Metadata } from 'next';
import { Container, buttonClass } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { SearchBox } from '@/components/SearchBox';
import { routes } from '@/lib/site';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// Next.js adds <meta name="robots" content="noindex"> to not-found responses itself.
export const metadata: Metadata = {
  title: 'الصفحة غير موجودة',
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
    <Container className="py-12 md:py-16">
      <EmptyState
        headingLevel={1}
        title="لم نجد هذه الصفحة"
        description={
          <>
            <p>ربما تغيّر اسم الدواء أو أُزيل من القائمة. جرّب البحث عنه:</p>
            <div className="mx-auto mt-4 max-w-md text-start">
              <SearchBox id="not-found-search" />
            </div>
          </>
        }
        action={
          <>
            <Link href="/" className={buttonClass('primary')}>
              الصفحة الرئيسية
            </Link>
            <Link href={routes.lastPrices()} className={buttonClass('secondary')}>
              أحدث الأسعار
            </Link>
          </>
        }
      />
      <p className="type-small mt-4 text-center text-muted">خطأ 404</p>
    </Container>
      </main>
      <Footer />
    </>
  );
}
