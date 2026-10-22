'use client';

// Google Analytics 4 and site-verification forms. Two independent <SettingsForm>s so each saves on
// its own.
import { SettingsForm } from './SettingsForm';
import { TextInput } from './fields';
import { Card } from './parts';
import { saveAnalyticsAction, saveVerificationAction } from '@/lib/settings/actions';
import type { AnalyticsSettings, VerificationSettings } from '@/lib/settings/config';

export function AnalyticsForm({ analytics, verification }: { analytics: AnalyticsSettings; verification: VerificationSettings }) {
  return (
    <>
      <Card title="Google Analytics 4" description="عدّاد زيارات لا يُرسل ما يكتبه المستخدمون في البحث. يُحمَّل فقط بعد موافقة الزائر على الكوكيز، ولا يُحمَّل إطلاقًا إذا تُرك الحقل فارغًا.">
        <SettingsForm action={saveAnalyticsAction}>
          <TextInput
            name="ga4MeasurementId"
            label="معرّف القياس (Measurement ID)"
            defaultValue={analytics.ga4MeasurementId}
            dir="ltr"
            placeholder="G-XXXXXXXXXX"
            help="من إعدادات GA4 › مصادر البيانات › الويب. اتركه فارغًا لإيقاف التتبّع تمامًا."
          />
          <div className="rounded-card border border-rx/30 bg-rx-bg/60 p-3">
            <p className="type-small text-ink">
              <strong>مهم للخصوصية:</strong> من داخل GA4، أوقف «قياس البحث في الموقع» ضمن «القياس المحسّن»، لأن جوجل قد يلتقط نص البحث من الرابط من جانبه. الموقع نفسه لا يرسل نص البحث ولا يربطه بأي بيانات شخصية.
            </p>
          </div>
        </SettingsForm>
      </Card>

      <Card title="رموز التحقق" description="تظهر على الصفحة الرئيسية فقط لإثبات ملكية الموقع لمحركات البحث.">
        <SettingsForm action={saveVerificationAction}>
          <TextInput
            name="google"
            label="Google Search Console"
            defaultValue={verification.google}
            dir="ltr"
            placeholder="رمز التحقق أو وسم <meta> كامل"
            help="من Search Console › الإعدادات › التحقق عبر وسم HTML. يمكنك لصق الرمز وحده أو الوسم كاملًا."
          />
          <TextInput
            name="bing"
            label="Bing Webmaster"
            defaultValue={verification.bing}
            dir="ltr"
            placeholder="msvalidate.01 أو وسم <meta> كامل"
            help="من Bing Webmaster Tools › التحقق من الموقع."
          />
        </SettingsForm>
      </Card>
    </>
  );
}
