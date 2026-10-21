import Link from 'next/link';
import { Breadcrumbs } from '../Breadcrumbs';
import { Container, SectionTitle, buttonClass } from '../ui';
import { ApiNav } from './ApiNav';
import { Code, CodeBlock } from './CodeBlock';
import { Faq, FieldTable, PlanCards, StatsStrip } from './Blocks';
import { AccessRequestForm } from './Forms';
import { submitAccessRequest } from '@/lib/api/access-requests';
import type { PlanInfo } from '@/lib/api/dashboard-data';
import type { Dataset } from '@/lib/api/dataset';
import { routes } from '@/lib/site';

const n = (v: number | string | null | undefined) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

const FIELDS: Array<{ name: string; type: string; ar: string; en: string; example: string }> = [
  { name: 'id', type: 'string', ar: 'معرّف ثابت للمنتج (لا يتغير، وعند تغيير الاسم يُحوَّل القديم 301)', en: 'Stable public id; a renamed product answers 301 to its new id', example: 'congestal-20-tabs' },
  { name: 'trade_name_en / trade_name_ar', type: 'string | null', ar: 'الاسم التجاري بالإنجليزية والعربية', en: 'Trade name in English and Arabic', example: 'كونجستال 20 قرص' },
  { name: 'scientific_name', type: 'string | null', ar: 'الاسم العلمي كما في القائمة', en: 'Scientific/generic name as listed', example: 'Chlorpheniramine+paracetamol+…' },
  { name: 'ingredients[]', type: '{id, name_en, name_ar, strength, atc_code}[]', ar: 'المواد الفعالة بتركيز كل منها ورمز ATC', en: 'Active ingredients with strength and ATC code', example: '{"id":"paracetamol","strength":"650 mg"}' },
  { name: 'strength', type: 'string | null', ar: 'التركيز كما في القائمة', en: 'Strength as listed', example: '650/4/60 mg' },
  { name: 'dosage_form', type: '{class, en, ar}', ar: 'الشكل الدوائي: فئة موحّدة + النص الأصلي', en: 'Dosage form: a controlled class plus the listed text', example: '{"class":"tablet","ar":"قرص"}' },
  { name: 'route', type: 'enum | null', ar: 'طريق الإعطاء (oral, topical, injection…)', en: 'Route of administration (controlled)', example: 'oral' },
  { name: 'units_per_package', type: 'integer | null', ar: 'عدد الوحدات في العبوة', en: 'Units per pack', example: '20' },
  { name: 'price.current', type: 'number | null', ar: 'السعر الحالي بالجنيه (رقم، لا نص)', en: 'Current price in EGP (a number, never a string)', example: '50' },
  { name: 'price.previous', type: 'number | null', ar: 'السعر السابق', en: 'Previous price', example: '31' },
  { name: 'price.unit_price', type: 'number | null', ar: 'سعر الوحدة (القرص، الكبسولة…)', en: 'Price per unit', example: '2.5' },
  { name: 'price.effective_date', type: 'date | null', ar: 'تاريخ السعر في قائمة الأسعار', en: 'Date of the price on the list', example: '2024-06-06' },
  { name: 'price.updated_at', type: 'timestamp | null', ar: 'متى سجّلنا السعر الحالي (مفتاح المزامنة)', en: 'When we recorded the current price (sync key)', example: '2026-10-21T14:02:00Z' },
  { name: 'price.verified', type: 'boolean', ar: 'تم التحقق من السعر مقابل مصدر منشور', en: 'Checked against a published source', example: 'true' },
  { name: 'barcode', type: 'string | null', ar: 'الباركود (EAN/GTIN)', en: 'EAN/GTIN', example: '6221051011317' },
  { name: 'company', type: '{id, name} | null', ar: 'الشركة المسوّقة بمعرّف موحّد (3,270 شركة)', en: 'Normalised marketing company', example: '{"id":"sigma","name":"Sigma"}' },
  { name: 'manufacturer', type: '{id, name} | null', ar: 'الشركة المصنّعة عند اختلافها', en: 'Manufacturer when different', example: 'null' },
  { name: 'category', type: '{id, en, ar} | null', ar: 'الفئة العلاجية ككائن مستقل', en: 'Therapeutic category as its own object', example: '{"id":"cold"}' },
  { name: 'atc_codes', type: 'string[]', ar: 'رموز ATC على مستوى المنتج', en: 'Product-level ATC codes', example: '["N02BE01"]' },
  { name: 'prescription_status', type: 'enum | null', ar: 'prescription / otc / not_applicable', en: 'prescription / otc / not_applicable', example: 'otc' },
  { name: 'status', type: 'enum', ar: 'حالة السطر في قائمة الأسعار (listed, not_available, cancelled…)', en: 'Marker of the line on the price list', example: 'listed' },
  { name: 'updated_at', type: 'timestamp', ar: 'آخر تغيير في أي حقل (للمزامنة الجزئية)', en: 'Last change of any field (for updated_since)', example: '2026-10-21T14:02:00Z' },
  { name: 'links.web_url', type: 'string', ar: 'صفحة الدواء على الموقع', en: 'The public drug page', example: 'https://dwaprice.com/dawa/…' },
];

