'use client';

// Client forms of the API section: login link, key creation/rotation (the key is shown
// once), revoke with an inline confirmation, the request-access form with field errors.
import { useActionState } from 'react';
import { CopyButton } from './CopyButton';
import { buttonClass, cx } from '../ui';
import type { KeyFormState, LoginFormState } from '@/lib/api/dashboard-actions';
import type { AccessFormState } from '@/lib/api/access-requests';

type Action<S> = (prev: S, form: FormData) => Promise<S>;

export const field =
  'min-h-11 w-full rounded-control border border-border bg-bg px-3 text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-tint';
export const label = 'mb-1 block font-medium text-ink';

export function LoginForm({ action, lang = 'ar' }: { action: Action<LoginFormState>; lang?: 'ar' | 'en' }) {
  const [state, formAction, pending] = useActionState(action, { sent: false });
  const t = lang === 'ar'
    ? { email: 'البريد الإلكتروني المسجل', send: 'أرسل رابط الدخول', sent: 'إن كان البريد مسجلًا لدينا فسيصلك رابط دخول صالح 15 دقيقة.', limited: 'محاولات كثيرة؛ انتظر دقيقة ثم أعد المحاولة.', dev: 'وضع التطوير: الرابط الذي كان سيُرسل' }
    : { email: 'Registered e-mail', send: 'Send login link', sent: 'If the address is registered, a login link valid for 15 minutes is on its way.', limited: 'Too many attempts; wait a minute and try again.', dev: 'Development mode: the link that would have been mailed' };
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="login-email" className={label}>{t.email}</label>
        <input id="login-email" name="email" type="email" required autoComplete="email" dir="ltr" className={field} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass('primary', 'w-full')}>{t.send}</button>
      {state.limited && <p role="alert" className="rounded-control bg-up-bg px-3 py-2 text-up">{t.limited}</p>}
      {state.sent && !state.limited && <p role="status" className="rounded-control bg-primary-tint px-3 py-2 text-primary">{t.sent}</p>}
      {state.devLink && (
        <p className="type-small rounded-control border border-dashed border-border p-3 text-text-2">
          {t.dev}:{' '}
          <a href={state.devLink} dir="ltr" className="break-all text-primary underline">{state.devLink}</a>
        </p>
      )}
    </form>
  );
}

function KeyReveal({ state, lang }: { state: KeyFormState; lang: 'ar' | 'en' }) {
  if (state.error) return <p role="alert" className="rounded-control bg-up-bg px-3 py-2 text-up">{state.error}</p>;
  if (!state.key) return null;
  return (
    <div role="status" className="rounded-card border border-primary bg-primary-tint p-4">
      <p className="font-semibold text-ink">{lang === 'ar' ? `المفتاح الجديد «${state.name}» — انسخه الآن، لن يظهر مرة أخرى` : `New key "${state.name}" — copy it now, it will not be shown again`}</p>
      <div className="mt-2 flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 overflow-x-auto rounded-control bg-bg px-3 py-2 font-mono text-sm text-ink">{state.key}</code>
        <CopyButton text={state.key} label={lang === 'ar' ? 'نسخ' : 'Copy'} copiedLabel={lang === 'ar' ? 'تم' : 'Copied'} />
      </div>
    </div>
  );
}

export function KeyCreateForm({ action, hidden = {}, lang = 'ar', disabled = false }: { action: Action<KeyFormState>; hidden?: Record<string, string>; lang?: 'ar' | 'en'; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div className="min-w-48 flex-1">
          <label htmlFor="key-name" className={label}>{lang === 'ar' ? 'اسم المفتاح' : 'Key name'}</label>
          <input id="key-name" name="name" maxLength={60} placeholder={lang === 'ar' ? 'مثال: نظام نقاط البيع' : 'e.g. POS backend'} className={field} />
        </div>
        <button type="submit" disabled={pending || disabled} className={buttonClass('primary')}>{lang === 'ar' ? 'إنشاء مفتاح' : 'Create key'}</button>
      </form>
      <KeyReveal state={state} lang={lang} />
    </div>
  );
}

export function RotateKeyForm({ action, keyId, lang = 'ar' }: { action: Action<KeyFormState>; keyId: string; lang?: 'ar' | 'en' }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="key_id" value={keyId} />
        <button type="submit" disabled={pending} className={buttonClass('secondary')}>{lang === 'ar' ? 'تدوير' : 'Rotate'}</button>
      </form>
      <KeyReveal state={state} lang={lang} />
    </div>
  );
}

/** Revoke needs a second click (the first opens the confirmation); no browser dialog. */
export function RevokeKeyForm({ action, hidden, lang = 'ar' }: { action: (form: FormData) => Promise<void>; hidden: Record<string, string>; lang?: 'ar' | 'en' }) {
  return (
    <details className="group">
      <summary className={cx(buttonClass('ghost'), 'cursor-pointer list-none text-up [&::-webkit-details-marker]:hidden')}>{lang === 'ar' ? 'إلغاء' : 'Revoke'}</summary>
      <form action={action} className="mt-2 rounded-control border border-up/40 bg-up-bg p-3">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <p className="type-small mb-2 text-ink">{lang === 'ar' ? 'سيتوقف هذا المفتاح فورًا ولا يمكن استرجاعه.' : 'This key stops working immediately and cannot be restored.'}</p>
        <button type="submit" className={buttonClass('primary', 'bg-up hover:bg-up')}>{lang === 'ar' ? 'تأكيد الإلغاء' : 'Confirm revoke'}</button>
      </form>
    </details>
  );
}

