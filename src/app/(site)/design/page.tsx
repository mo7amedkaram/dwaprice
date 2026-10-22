import Link from 'next/link';
import { Accordion } from '@/components/Accordion';
import { AlternativesTable } from '@/components/AlternativesTable';
import { DosingRules } from '@/components/drug/DosingRules';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { DrugRow } from '@/components/DrugRow';
import { EmptyState } from '@/components/EmptyState';
import { BoxIcon, InfoIcon } from '@/components/icons';
import { Pagination } from '@/components/Pagination';
import { PriceCard } from '@/components/PriceCard';
import { PriceHistoryChart } from '@/components/PriceHistoryChart';
import { SearchBox } from '@/components/SearchBox';
import { Badge, Container, Ltr, Price, SectionTitle, Tag, buttonClass } from '@/components/ui';
import { buildMetadata } from '@/lib/seo/metadata';
import { groupAlternatives, type AlternativeInput } from '@/lib/drug/logic';
import type { DosingRule } from '@/lib/data/types';
import { SITE } from '@/lib/site';

// Component gallery for reviewing the theme. noindex; static (no database).
// Sample values are real catalogue rows from 2026-10-21 (Augmentin 1 g and its alternatives).
export const metadata = buildMetadata({
  kind: 'internal',
  path: '/design',
  title: 'نظام التصميم',
  description: `معرض مكونات واجهة ${SITE.name}.`,
});

const COLORS = [
  { token: 'primary', cls: 'bg-primary', hex: '#0D7C66', dark: '#3CC9A7', use: 'الأزرار والروابط والتركيز' },
  { token: 'primary-hover', cls: 'bg-primary-hover', hex: '#0A6553', dark: '#5FD8BB', use: 'حالة المرور' },
  { token: 'primary-tint', cls: 'bg-primary-tint', hex: '#E6F4F0', dark: '#11362F', use: 'خلفيات التحديد' },
  { token: 'ink', cls: 'bg-ink', hex: '#0F172A', dark: '#E2E8F0', use: 'النص الأساسي' },
  { token: 'text-2', cls: 'bg-text-2', hex: '#475569', dark: '#94A3B8', use: 'النص الثانوي' },
  { token: 'muted', cls: 'bg-muted', hex: '#5B6B82', dark: '#8391A8', use: 'تلميحات' },
  { token: 'bg', cls: 'bg-bg', hex: '#FFFFFF', dark: '#0F172A', use: 'الخلفية' },
  { token: 'surface', cls: 'bg-surface', hex: '#F8FAFC', dark: '#1E293B', use: 'أسطح ثانوية' },
  { token: 'border', cls: 'bg-border', hex: '#E2E8F0', dark: '#334155', use: 'الحدود' },
  { token: 'on-primary', cls: 'bg-on-primary', hex: '#FFFFFF', dark: '#0F172A', use: 'النص فوق اللون الأساسي' },
  { token: 'figure', cls: 'bg-figure', hex: '#F8FAFC', dark: '#CBD5E1', use: 'خلفية صور المنتجات' },
  { token: 'down / down-bg', cls: 'bg-down', hex: '#15803D / #DCFCE7', dark: '#4ADE80 / #163A26', use: 'انخفاض السعر · الأرخص' },
  { token: 'up / up-bg', cls: 'bg-up', hex: '#B91C1C / #FEE2E2', dark: '#F87171 / #4A1D1D', use: 'زيادة السعر' },
  { token: 'rx / rx-bg', cls: 'bg-rx', hex: '#B45309 / #FEF3C7', dark: '#FBBF24 / #422F0B', use: 'روشتة · تنبيه' },
];

