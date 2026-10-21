'use server';
// The request-access form (/api/request-access): validation, spam limits, api.access_requests,
// admin notification. Runs as a server action.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiQuery } from './db';
import { clientIp, ipPrefix } from './net';
import { notifyAdmin } from './notify';
import { hit } from './ratelimit';

export interface AccessFormState {
  errors: Record<string, string>;
  values: Record<string, string>;
}

const VOLUMES = ['lt-10k', '10k-100k', '100k-1m', 'gt-1m'] as const;

// Validation messages in the language of the form (hidden "lang" field).
const MESSAGES = {
  ar: { name: 'اكتب الاسم', company: 'اكتب اسم الشركة أو الصيدلية', email: 'اكتب بريدًا إلكترونيًا صحيحًا', phone: 'اكتب رقم هاتف صحيحًا', whatsapp: 'اكتب رقم واتساب للتواصل', use_case: 'صف الاستخدام في جملة أو أكثر', expected_volume: 'اختر الحجم المتوقع', plan_id: 'اختر الخطة', contact_pref: 'اختر طريقة التواصل', form: 'تم استقبال طلبات كثيرة من هذا العنوان اليوم؛ راسلنا بالبريد بدلًا من ذلك.' },
  en: { name: 'Enter your name', company: 'Enter the company or pharmacy name', email: 'Enter a valid e-mail address', phone: 'Enter a valid phone number', whatsapp: 'Enter a WhatsApp number we can reach', use_case: 'Describe your use in a sentence or more', expected_volume: 'Choose the expected volume', plan_id: 'Choose a plan', contact_pref: 'Choose a contact method', form: 'Too many requests from this address today; e-mail us instead.' },
};

export async function submitAccessRequest(_prev: AccessFormState, form: FormData): Promise<AccessFormState> {
  const v = (k: string) => String(form.get(k) ?? '').trim();
  const values = { name: v('name'), company: v('company'), email: v('email'), phone: v('phone'), use_case: v('use_case'), expected_volume: v('expected_volume'), plan_id: v('plan_id'), contact_pref: v('contact_pref') || 'email' };
  const errors: Record<string, string> = {};
  const m = MESSAGES[v('lang') === 'en' ? 'en' : 'ar'];
  if (v('website')) return { errors: {}, values }; // honeypot: bots fill it; humans never see it
  if (values.name.length < 2 || values.name.length > 120) errors.name = m.name;
  if (values.company.length < 2 || values.company.length > 160) errors.company = m.company;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 200) errors.email = m.email;
  if (values.phone && !/^[+\d][\d\s()-]{6,24}$/.test(values.phone)) errors.phone = m.phone;
  if (values.contact_pref === 'whatsapp' && !values.phone) errors.phone = m.whatsapp;
  if (values.use_case.length < 10 || values.use_case.length > 2000) errors.use_case = m.use_case;
  if (!(VOLUMES as readonly string[]).includes(values.expected_volume)) errors.expected_volume = m.expected_volume;
  const plans = await apiQuery<{ id: string }>('select id from api.plans where is_public and id <> $1', ['sample']);
  if (!plans.some((p) => p.id === values.plan_id)) errors.plan_id = m.plan_id;
  if (!['email', 'whatsapp'].includes(values.contact_pref)) errors.contact_pref = m.contact_pref;
  if (Object.keys(errors).length) return { errors, values };

  const h = await headers();
  const prefix = ipPrefix(clientIp(h));
  const [perIp] = await hit([{ scope: `access:${prefix}:d`, window: 'day' }]);
  if (perIp.count > 5) return { errors: { form: m.form }, values };

  await apiQuery(
    `insert into api.access_requests (name, company, email, phone, use_case, expected_volume, plan_id, contact_pref, ip_prefix)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [values.name, values.company, values.email.toLowerCase(), values.phone || null, values.use_case, values.expected_volume, values.plan_id, values.contact_pref, prefix],
  );
  await notifyAdmin(
    `New API access request: ${values.company}`,
    `Name: ${values.name}\nCompany: ${values.company}\nE-mail: ${values.email}\nPhone: ${values.phone || '-'} (${values.contact_pref})\nPlan: ${values.plan_id}\nVolume: ${values.expected_volume}\n\n${values.use_case}\n\nReview: ${process.env.SITE_URL || 'https://dwaprice.com'}/admin/api`,
    values.email,
  );
  redirect(v('lang') === 'en' ? '/api/en/request-access?sent=1' : '/api/request-access?sent=1');
}
