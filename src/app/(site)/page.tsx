import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Ltr, SectionTitle, buttonClass } from '@/components/ui';
import { getSiteSettings } from '@/lib/settings/read';
import { ChevronEndIcon, ClockIcon, ShieldIcon, PillIcon } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { SearchBox } from '@/components/SearchBox';
import { LetterNav } from '@/components/listing/LetterNav';
import { PriceChangesTable } from '@/components/listing/PriceChangesTable';
import { getAtcRoots, getHubIndex, getLatestChanges, getLetterCounts } from '@/lib/data/listings';
import { formatCount, orderLetters } from '@/lib/listing/logic';
import { buildMetadata } from '@/lib/seo/metadata';
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld';
import { SITE, routes } from '@/lib/site';

// Hourly: the latest price changes and the trust counters stay fresh.
export const revalidate = 3600;

// Title, description and the verification meta tags come from the editable site settings
// (admin area), so they change without a redeploy; verification tags are on the home page only.
export async function generateMetadata(): Promise<Metadata> {
  const { seo, verification } = await getSiteSettings();
  const google = verification.google.trim();
  const bing = verification.bing.trim();
  return buildMetadata({
    kind: 'home',
    path: '/',
    title: seo.homeTitle,
    absoluteTitle: true,
    description: seo.homeDescription,
    verification: google || bing ? { google: google || undefined, other: bing ? { 'msvalidate.01': bing } : undefined } : undefined,
  });
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link prefetch={false} href={href} className="tap inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children}
      <ChevronEndIcon size={16} />
    </Link>
  );
}

