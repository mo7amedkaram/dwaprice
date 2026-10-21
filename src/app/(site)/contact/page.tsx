import Link from 'next/link';
import { StaticPage } from '@/components/StaticPage';
import { buttonClass } from '@/components/ui';
import { buildMetadata } from '@/lib/seo/metadata';
import { SITE, routes } from '@/lib/site';

export const metadata = buildMetadata({
  kind: 'static',
  path: routes.contact(),
  title: 'اتصل بنا',
  description: `راسل فريق ${SITE.name} للإبلاغ عن سعر أو معلومة غير دقيقة، أو لأي استفسار عن الموقع.`,
});

export default function ContactPage() {
  return (
    <StaticPage title="اتصل بنا" path={routes.contact()} updated="2026-10-21" lead="نرحب بملاحظاتك، خصوصًا عن الأسعار والمعلومات التي تحتاج تصحيحًا.">
      <p>
        <a href={`mailto:${SITE.contactEmail}`} className={buttonClass('primary', 'text-on-primary! no-underline!')}>
          راسلنا على {SITE.contactEmail}
        </a>
      </p>

      <h2>للإبلاغ عن سعر أو معلومة غير دقيقة</h2>
      <p>حتى نراجع البلاغ بسرعة، اذكر في رسالتك:</p>
      <ul>
        <li>رابط صفحة الدواء أو اسمه كما يظهر في الموقع.</li>
        <li>السعر أو المعلومة الصحيحة، ومصدرها (صورة العبوة، نشرة الدواء، قائمة أسعار رسمية…).</li>
        <li>تاريخ رؤيتك للسعر إن كان سعرًا جديدًا.</li>
      </ul>

      <h2>أسئلة طبية</h2>
      <p>
        لا نستطيع الرد على أسئلة عن حالتك الصحية أو جرعة دوائك. اسأل طبيبك أو الصيدلي، وفي الحالات الطارئة اتصل بالإسعاف على <strong>123</strong>.
        اقرأ <Link href={routes.disclaimer()}>إخلاء المسؤولية الطبية</Link>.
      </p>

      <h2>بياناتك</h2>
      <p>
        نستخدم بريدك الإلكتروني للرد على رسالتك فقط. التفاصيل في <Link href={routes.privacy()}>سياسة الخصوصية</Link>.
      </p>
    </StaticPage>
  );
}