const VALUE = {
  ar: [
    ['تغذية التغييرات (delta feed)', 'GET /price-changes?since= يعيد ما تغيّر فقط: السعر، الحالة، منتجات جديدة أو محذوفة. نظام نقاط البيع يزامن ما تغيّر بدل تحميل الكتالوج كل مرة.'],
    ['تاريخ السعر', 'كل سعر مسجّل لكل منتج بتاريخه، وتُضاف التغييرات الجديدة تلقائيًا.'],
    ['سعر الوحدة', 'سعر القرص أو الكبسولة أو الكيس لمقارنة العبوات المختلفة.'],
    ['أسعار موثّقة', 'علامة verified لكل سعر تحقّقنا منه مقابل مصدر منشور، وتاريخ التحقق.'],
    ['البدائل', 'GET /drugs/{id}/alternatives: نفس المواد الفعالة ونفس التركيز مرتبة من الأرخص، مع فرق السعر.'],
    ['البحث بالباركود', 'GET /drugs/by-barcode/{barcode} لماسح الصيدلية، مع البحث العربي والإنجليزي المتسامح مع الأخطاء الإملائية.'],
  ],
  en: [
    ['Delta feed', 'GET /price-changes?since= returns only what changed: prices, statuses, new or removed products. A POS syncs the deltas instead of reloading the catalogue.'],
    ['Price history', 'Every recorded price of every product with its date; new changes are appended automatically.'],
    ['Unit price', 'Price per tablet, capsule or sachet to compare pack sizes.'],
    ['Verified prices', 'A verified flag (and date) on every price checked against a published source.'],
    ['Alternatives', 'GET /drugs/{id}/alternatives: same ingredients and strength, cheapest first, with the price difference.'],
    ['Barcode lookup', 'GET /drugs/by-barcode/{barcode} for the pharmacy scanner, plus typo-tolerant Arabic and English search.'],
  ],
};

const USE_CASES = {
  ar: [
    ['نقاط البيع وأنظمة ERP للصيدليات', 'سعر محدث لكل صنف عند البيع، مزامنة يومية بالتغييرات فقط، تطابق بالباركود أو باسم القائمة.'],
    ['تطبيقات الهاتف', 'بحث عربي متسامح مع الأخطاء، صفحات بدائل أرخص، بيانات بالعربية والإنجليزية.'],
    ['التجارة الإلكترونية', 'كتالوج كامل بالتركيز والشكل والشركة والفئة، مع تحديث الأسعار تلقائيًا.'],
    ['التأمين وإدارة المطالبات (TPA)', 'تسعير موحد للمطالبات، تاريخ السعر عند تاريخ الصرف، البدائل الأقل تكلفة.'],
    ['العيادات والمستشفيات', 'تكلفة الوصفة قبل كتابتها، بدائل بنفس المادة الفعالة، توفّر الصنف في القائمة.'],
  ],
  en: [
    ['Pharmacy POS / ERP', 'An up-to-date price for every item at the till, daily delta sync, matching by barcode or price-list name.'],
    ['Mobile apps', 'Typo-tolerant Arabic search, cheaper-alternatives pages, data in Arabic and English.'],
    ['E-commerce', 'The full catalogue with strength, form, company and category, prices updated automatically.'],
    ['Insurance / TPA', 'Consistent claim pricing, the price at the dispensing date, lowest-cost alternatives.'],
    ['Clinics and hospitals', 'Prescription cost before writing it, same-ingredient alternatives, listing status.'],
  ],
};