// Real catalogue rows (2026-10-21), run through the same grouping as the live pages.
const ALT_INPUT: AlternativeInput[] = [
  { alt_slug: 'clavosigma-875-125mg-10-f-c-tabs', name_ar: 'كلافوسيجما 875/125 مجم 10 أقراص مغلفة', name_en: 'Clavosigma 875/125 mg', strength: '875/125 mg', dosage_form_ar: 'أقراص مغلفة', company: 'Sigma Tec', units_per_package: 10, current_price: '36.00', unit_price: '3.60', match_type: 'SAME_INGREDIENTS_SAME_STRENGTH', alt_listing_status: null, same_form: true },
  { alt_slug: 'klavox-1gm-14-f-c-tab', name_ar: 'كلافوكس 1جم 14 قرص', name_en: 'Klavox 1 g film-coated tablets', strength: '875 mg + 125 mg', dosage_form_ar: 'قرص مغلف', company: 'Spimaco > EIMC', units_per_package: 14, current_price: '75.00', unit_price: '5.36', match_type: 'SAME_INGREDIENTS_SAME_STRENGTH', alt_listing_status: null, same_form: true },
  { alt_slug: 'augram-1gm-7-tablets', name_ar: 'اوجرام 1جم 7 اقراص', name_en: 'Augram 1 g 7 film-coated tablets', strength: '1 g', dosage_form_ar: 'أقراص مغلفة', company: 'Rameda', units_per_package: 7, current_price: '76.00', unit_price: '10.86', match_type: 'SAME_INGREDIENTS_SAME_STRENGTH', alt_listing_status: null, same_form: true },
  { alt_slug: 'clavocillin-1gm-10-dispersible-tabs', name_ar: 'كلافوسيلين 1 جم 10 أقراص قابلة للتشتت', name_en: 'Clavocillin 1 g', strength: '1 g', dosage_form_ar: 'أقراص قابلة للتشتت', company: 'Rameda > Organopharma', units_per_package: 10, current_price: '106.00', unit_price: '10.60', match_type: 'SAME_INGREDIENTS_SAME_STRENGTH', alt_listing_status: 'NOT_AVAILABLE', same_form: true },
  { alt_slug: 'clavimox-1gm-16-f-c-tab', name_ar: 'كلافيموكس 1 جم 16 قرص مغلف', name_en: 'Clavimox 1gm 16 f.c. tab', strength: '875/125 mg', dosage_form_ar: 'قرص مغلف', company: 'Pharco', units_per_package: 16, current_price: '171.00', unit_price: '10.69', match_type: 'SAME_INGREDIENTS_SAME_STRENGTH', alt_listing_status: null, same_form: true },
  { alt_slug: 'augmentin-156mg-5ml-susp-80ml', name_ar: 'اوجمنتين 156مجم/5مل معلق 80 مل', name_en: 'Augmentin 156 mg/5 ml oral suspension 80 ml', strength: '156 mg/5 ml', dosage_form_ar: 'مسحوق لمعلق فموي', company: 'GlaxoSmithKline', units_per_package: null, current_price: '99.00', unit_price: null, match_type: 'SAME_INGREDIENTS_DIFFERENT_STRENGTH', alt_listing_status: null, same_form: false },
];
const ALTERNATIVES = groupAlternatives(ALT_INPUT, 210);

// Illustrative only: no APPROVED clinical_dosing_rules row exists yet, so no
// real drug page can show this section. Reviewer and sources below are
// placeholders that show the layout, not a real review.
const SAMPLE_RULE: DosingRule = {
  id: 'sample',
  ingredient_key: 'example',
  ingredient_name: 'Example',
  formulations: ['oral suspension'],
  routes: ['oral'],
  indication: 'مثال توضيحي — ليس قاعدة جرعات حقيقية',
  population: 'أطفال (مثال)',
  min_age_months: 3,
  max_age_months: 144,
  min_weight_kg: '5',
  max_weight_kg: '40',
  formula: {},
  dose_min_mg: '0',
  dose_max_mg: '0',
  max_daily_mg: null,
  contraindications: null,
  sources: [{ title: 'Source title (placeholder)' }],
  guideline_version: 'placeholder',
  reviewer_name: 'اسم الصيدلي المراجِع (مكان)',
  reviewer_credentials: 'المؤهل (مكان)',
  review_date: '2026-01-01',
  version: 1,
};

