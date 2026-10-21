import Link from 'next/link';
import { Breadcrumbs } from '../../Breadcrumbs';
import { ApiNav } from '../ApiNav';
import { SampleExplorer } from '../SampleExplorer';
import { Container } from '../../ui';
import { apiPublicBase } from '@/lib/api/public-base';
import type { Lang } from '@/lib/api/lang';

export function SamplePage({ lang }: { lang: Lang }) {
  const ar = lang === 'ar';
  return (
    <>
      <ApiNav current={ar ? '/api/sample' : '/api/en/sample'} lang={lang} />
      <Container className="py-6 md:py-10">
        <Breadcrumbs lang={lang} items={ar ? [{ name: 'API أسعار الأدوية', href: '/api' }, { name: 'جرّب العينة' }] : [{ name: 'Drug Prices API', href: '/api/en' }, { name: 'Try the sample' }]} />
        <h1 className="type-h1 mt-3 text-ink">{ar ? 'جرّب الـ API على عينة حقيقية' : 'Try the API on a real sample'}</h1>
        <p className="mt-2 max-w-3xl text-text-2">
          {ar ? (
            <>
              بلا مفتاح وبلا تسجيل: 50 دواءً حقيقيًا بأسعارها وبدائلها وتاريخها، بنفس أشكال الاستجابة التي يعطيها المفتاح المدفوع. جرّب البحث بخطأ
              إملائي مثل <code dir="ltr" className="font-mono">اوجمنتن</code>، ثم انسخ الكود جاهزًا. الحد: 30 طلبًا في الدقيقة لكل عنوان.{' '}
              <Link prefetch={false} href="/api/docs" className="text-primary underline">التوثيق الكامل</Link>
            </>
          ) : (
            <>
              No key, no signup: 50 real products with their prices, alternatives and history, in exactly the shapes a paid key returns. Try a
              misspelled search such as <code dir="ltr" className="font-mono">اوجمنتن</code> or <code className="font-mono">augmentn</code>, then copy the
              ready-made code. Limit: 30 requests per minute per address.{' '}
              <Link prefetch={false} href="/api/en/docs" className="text-primary underline">Full documentation</Link>
            </>
          )}
        </p>
        <div className="mt-6">
          <SampleExplorer publicBase={apiPublicBase()} lang={lang} />
        </div>
      </Container>
    </>
  );
}