const FAQ = {
  ar: [
    { q: 'من أين تأتي الأسعار وكم مرة تُحدّث؟', a: 'نجمع الأسعار من قوائم أسعار الأدوية المنشورة في مصر ومواقع الشركات، ونتحقق منها مقابل مصادر منشورة. تُزامن قاعدة البيانات كل عشر دقائق، ويلتقط الـ API أي تغيير خلال دقائق من اكتشافه.' },
    { q: 'هل العينة المجانية بيانات حقيقية؟', a: 'نعم، 50 دواءً حقيقيًا بأسعارها الحالية وتاريخها وبدائلها، بنفس الأشكال تمامًا. الفرق الوحيد عن المفتاح المدفوع هو حجم الكتالوج.' },
    { q: 'كيف أحصل على مفتاح؟', a: 'أرسل طلب الوصول، ونرد خلال يوم عمل. بعد التفعيل تدخل لوحة المطورين ببريدك الإلكتروني وتنشئ المفتاح بنفسك؛ يُعرض مرة واحدة ولا نخزنه.' },
    { q: 'ماذا يحدث عند تجاوز حدود الخطة؟', a: 'تعود الاستجابة 429 مع ترويسة Retry-After. الحد في الدقيقة يُعاد ضبطه كل دقيقة، والحصة الشهرية أول كل شهر. ترويسات X-RateLimit و X-Quota في كل استجابة تخبرك بالمتبقي.' },
    { q: 'هل يمكن تحميل قاعدة البيانات كاملة؟', a: 'نعم على خطة Enterprise: تصدير كامل CSV أو JSON برابط موقّع صالح ساعة، يُولَّد من أحدث نسخة من البيانات.' },
    { q: 'هل تتغير أشكال الاستجابة؟', a: 'لا نغير أو نحذف حقلًا في /v1؛ قد نضيف حقولًا جديدة فقط. التغييرات غير المتوافقة تأتي في /v2 مع إبقاء /v1 سنة على الأقل.' },
    { q: 'هل يشمل الـ API معلومات طبية أو صورًا؟', a: 'لا. الإصدار الحالي يقدم بيانات الكتالوج والأسعار فقط: الأسماء، المواد الفعالة، الأشكال، الشركات، الفئات، رموز ATC، الباركود، الأسعار وتاريخها، البدائل.' },
    { q: 'هل يمكنني إعادة بيع البيانات أو نشرها؟', a: 'لا. الترخيص للاستخدام داخل منتجك أو منشأتك فقط. التفاصيل في شروط الترخيص.' },
  ],
  en: [
    { q: 'Where do the prices come from and how often are they updated?', a: 'We collect prices from the drug price lists published in Egypt and from manufacturers, and verify them against published sources. The database syncs every ten minutes and the API captures changes within minutes.' },
    { q: 'Is the free sample real data?', a: 'Yes: 50 real products with current prices, history and alternatives, in exactly the same shapes. The only difference from a paid key is the size of the catalogue.' },
    { q: 'How do I get a key?', a: 'Send an access request; we answer within one business day. Once activated you log in to the developer dashboard with your e-mail and create the key yourself; it is shown once and never stored.' },
    { q: 'What happens when I exceed my plan limits?', a: 'You get 429 with a Retry-After header. The per-minute limit resets every minute and the monthly quota on the first of the month; X-RateLimit and X-Quota headers on every response show what is left.' },
    { q: 'Can I download the whole database?', a: 'Yes, on the Enterprise plan: a full CSV or JSON export through a signed link valid for one hour, generated from the latest dataset version.' },
    { q: 'Do response shapes change?', a: 'We never rename or remove a field in /v1; we only add. Breaking changes ship in /v2 with /v1 kept for at least a year.' },
    { q: 'Does the API include clinical information or images?', a: 'No. The current version is catalogue and price data only: names, ingredients, forms, companies, categories, ATC codes, barcodes, prices with history, alternatives.' },
    { q: 'May I resell or republish the data?', a: 'No. The license covers use inside your product or organisation only; see the license terms.' },
  ],
};

