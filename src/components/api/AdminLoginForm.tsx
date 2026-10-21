'use client';

import { useActionState } from 'react';
import { buttonClass } from '../ui';
import { field, label } from './Forms';
import type { AdminLoginState } from '@/lib/api/admin-actions';

const MESSAGES: Record<NonNullable<AdminLoginState['error']>, string> = {
  invalid: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  locked: 'الحساب موقوف مؤقتًا بعد محاولات فاشلة متكررة؛ حاول بعد 15 دقيقة.',
  limited: 'محاولات كثيرة من هذا العنوان؛ انتظر دقيقة ثم أعد المحاولة.',
};

export function AdminLoginForm({ action }: { action: (prev: AdminLoginState, form: FormData) => Promise<AdminLoginState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="admin-email" className={label}>البريد الإلكتروني</label>
        <input id="admin-email" name="email" type="email" required autoComplete="username" dir="ltr" defaultValue={state.email} className={field} />
      </div>
      <div>
        <label htmlFor="admin-password" className={label}>كلمة المرور</label>
        <input id="admin-password" name="password" type="password" required autoComplete="current-password" dir="ltr" minLength={12} className={field} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass('primary', 'w-full')}>دخول</button>
      {state.error && <p role="alert" className="rounded-control bg-up-bg px-3 py-2 text-up">{MESSAGES[state.error]}</p>}
    </form>
  );
}
