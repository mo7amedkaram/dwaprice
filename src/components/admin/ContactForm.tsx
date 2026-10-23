'use client';

// Contact + social links form (used by the footer and the contact/API pages).
import { SettingsForm } from './SettingsForm';
import { TextInput } from './fields';
import { saveContactAction } from '@/lib/settings/actions';
import type { ContactSettings } from '@/lib/settings/config';

export function ContactForm({ initial }: { initial: ContactSettings }) {
  return (
    <SettingsForm action={saveContactAction}>
      <TextInput name="email" label="البريد الإلكتروني للتواصل" defaultValue={initial.email} dir="ltr" inputMode="email" help="يظهر في صفحات «تواصل معنا» و«من نحن» والخصوصية." />
      <TextInput name="whatsapp" label="رقم واتساب" defaultValue={initial.whatsapp} dir="ltr" inputMode="numeric" prefix="+" placeholder="201xxxxxxxxx" help="أرقام فقط بالصيغة الدولية دون +. اتركه فارغًا لإخفائه." />
      <TextInput name="whatsappChannelUrl" label="رابط قناة واتساب" defaultValue={initial.whatsappChannelUrl} dir="ltr" inputMode="url" placeholder="https://whatsapp.com/channel/…" help="يظهر زر «تابع آخر تحديثات الأسعار على واتساب» تحت البحث وفي التذييل وصفحة أحدث الأسعار. اتركه فارغًا لإخفاء الزر." />
      <div className="mt-2 border-t border-border pt-4">
        <p className="mb-3 font-medium text-ink">روابط التواصل الاجتماعي</p>
        <TextInput name="facebook" label="فيسبوك" defaultValue={initial.social.facebook} dir="ltr" inputMode="url" placeholder="https://facebook.com/…" />
        <TextInput name="x" label="X (تويتر)" defaultValue={initial.social.x} dir="ltr" inputMode="url" placeholder="https://x.com/…" />
        <TextInput name="instagram" label="إنستجرام" defaultValue={initial.social.instagram} dir="ltr" inputMode="url" placeholder="https://instagram.com/…" />
        <TextInput name="youtube" label="يوتيوب" defaultValue={initial.social.youtube} dir="ltr" inputMode="url" placeholder="https://youtube.com/@…" />
        <TextInput name="telegram" label="تيليجرام" defaultValue={initial.social.telegram} dir="ltr" inputMode="url" placeholder="https://t.me/…" />
      </div>
    </SettingsForm>
  );
}