export function ApiLanding({ lang, plans, dataset, publicBase }: { lang: 'ar' | 'en'; plans: PlanInfo[]; dataset: Dataset; publicBase: string }) {
  const ar = lang === 'ar';
  const base = ar ? '/api' : '/api/en';
  const t = ar
    ? { crumb: 'API أسعار الأدوية', h1: 'API أسعار الأدوية في مصر', lead: 'كتالوج الأدوية المصري كاملًا عبر JSON واحد منظم: أسعار محدثة بتاريخها، المواد الفعالة والشركات والفئات بمعرّفات موحّدة، البدائل، الباركود، وتغذية تغييرات تخبر نظامك بما تغيّر فقط.', try: 'جرّب العينة مجانًا', request: 'اطلب الوصول', coverage: 'التغطية الآن', companies: 'شركة', ingredients: 'مادة فعالة', get: 'ماذا تحصل عليه', getLead: 'كائن Drug واحد لكل منتج وعبوة، بأنواع ثابتة: الأرقام أرقام، والمجهول null، والتواريخ ISO 8601.', value: 'ما الذي يميز هذا الـ API', uses: 'لمن هو', plans: 'الخطط والأسعار', plansLead: 'ابدأ بالعينة بلا مفتاح، ثم اختر الخطة المناسبة لحجم استخدامك. خطة Enterprise تشمل تصدير قاعدة البيانات كاملة (CSV/Excel/JSON) و webhooks عند تغيّر الأسعار.', faq: 'أسئلة شائعة', access: 'اطلب الوصول', accessLead: 'أخبرنا عن استخدامك ونرد خلال يوم عمل برابط لوحة المطورين.', example: 'مثال: طلب واحد يكفي لتحديث صنف' }
    : { crumb: 'Drug Prices API', h1: 'Egyptian Drug Prices API', lead: 'The whole Egyptian drug catalogue as one well-formed JSON: dated, up-to-date prices; ingredients, companies and categories with normalised ids; alternatives; barcodes; and a delta feed that tells your system only what changed.', try: 'Try the free sample', request: 'Request access', coverage: 'Coverage today', companies: 'companies', ingredients: 'ingredients', get: 'What you get', getLead: 'One Drug object per product and pack, with stable types: numbers are numbers, unknown is null, dates are ISO 8601.', value: 'What sets this API apart', uses: 'Who it is for', plans: 'Plans and pricing', plansLead: 'Start with the keyless sample, then pick the plan for your volume. Enterprise includes a full database export (CSV/Excel/JSON) and webhooks on price changes.', faq: 'FAQ', access: 'Request access', accessLead: 'Tell us about your use and we answer within one business day with your dashboard link.', example: 'Example: one request updates an item' };
  const example = `GET ${publicBase}/drugs/by-barcode/6221051011317\nAuthorization: Bearer dp_live_…\n\n{ "data": [ { "id": "congestal-20-tabs", "trade_name_ar": "كونجستال 20 قرص",\n    "price": { "current": 50, "previous": 31, "unit_price": 2.5, "currency": "EGP",\n               "effective_date": "2024-06-06", "verified": true },\n    "company": { "id": "sigma", "name": "Sigma" }, "status": "listed", … } ] }`;

  return (
    <div dir={ar ? 'rtl' : 'ltr'} lang={lang}>
      <ApiNav current={ar ? '/api' : '/api/en'} lang={lang} />
      <section className="border-b border-border bg-surface">
        <Container className="py-10 md:py-16">
          <Breadcrumbs lang={lang} items={[{ name: t.crumb }]} />
          <div className="mt-4 grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h1 className="type-h1 text-ink">{t.h1}</h1>
              <p className="mt-3 max-w-xl text-lg text-text-2">{t.lead}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link prefetch={false} href={`${base}/sample`} className={buttonClass('primary')}>{t.try}</Link>
                <Link prefetch={false} href={`${base}/request-access`} className={buttonClass('secondary')}>{t.request}</Link>
              </div>
            </div>
            <CodeBlock code={example} title={t.example} lang={lang} />
          </div>
        </Container>
      </section>

      <Container className="space-y-14 py-10 md:py-14">
        <section aria-labelledby="coverage">
          <SectionTitle id="coverage">{t.coverage}</SectionTitle>
          <StatsStrip
            items={[
              { label: t.companies, value: n(dataset.counts.companies) },
              { label: t.ingredients, value: n(dataset.counts.ingredients) },
            ]}
          />
        </section>

        <section aria-labelledby="fields">
          <SectionTitle id="fields">{t.get}</SectionTitle>
          <p className="mb-4 max-w-3xl text-text-2">{t.getLead}</p>
          <FieldTable lang={lang} caption={t.get} rows={FIELDS.map((f) => ({ name: f.name, type: f.type, description: ar ? f.ar : f.en, example: f.example }))} />
          <p className="type-small mt-2 text-text-2">
            {ar ? 'الوثيقة الكاملة لكل الحقول ونقاط النهاية: ' : 'Every field and endpoint: '}
            <Link prefetch={false} href={`${base}/docs`} className="text-primary underline">{base}/docs</Link>
          </p>
        </section>

        <section aria-labelledby="value">
          <SectionTitle id="value">{t.value}</SectionTitle>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {VALUE[lang].map(([title, body]) => (
              <li key={title} className="rounded-card border border-border bg-bg p-5">
                <h3 className="font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-text-2">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="uses">
          <SectionTitle id="uses">{t.uses}</SectionTitle>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            {USE_CASES[lang].map(([title, body]) => (
              <li key={title} className="rounded-card border border-border bg-surface p-4">
                <h3 className="font-semibold text-ink">{title}</h3>
                <p className="type-small mt-2 text-text-2">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="plans">
          <SectionTitle id="plans">{t.plans}</SectionTitle>
          <p className="mb-5 max-w-3xl text-text-2">{t.plansLead}</p>
          <PlanCards plans={plans} lang={lang} />
          <p className="type-small mt-3 text-text-2">
            {ar ? 'الدفع يدوي حاليًا (تحويل بنكي أو فوري) ويُسجَّل في حسابك؛ الدفع الإلكتروني قريبًا. الشروط: ' : 'Billing is manual for now (bank transfer or Fawry) and recorded on your account; online payment is coming. Terms: '}
            <Link prefetch={false} href={`${base}/terms`} className="text-primary underline">{base}/terms</Link>
          </p>
        </section>

        <section aria-labelledby="faq">
          <SectionTitle id="faq">{t.faq}</SectionTitle>
          <Faq items={FAQ[lang]} />
        </section>

        <section aria-labelledby="access" className="rounded-card border border-border bg-surface p-5 md:p-8">
          <SectionTitle id="access">{t.access}</SectionTitle>
          <p className="mb-5 max-w-3xl text-text-2">{t.accessLead}</p>
          <AccessRequestForm action={submitAccessRequest} plans={plans.filter((p) => p.id !== 'sample')} lang={lang} />
          <p className="type-small mt-4 text-text-2">
            {ar ? 'أو عبر ' : 'Or through '}
            <Link prefetch={false} href={routes.contact()} className="text-primary underline">{ar ? 'صفحة اتصل بنا' : 'the contact page'}</Link>.
            {' '}{ar ? 'المصطلحات التقنية: ' : 'Technical terms: '}<Code>since</Code>, <Code>cursor</Code>, <Code>X-RateLimit-Remaining</Code>.
          </p>
        </section>
      </Container>
    </div>
  );
}