export default async function HomePage() {
  const [changes, letterCounts, categories, atcRoots] = await Promise.all([
    getLatestChanges(null, 5, 0),
    getLetterCounts(),
    getHubIndex('category'),
    getAtcRoots(),
  ]);
  const letters = orderLetters(letterCounts);

  return (
    <>
      <JsonLd data={[websiteJsonLd(), organizationJsonLd()]} />

      {/* Mobile (part 2): search sits right under the header — a compact H1 above it, the description below.
          CSS `order` keeps the H1 first in the HTML (one logical H1); desktop keeps H1, description, then search. */}
      <section className="border-b border-border bg-surface">
        <Container className="py-6 md:py-16">
          <div className="mx-auto flex max-w-2xl flex-col text-center">
            <h1 className="type-h1 order-1 text-ink">أسعار الأدوية في مصر محدثة يومياً</h1>
            <p className="order-3 mt-4 text-text-2 md:order-2 md:mt-3">
              ابحث باسم الدواء بالعربي أو الإنجليزي أو بالمادة الفعالة، ولو كتبته بشكل غير دقيق. لكل دواء سعره الحالي ومثائله الأرخص وبدائله.
            </p>
            <div className="order-2 mt-4 text-start md:order-3 md:mt-6">
              <SearchBox id="home-search" size="lg" prefetch />
            </div>
          </div>
        </Container>
      </section>

      <Container className="space-y-12 py-10 md:space-y-16 md:py-14">
        <section aria-labelledby="latest-prices">
          <SectionTitle id="latest-prices" end={<MoreLink href={routes.lastPrices()}>كل التغييرات</MoreLink>}>
            أحدث تغييرات الأسعار
          </SectionTitle>
          <PriceChangesTable rows={changes.rows} caption="أحدث 5 تغييرات في أسعار الأدوية" compact />
        </section>

        <section aria-labelledby="az">
          <SectionTitle id="az" end={<MoreLink href={routes.letters()}>الفهرس الكامل</MoreLink>}>
            الأدوية من أ إلى ي
          </SectionTitle>
          <LetterNav letters={letters} />
        </section>

        <section aria-labelledby="categories">
          <SectionTitle id="categories" end={<MoreLink href={routes.categories()}>كل التصنيفات</MoreLink>}>
            تصفح حسب التصنيف
          </SectionTitle>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {categories.slice(0, 8).map((c) => (
              <li key={c.slug}>
                <Link
                  prefetch={false}
                  href={routes.category(c.slug)}
                  className="flex min-h-16 flex-col justify-center rounded-card border border-border bg-bg px-4 py-3 transition-colors hover:border-primary hover:bg-primary-tint"
                >
                  <span className="font-semibold text-ink">{c.name_ar ?? c.name_en}</span>
                  <span className="type-small text-text-2">
                    <span className="price">{formatCount(c.indexable_count)}</span> دواء
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-8 mb-3 font-semibold text-ink">حسب الجهاز في الجسم (تصنيف ATC)</h3>
          <ul className="flex flex-wrap gap-2">
            {atcRoots.map((r) => (
              <li key={r.key}>
                <Link
                  prefetch={false}
                  href={routes.atc(r.key, r.name_en)}
                  className="tap inline-flex items-center gap-2 rounded-control border border-border bg-bg px-3 text-ink transition-colors hover:border-primary hover:bg-primary-tint hover:text-primary"
                >
                  <Ltr className="font-semibold text-primary">{r.key}</Ltr>
                  {r.name_ar}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex flex-wrap gap-3">
            <Link prefetch={false} href={routes.ingredients()} className={buttonClass('secondary')}>
              المواد الفعالة
            </Link>
            <Link prefetch={false} href={routes.companies()} className={buttonClass('secondary')}>
              شركات الأدوية
            </Link>
          </p>
        </section>

        <section aria-labelledby="trust" className="rounded-card border border-border bg-surface p-5 md:p-8">
          <h2 id="trust" className="type-h2 text-ink">
            من أين تأتي الأسعار؟
          </h2>
          <ul className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            <li className="flex gap-3">
              <ClockIcon size={22} className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="block font-semibold text-ink">تحديث مستمر</span>
                <span className="type-small text-text-2">
                  نراجع قوائم أسعار الأدوية المنشورة في مصر باستمرار، وتُحدَّث صفحات الموقع تلقائيًا خلال ساعات من أي تغيير، ولكل سعر تاريخه
                  على صفحة الدواء.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <PillIcon size={22} className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="block font-semibold text-ink">كل دواء بسعره ومثائله وبدائله</span>
                <span className="type-small text-text-2">
                  لكل دواء السعر الحالي والسابق وتاريخ التغيير، والمثائل بنفس المادة الفعالة والتركيز مرتبة من الأرخص، والبدائل من نفس المجموعة العلاجية.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldIcon size={22} className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="block font-semibold text-ink">معلومات من مصادر معلنة</span>
                <span className="type-small text-text-2">
                  المعلومات الدوائية من نشرات الأدوية والمراجع العلمية مع ذكر المصدر، ولا نعرض الجرعات إلا بعد مراجعتها.{' '}
                  <Link prefetch={false} href={routes.about()} className="text-primary underline">
                    كيف نعمل
                  </Link>
                </span>
              </span>
            </li>
          </ul>
          <p className="type-small mt-6 text-muted">
            {SITE.name} دليل معلومات وليس صيدلية: لا نبيع الأدوية، والأسعار للاسترشاد وقد تختلف في بعض الصيدليات.
          </p>
        </section>

        <section aria-labelledby="api" className="rounded-card border border-primary/30 bg-primary-tint p-5 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
            <div>
              <p className="type-small font-semibold text-primary">للمطورين والشركات</p>
              <h2 id="api" className="type-h2 mt-1 text-ink">
                نفس البيانات عبر API
              </h2>
              <p className="mt-3 max-w-2xl text-text-2">
                أسعار الأدوية المحدثة، المواد الفعالة والشركات والبدائل والباركود كـ JSON واحد منظم، مع تغذية تغييرات تخبر نظامك بما تغيّر فقط.
                لأنظمة نقاط البيع والصيدليات والتطبيقات وشركات التوزيع. جرّب عينة حقيقية بلا مفتاح وبلا تسجيل.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link prefetch={false} href="/api" className={buttonClass('primary')}>
                  تعرّف على API أسعار الأدوية
                </Link>
                <Link prefetch={false} href="/api/sample" className={buttonClass('secondary')}>
                  جرّب العينة
                </Link>
              </div>
            </div>
            <pre dir="ltr" className="overflow-x-auto rounded-card border border-border bg-bg p-4 font-mono text-sm leading-6 text-ink">
              {`GET /api/v1/drugs/by-barcode/6221051011317\n\n{ "trade_name_ar": "كونجستال 20 قرص",\n  "price": { "current": 50, "previous": 31,\n             "currency": "EGP", "verified": true },\n  "company": { "name": "Sigma" } }`}
            </pre>
          </div>
        </section>
      </Container>
    </>
  );
}