const VOLUMES = [
  { id: 'lt-10k', ar: 'أقل من 10 آلاف طلب شهريًا', en: 'Under 10k requests / month' },
  { id: '10k-100k', ar: '10 آلاف – 100 ألف', en: '10k – 100k' },
  { id: '100k-1m', ar: '100 ألف – مليون', en: '100k – 1M' },
  { id: 'gt-1m', ar: 'أكثر من مليون', en: 'Over 1M' },
];

export function AccessRequestForm({ action, plans, initialPlan, lang = 'ar' }: { action: Action<AccessFormState>; plans: Array<{ id: string; name: string; name_ar: string }>; initialPlan?: string; lang?: 'ar' | 'en' }) {
  const [state, formAction, pending] = useActionState(action, { errors: {}, values: { plan_id: initialPlan ?? '' } });
  const v = state.values;
  const e = state.errors;
  const t = lang === 'ar'
    ? { name: 'الاسم', company: 'الشركة / الصيدلية', email: 'البريد الإلكتروني', phone: 'الهاتف / واتساب', use: 'كيف ستستخدم البيانات؟', volume: 'الحجم المتوقع', plan: 'الخطة', pref: 'التواصل المفضل', email2: 'البريد الإلكتروني', wa: 'واتساب', submit: 'أرسل الطلب', note: 'نرد خلال يوم عمل. لا نرسل أي رسائل تسويقية.' }
    : { name: 'Name', company: 'Company / pharmacy', email: 'E-mail', phone: 'Phone / WhatsApp', use: 'How will you use the data?', volume: 'Expected volume', plan: 'Plan', pref: 'Preferred contact', email2: 'E-mail', wa: 'WhatsApp', submit: 'Send request', note: 'We answer within one business day. No marketing e-mail.' };
  const err = (k: string) => e[k] && <p id={`err-${k}`} className="type-small mt-1 text-up">{e[k]}</p>;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="lang" value={lang} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="ar-name" className={label}>{t.name}</label>
          <input id="ar-name" name="name" defaultValue={v.name} required autoComplete="name" aria-invalid={!!e.name} aria-describedby={e.name ? 'err-name' : undefined} className={field} />
          {err('name')}
        </div>
        <div>
          <label htmlFor="ar-company" className={label}>{t.company}</label>
          <input id="ar-company" name="company" defaultValue={v.company} required autoComplete="organization" aria-invalid={!!e.company} className={field} />
          {err('company')}
        </div>
        <div>
          <label htmlFor="ar-email" className={label}>{t.email}</label>
          <input id="ar-email" name="email" type="email" defaultValue={v.email} required autoComplete="email" dir="ltr" aria-invalid={!!e.email} className={field} />
          {err('email')}
        </div>
        <div>
          <label htmlFor="ar-phone" className={label}>{t.phone}</label>
          <input id="ar-phone" name="phone" type="tel" defaultValue={v.phone} autoComplete="tel" dir="ltr" placeholder="+20 1x xxx xxxx" aria-invalid={!!e.phone} className={field} />
          {err('phone')}
        </div>
      </div>
      <div>
        <label htmlFor="ar-use" className={label}>{t.use}</label>
        <textarea id="ar-use" name="use_case" rows={4} defaultValue={v.use_case} required aria-invalid={!!e.use_case} className={cx(field, 'py-2')} />
        {err('use_case')}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="ar-volume" className={label}>{t.volume}</label>
          <select id="ar-volume" name="expected_volume" defaultValue={v.expected_volume ?? ''} required className={field}>
            <option value="">—</option>
            {VOLUMES.map((o) => <option key={o.id} value={o.id}>{lang === 'ar' ? o.ar : o.en}</option>)}
          </select>
          {err('expected_volume')}
        </div>
        <div>
          <label htmlFor="ar-plan" className={label}>{t.plan}</label>
          <select id="ar-plan" name="plan_id" defaultValue={v.plan_id ?? ''} required className={field}>
            <option value="">—</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar : p.name}</option>)}
          </select>
          {err('plan_id')}
        </div>
        <fieldset>
          <legend className={label}>{t.pref}</legend>
          <div className="flex min-h-11 items-center gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="contact_pref" value="email" defaultChecked={(v.contact_pref ?? 'email') === 'email'} /> {t.email2}</label>
            <label className="flex items-center gap-2"><input type="radio" name="contact_pref" value="whatsapp" defaultChecked={v.contact_pref === 'whatsapp'} /> {t.wa}</label>
          </div>
          {err('contact_pref')}
        </fieldset>
      </div>
      <div className="absolute -start-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      {e.form && <p role="alert" className="rounded-control bg-up-bg px-3 py-2 text-up">{e.form}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass('primary')}>{t.submit}</button>
        <span className="type-small text-text-2">{t.note}</span>
      </div>
    </form>
  );
}
