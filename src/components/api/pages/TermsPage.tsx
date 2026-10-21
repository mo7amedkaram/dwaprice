import Link from 'next/link';
import { Breadcrumbs } from '../../Breadcrumbs';
import { ApiNav } from '../ApiNav';
import { Container } from '../../ui';
import { getPublicPlans } from '@/lib/api/dashboard-data';
import type { Lang } from '@/lib/api/lang';
import { formatDate } from '@/lib/format';
import { SITE, routes } from '@/lib/site';

export const TERMS_UPDATED = '2026-10-21';

export async function TermsPage({ lang }: { lang: Lang }) {
  const ar = lang === 'ar';
  const base = ar ? '/api' : '/api/en';
  const plans = (await getPublicPlans()).filter((p) => p.id !== 'sample');
  const support = (p: { features: Record<string, unknown> }) => String(p.features.support ?? '');
  const sla = (
    <table>
      <thead>
        <tr>
          <th>{ar ? 'الخطة' : 'Plan'}</th>
          <th>{ar ? 'الطلبات/الدقيقة' : 'Requests/min'}</th>
          <th>{ar ? 'الحصة الشهرية' : 'Monthly quota'}</th>
          <th>{ar ? 'الدعم' : 'Support'}</th>
        </tr>
      </thead>
      <tbody>
        {plans.map((p) => (
          <tr key={p.id}>
            <td>{ar ? p.name_ar : p.name}</td>
            <td dir="ltr">{p.rpm.toLocaleString('en-US')}</td>
            <td dir="ltr">{p.monthly_quota === null ? (ar ? 'حسب الاتفاق' : 'by agreement') : p.monthly_quota.toLocaleString('en-US')}</td>
            <td dir="ltr">{support(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      <ApiNav current={`${base}/terms`} lang={lang} />
      <Container className="py-6 md:py-10">
        <Breadcrumbs lang={lang} items={ar ? [{ name: 'API أسعار الأدوية', href: '/api' }, { name: 'شروط الترخيص' }] : [{ name: 'Drug Prices API', href: '/api/en' }, { name: 'License terms' }]} />
        <h1 className="type-h1 mt-3 text-ink">{ar ? 'شروط ترخيص الـ API' : 'API license terms'}</h1>
        <p className="mt-2 max-w-3xl text-text-2">
          {ar ? <>باستخدامك لمفتاح الـ API أو للعينة فأنت توافق على هذه الشروط إضافة إلى <Link prefetch={false} href={routes.terms()} className="text-primary underline">شروط استخدام الموقع</Link>. آخر مراجعة: {formatDate(TERMS_UPDATED)}.</>
              : <>By using an API key or the sample you accept these terms in addition to the <Link prefetch={false} href={routes.terms()} className="text-primary underline">site terms</Link>. Last reviewed {TERMS_UPDATED}.</>}
        </p>
        {ar ? (
          <article className="prose-ar mt-6">
            <h2>١. الترخيص</h2>
            <p>نمنحك ترخيصًا غير حصري وغير قابل للتحويل لاستخدام البيانات التي يعيدها الـ API داخل منتجك أو منشأتك (نظام نقاط بيع، تطبيق، موقع، نظام داخلي) طوال مدة اشتراكك. البيانات ملك {SITE.name}، ولا ينقل هذا الترخيص أي ملكية.</p>
            <h2>٢. ممنوع إعادة البيع أو إعادة النشر</h2>
            <ul>
              <li>لا يجوز بيع البيانات أو ترخيصها أو إتاحتها لطرف ثالث كمجموعة بيانات أو كواجهة برمجية منافسة، لا كاملة ولا جزئية.</li>
              <li>لا يجوز نشر قاعدة البيانات أو ملفات التصدير أو نسخ كبيرة منها علنًا أو مشاركتها خارج منشأتك.</li>
              <li>يجوز عرض الأسعار والمعلومات للمستخدمين النهائيين داخل منتجك كجزء من خدمتك، لا كمنتج بيانات مستقل.</li>
              <li>ملفات التصدير (خطة Enterprise) تحتوي سجلات سلامة خاصة بكل عميل تسمح بتتبع أي نسخة مسرّبة.</li>
            </ul>
            <h2>٣. الإسناد</h2>
            <p>عند عرض الأسعار للجمهور اذكر المصدر «{SITE.name} — dwaprice.com» في الصفحة أو في شاشة «حول». لا يُشترط الإسناد في الأنظمة الداخلية.</p>
            <h2>٤. الاستخدام العادل</h2>
            <ul>
              <li>التزم بحدود خطتك (الطلبات في الدقيقة والحصة الشهرية) وبترويسات <code dir="ltr">X-RateLimit</code> و<code dir="ltr">Retry-After</code>.</li>
              <li>استخدم تغذية التغييرات <code dir="ltr">/price-changes</code> للمزامنة بدل إعادة تحميل الكتالوج كاملًا بشكل متكرر، واحتفظ بالمفتاح على الخادم فقط (لا في تطبيق هاتف أو متصفح).</li>
              <li>يحق لنا إيقاف مفتاح مؤقتًا عند أنماط تشير إلى نسخ آلي للكتالوج أو مشاركة المفتاح، وإبلاغك لتوضيح الأمر.</li>
            </ul>
            <h2>٥. مستوى الخدمة لكل خطة</h2>
            {sla}
            <p>هدفنا توافر الخدمة 99.5٪ شهريًا لكل الخطط، و99.9٪ لخطة Enterprise بموجب العقد. تُستثنى أعمال الصيانة المعلنة مسبقًا. عند انقطاع يتجاوز الهدف في خطة Enterprise نمدد مدة الاشتراك بما يعادله.</p>
            <h2>٦. دقة البيانات</h2>
            <p>نجمع الأسعار من قوائم وأدلة أسعار الأدوية المنشورة في مصر ومن مواقع الشركات المنتجة، ونتحقق منها مقابل مصادر منشورة؛ علامة <code dir="ltr">verified</code> تعني أن السعر طُوبق مع مصدر منشور في التاريخ المذكور. الأسعار هي أسعار البيع للجمهور المعلنة وقت التحديث وقد تختلف في بعض الصيدليات. نبذل جهدًا معقولًا لتكون البيانات صحيحة ومحدثة، لكننا لا نضمن خلوها من الخطأ أو التأخير، وعليك التحقق قبل أي قرار تجاري أو تنظيمي يعتمد عليها. أبلغنا عن أي خطأ على <a href={`mailto:${SITE.contactEmail}`} dir="ltr">{SITE.contactEmail}</a>.</p>
            <h2>٧. إخلاء المسؤولية الطبية</h2>
            <p>الـ API يقدم بيانات كتالوج وأسعار فقط ولا يقدم نصيحة طبية. البدائل المعروضة تشترك في المادة الفعالة والتركيز ولا تعني تكافؤًا علاجيًا كاملًا؛ أي استبدال أو صرف يبقى مسؤولية الصيدلي أو الطبيب. راجع <Link prefetch={false} href={routes.disclaimer()}>إخلاء المسؤولية الطبية</Link>.</p>
            <h2>٨. الدفع والإنهاء</h2>
            <ul>
              <li>الاشتراك شهري ويُدفع مقدمًا؛ يُسجَّل تاريخ انتهاء المدة في حسابك ويعمل المفتاح 7 أيام بعدها كفترة سماح.</li>
              <li>يحق لك إنهاء الاشتراك في أي وقت؛ تبقى البيانات التي حمّلتها خلال المدة مرخصة للاستخدام الداخلي، ويتوقف أي تحديث.</li>
              <li>يحق لنا إنهاء الترخيص فورًا عند مخالفة البندين ٢ أو ٤.</li>
            </ul>
            <h2>٩. التغييرات</h2>
            <p>قد نحدّث هذه الشروط؛ نعلن التغييرات الجوهرية بالبريد قبل 30 يومًا من سريانها. الإصدار <code dir="ltr">/v1</code> من الـ API يبقى متاحًا 12 شهرًا على الأقل بعد إعلان أي إصدار لاحق.</p>
          </article>
        ) : (
          <article className="prose-ar mt-6 text-start">
            <h2>1. License</h2>
            <p>We grant you a non-exclusive, non-transferable license to use the data the API returns inside your product or organisation (POS, app, website, internal system) for the duration of your subscription. The data remains the property of {SITE.name}; no ownership is transferred.</p>
            <h2>2. No resale or redistribution</h2>
            <ul>
              <li>The data may not be sold, licensed or made available to third parties as a dataset or a competing API, in whole or in part.</li>
              <li>The database, export files or substantial copies may not be published or shared outside your organisation.</li>
              <li>Showing prices and information to your end users inside your product, as part of your service, is allowed; a standalone data product is not.</li>
              <li>Export files (Enterprise plan) contain per-client integrity records that let us trace a leaked copy.</li>
            </ul>
            <h2>3. Attribution</h2>
            <p>When prices are shown publicly, credit “{SITE.name} — dwaprice.com” on the page or in an “about” screen. Internal systems need no attribution.</p>
            <h2>4. Fair use</h2>
            <ul>
              <li>Respect your plan limits (requests per minute, monthly quota) and the <code>X-RateLimit</code> / <code>Retry-After</code> headers.</li>
              <li>Use the <code>/price-changes</code> feed to sync instead of reloading the whole catalogue repeatedly, and keep the key server-side (never in a mobile app or browser).</li>
              <li>We may pause a key on patterns that indicate automated copying of the catalogue or key sharing, and will contact you to clarify.</li>
            </ul>
            <h2>5. Service level per plan</h2>
            {sla}
            <p>Our target is 99.5 % monthly availability for all plans and 99.9 % for Enterprise by contract, excluding announced maintenance. For Enterprise, downtime beyond the target extends the subscription by the same length.</p>
            <h2>6. Data accuracy</h2>
            <p>Prices are collected from the drug price lists and directories published in Egypt and from manufacturers, and verified against published sources; the <code>verified</code> flag means the price was matched with a published source on the stated date. They are public retail prices at the time of update and may differ in some pharmacies. We make reasonable efforts to keep the data correct and current but do not warrant it is free of errors or delays; verify before any commercial or regulatory decision that depends on it. Report errors to <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
            <h2>7. Medical disclaimer</h2>
            <p>The API provides catalogue and price data only, not medical advice. Alternatives share the active ingredient and strength and do not imply full therapeutic equivalence; substitution and dispensing remain the pharmacist’s or physician’s responsibility. See the <Link prefetch={false} href={routes.disclaimer()}>medical disclaimer</Link>.</p>
            <h2>8. Payment and termination</h2>
            <ul>
              <li>Subscriptions are monthly and paid in advance; the paid-until date is recorded on your account and keys keep working for a 7-day grace period after it.</li>
              <li>You may end the subscription at any time; data downloaded during the term stays licensed for internal use, and updates stop.</li>
              <li>We may terminate the license immediately on breach of sections 2 or 4.</li>
            </ul>
            <h2>9. Changes</h2>
            <p>We may update these terms; material changes are announced by e-mail 30 days before they take effect. API <code>/v1</code> stays available for at least 12 months after any later version is announced.</p>
          </article>
        )}
      </Container>
    </>
  );
}
