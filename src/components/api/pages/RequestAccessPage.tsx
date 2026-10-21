import Link from 'next/link';
import { Breadcrumbs } from '../../Breadcrumbs';
import { ApiNav } from '../ApiNav';
import { AccessRequestForm } from '../Forms';
import { Container, buttonClass } from '../../ui';
import { submitAccessRequest } from '@/lib/api/access-requests';
import { getPublicPlans } from '@/lib/api/dashboard-data';
import type { Lang } from '@/lib/api/lang';
import { SITE, routes } from '@/lib/site';

export async function RequestAccessPage({ lang, sent, plan }: { lang: Lang; sent: boolean; plan?: string }) {
  const ar = lang === 'ar';
  const base = ar ? '/api' : '/api/en';
  const plans = (await getPublicPlans()).filter((p) => p.id !== 'sample');
  const whatsapp = (process.env.WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
  const t = ar
    ? { crumb: 'API أسعار الأدوية', here: 'طلب وصول', h1: 'اطلب الوصول إلى الـ API', sentH: 'وصلنا طلبك', sentP: 'نراجع الطلب ونرد خلال يوم عمل على بريدك الإلكتروني برابط الدخول إلى لوحة المطورين، حيث تنشئ مفتاحك بنفسك. في الأثناء يمكنك تجربة العينة وقراءة التوثيق.', try: 'جرّب العينة', docs: 'التوثيق', after: 'ماذا يحدث بعد الطلب', steps: ['نراجع الطلب خلال يوم عمل.', 'نفعّل حسابك على الخطة المختارة ونرسل رابط لوحة المطورين.', 'تنشئ المفتاح بنفسك (يظهر مرة واحدة) وتبدأ.', 'الفاتورة والدفع يدويًا في البداية؛ تُسجَّل المدة في حسابك.'], other: 'تواصل آخر', mail: 'البريد', wa: 'واتساب', waText: 'أرغب في الوصول إلى API أسعار الأدوية', waNone: 'واتساب: اذكر رقمك في الطلب واختر «واتساب» ونتواصل عليه.', contact: 'صفحة اتصل بنا' }
    : { crumb: 'Drug Prices API', here: 'Request access', h1: 'Request access to the API', sentH: 'Request received', sentP: 'We review it and answer within one business day by e-mail with your developer-dashboard link, where you create your own key. Meanwhile, try the sample and read the docs.', try: 'Try the sample', docs: 'Documentation', after: 'What happens next', steps: ['We review the request within one business day.', 'We activate your account on the chosen plan and send the dashboard link.', 'You create the key yourself (shown once) and start.', 'Invoicing and payment are manual at first; the paid period is recorded on your account.'], other: 'Other ways to reach us', mail: 'E-mail', wa: 'WhatsApp', waText: 'I would like access to the drug prices API', waNone: 'WhatsApp: give your number in the request and choose "WhatsApp".', contact: 'Contact page' };
  return (
    <>
      <ApiNav current={`${base}/request-access`} lang={lang} />
      <Container className="py-6 md:py-10">
        <Breadcrumbs lang={lang} items={[{ name: t.crumb, href: base }, { name: t.here }]} />
        <h1 className="type-h1 mt-3 text-ink">{t.h1}</h1>
        {sent ? (
          <div role="status" className="mt-6 max-w-2xl rounded-card border border-primary bg-primary-tint p-6">
            <h2 className="type-h2 text-ink">{t.sentH}</h2>
            <p className="mt-2 text-text-2">{t.sentP}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link prefetch={false} href={`${base}/sample`} className={buttonClass('primary')}>{t.try}</Link>
              <Link prefetch={false} href={`${base}/docs`} className={buttonClass('secondary')}>{t.docs}</Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="rounded-card border border-border bg-bg p-5 md:p-6">
              <AccessRequestForm action={submitAccessRequest} plans={plans} initialPlan={plans.some((p) => p.id === plan) ? plan : undefined} lang={lang} />
            </div>
            <aside className="space-y-4">
              <div className="rounded-card border border-border bg-surface p-4">
                <h2 className="font-semibold text-ink">{t.after}</h2>
                <ol className="mt-2 list-decimal space-y-1 ps-5 text-text-2">{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
              <div className="rounded-card border border-border bg-surface p-4">
                <h2 className="font-semibold text-ink">{t.other}</h2>
                <p className="mt-2 text-text-2">{t.mail}: <a href={`mailto:${SITE.contactEmail}`} dir="ltr" className="text-primary underline">{SITE.contactEmail}</a></p>
                {whatsapp ? (
                  <p className="mt-1 text-text-2">{t.wa}: <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t.waText)}`} rel="noopener noreferrer" target="_blank" dir="ltr" className="text-primary underline">+{whatsapp}</a></p>
                ) : (
                  <p className="mt-1 text-text-2">{t.waNone}</p>
                )}
                <p className="type-small mt-2 text-text-2"><Link prefetch={false} href={routes.contact()} className="text-primary underline">{t.contact}</Link></p>
              </div>
            </aside>
          </div>
        )}
      </Container>
    </>
  );
}