function Section({ id, title, children, note }: { id: string; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-labelledby={id} className="border-t border-border py-8 first:border-t-0">
      <SectionTitle id={id}>{title}</SectionTitle>
      {note && <p className="type-small -mt-2 mb-4 text-text-2">{note}</p>}
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <Container className="py-6 md:py-10">
      <Breadcrumbs items={[{ name: 'نظام التصميم' }]} jsonLd={false} />
      <h1 className="type-h1 mt-3 text-ink">
        نظام التصميم <Ltr className="text-text-2">Clinical Clean</Ltr>
      </h1>
      <p className="mt-2 max-w-2xl text-text-2">
        كل الألوان والخطوط والمقاسات تأتي من ملف واحد <Ltr>src/styles/tokens.css</Ltr>. هذه الصفحة لا تُفهرس.
      </p>

      <Section id="colors" title="الألوان">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {COLORS.map((c) => (
            <li key={c.token} className="overflow-hidden rounded-card border border-border">
              <div className={`h-14 ${c.cls}`} />
              <div className="p-3">
                <Ltr block className="font-medium text-ink">{c.token}</Ltr>
                <Ltr block className="type-small text-text-2">{c.hex}</Ltr>
                <Ltr block className="type-small text-muted">dark {c.dark}</Ltr>
                <span className="type-small block text-muted">{c.use}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="الخطوط والمقاسات" note="IBM Plex Sans Arabic للعربية، Inter للأسماء اللاتينية. الأوزان 400 / 500 / 600 فقط.">
        <div className="space-y-4 rounded-card border border-border p-4 md:p-6">
          <p className="type-h1 text-ink">عنوان H1 — سعر أوجمنتين 1 جم</p>
          <p className="type-h2 text-ink">عنوان H2 — بدائل أرخص بنفس المادة الفعالة</p>
          <p className="type-body text-ink">
            نص أساسي 16 بكسل بارتفاع سطر 1.8: يحتوي <Ltr>Augmentin 1 g</Ltr> على المادة الفعالة{' '}
            <Ltr>Amoxicillin + Clavulanic acid</Ltr> ويُصرف بروشتة طبية.
          </p>
          <p className="type-small text-text-2">نص صغير 13/14 بكسل للتفاصيل والتواريخ.</p>
          <p>
            <Price value={210} className="type-price text-ink" currencyClassName="type-small text-text-2" />
            <span className="type-small ms-3 text-text-2">السعر الكبير 26/32 بأرقام جدولية</span>
          </p>
          <p className="type-small flex flex-wrap gap-x-6 gap-y-1 text-text-2">
            <span className="font-normal">وزن 400</span>
            <span className="font-medium">وزن 500</span>
            <span className="font-semibold">وزن 600</span>
          </p>
        </div>
      </Section>

      <Section id="controls" title="الأزرار وحقل البحث">
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass('primary')}>زر أساسي</button>
          <button type="button" className={buttonClass('secondary')}>زر ثانوي</button>
          <button type="button" className={buttonClass('ghost')}>زر نصي</button>
          <button type="button" className={buttonClass('primary')} disabled>
            معطّل
          </button>
        </div>
        <div className="mt-4 max-w-xl">
          <SearchBox id="design-search" size="lg" />
        </div>
      </Section>

      <Section id="badges" title="الشارات والوسوم">
        <div className="flex flex-wrap gap-2">
          <Badge tone="down">الأرخص</Badge>
          <Badge tone="up">
            زيادة <span dir="ltr" className="price">60.3%</span>
          </Badge>
          <Badge tone="rx" icon={<InfoIcon size={14} />}>بروشتة طبية</Badge>
          <Badge tone="primary">نفس التركيز</Badge>
          <Badge tone="neutral">تركيز مختلف</Badge>
          <Badge tone="muted">غير مؤكد</Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Tag href="/ingredient/amoxicillin">
            أموكسيسيلين <Ltr className="ms-1 text-text-2">Amoxicillin</Ltr>
          </Tag>
          <Tag href="/category/antibacterial">مضاد بكتيري</Tag>
          <Tag href="/company/glaxosmithkline">
            <Ltr>GlaxoSmithKline</Ltr>
          </Tag>
        </div>
      </Section>

      <Section id="breadcrumbs" title="مسار التنقل">
        <Breadcrumbs
          jsonLd={false}
          items={[
            { name: 'مضاد بكتيري', href: '/category/antibacterial' },
            { name: 'أموكسيسيلين', href: '/active-ingredient/amoxicillin' },
            { name: 'اوجمنتين 1جم 14 قرص' },
          ]}
        />
      </Section>

      <Section id="layout" title="تخطيط صفحة الدواء" note="عمود واحد على الجوال، وعمودان مع بطاقة سعر ثابتة من 1024 بكسل.">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--width-price-card)] lg:items-start">
          <div className="min-w-0 space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="type-h2 text-ink">اوجمنتين 1جم 14 قرص</p>
                <Badge tone="rx">بروشتة طبية</Badge>
              </div>
              <Ltr block className="text-text-2">Augmentin 1 g film-coated tablets (14 tablets)</Ltr>
              <ul className="type-small mt-3 flex flex-wrap gap-x-4 gap-y-1 text-text-2">
                <li className="flex items-center gap-1">
                  <BoxIcon size={16} /> أقراص مغلفة • 14 قرص
                </li>
                <li>
                  <Ltr>GlaxoSmithKline</Ltr>
                </li>
              </ul>
            </div>
            <PriceHistoryChart
              points={[
                { price: 131, date: null },
                { price: 210, date: '2024-12-02' },
              ]}
            />
            <PriceHistoryChart
              title="تاريخ السعر (3 نقاط)"
              points={[
                { price: 230, date: null },
                { price: 399, date: null },
                { price: 419, date: '2026-07-05' },
              ]}
            />
          </div>
          <PriceCard
            className="lg:sticky lg:top-6"
            price={210}
            oldPrice={131}
            unitPrice={15}
            unitLabel="القرص"
            units={14}
            updated="2024-12-02"
            footer={
              <Link href="#alternatives" className={buttonClass('secondary', 'w-full')}>
                البدائل الأرخص
              </Link>
            }
          />
        </div>
      </Section>

      <Section id="price-cards" title="بطاقة السعر — حالات">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PriceCard title="انخفض السعر" price={45} oldPrice={52} unitPrice={4.5} unitLabel="القرص" units={10} updated="2026-09-14" />
          <PriceCard title="السعر الحالي" price={64} updated="2026-10-01" />
          <PriceCard title="غير متوفر حاليًا" price={106} unitPrice={10.6} unitLabel="القرص" units={10} updated="2026-03-08" listingStatus="NOT_AVAILABLE" />
        </div>
      </Section>

      <Section id="rows" title="صفوف الأدوية">
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ALTERNATIVES.same.slice(0, 4).map((a) => (
            <li key={a.slug}>
              <DrugRow
                slug={a.slug}
                nameAr={a.nameAr}
                nameEn={a.nameEn}
                ingredient="Amoxicillin + Clavulanic acid"
                detail={a.form}
                price={a.price}
                badges={a.cheapest ? <Badge tone="down">الأرخص</Badge> : a.unavailable ? <Badge tone="rx">غير متوفر</Badge> : null}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="alternatives" title="جدول البدائل" note="مرتب من الأرخص؛ الأرخص المتوفر مميز باللون الأخضر. يتحول إلى بطاقات على الجوال.">
        <AlternativesTable rows={ALTERNATIVES.same} caption="بدائل اوجمنتين 1 جم" />
        <h3 className="mt-6 mb-2 font-semibold text-ink">تركيز مختلف</h3>
        <AlternativesTable rows={ALTERNATIVES.different} caption="نفس المادة الفعالة بتركيز مختلف" />
      </Section>

      <Section id="dosing" title="قاعدة جرعات معتمدة (مثال توضيحي)" note="لا توجد حتى الآن أي قاعدة جرعات معتمدة في قاعدة البيانات؛ هذا المثال يوضح الشكل فقط وليس مراجعة حقيقية.">
        <DosingRules rules={[SAMPLE_RULE]} />
      </Section>

      <Section id="accordion" title="الأكورديون">
        <Accordion
          items={[
            {
              id: 'uses',
              title: 'دواعي الاستعمال',
              defaultOpen: true,
              content: <p>عدوى الجهاز التنفسي والأذن والجيوب الأنفية والمسالك البولية والجلد التي تسببها بكتيريا حساسة. (نص تجريبي)</p>,
            },
            { id: 'dose', title: 'الجرعة', content: <p>يحددها الطبيب حسب نوع العدوى وشدتها ووظائف الكلى. (نص تجريبي)</p> },
            { id: 'side', title: 'الآثار الجانبية', content: <p>إسهال، غثيان، طفح جلدي. (نص تجريبي)</p> },
          ]}
        />
      </Section>

      <Section id="empty" title="حالة فارغة">
        <EmptyState
          title="لا توجد بدائل مسجلة"
          description="لم نجد دواءً آخر بنفس المادة الفعالة في القائمة الحالية."
          action={
            <Link href="/" className={buttonClass('secondary')}>
              ابحث عن دواء آخر
            </Link>
          }
        />
      </Section>

      <Section id="pagination" title="ترقيم الصفحات">
        <Pagination current={3} total={12} basePath="/design" />
      </Section>
    </Container>
  );
}
