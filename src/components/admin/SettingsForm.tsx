'use client';

// Client wrapper around a settings server action: a success/error toast, a sticky save bar with a
// pending state, an unsaved-changes warning, and inline field errors. The actual fields are passed
// as children (each page builds its own, so it can add live counters, previews, validation, etc.).
import { useActionState, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon } from './icons';

export interface SettingsFormState {
  ok?: boolean;
  error?: string;
  /** Per-field messages keyed by input name. */
  fieldErrors?: Record<string, string>;
  /** Changes every submit so the toast re-fires on a repeat save. */
  at?: number;
}

export function useSettingsForm(action: (prev: SettingsFormState, form: FormData) => Promise<SettingsFormState>) {
  const [state, formAction, pending] = useActionState(action, {});
  return { state, formAction, pending };
}

export function SettingsForm({
  action,
  children,
  submitLabel = 'حفظ',
}: {
  action: (prev: SettingsFormState, form: FormData) => Promise<SettingsFormState>;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const lastAt = useRef<number | undefined>(undefined);

  // React to a new submission result: show a toast and clear the dirty flag on success. The state
  // updates run from a rAF callback / timers, never synchronously in the effect body.
  useEffect(() => {
    if (state.at === undefined || state.at === lastAt.current) return;
    lastAt.current = state.at;
    const raf = requestAnimationFrame(() => {
      if (state.ok) {
        setDirty(false);
        setToast({ ok: true, msg: 'تم الحفظ. سيظهر التغيير على الموقع خلال ثوانٍ.' });
      } else {
        setToast({ ok: false, msg: state.error || 'تعذّر الحفظ. راجع الحقول وحاول مرة أخرى.' });
      }
    });
    const t = setTimeout(() => setToast(null), 5000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [state]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <form action={formAction} onInput={() => setDirty(true)} className="relative">
      {/* field errors are read by children via the data attribute below */}
      <FieldErrorContext value={state.fieldErrors ?? {}}>{children}</FieldErrorContext>

      <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={pending}
          className="tap inline-flex items-center gap-2 rounded-control bg-primary px-5 py-2.5 font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? 'جارٍ الحفظ…' : submitLabel}
        </button>
        {dirty && !pending && <span className="type-small text-rx">لديك تغييرات غير محفوظة</span>}
      </div>

      {/* toast */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <div
            role={toast.ok ? 'status' : 'alert'}
            className={
              'pointer-events-auto flex items-center gap-2 rounded-card border px-4 py-3 shadow-lg ' +
              (toast.ok ? 'border-down/30 bg-down-bg text-ink' : 'border-up/30 bg-up-bg text-ink')
            }
          >
            {toast.ok && <CheckCircleIcon size={20} className="text-down" />}
            <span className="font-medium">{toast.msg}</span>
          </div>
        )}
      </div>
    </form>
  );
}

// Minimal context so a <FieldError name="…" /> can show the server's per-field message.
import { createContext, useContext } from 'react';
const FieldErrors = createContext<Record<string, string>>({});
function FieldErrorContext({ value, children }: { value: Record<string, string>; children: React.ReactNode }) {
  return <FieldErrors.Provider value={value}>{children}</FieldErrors.Provider>;
}
export function useFieldError(name: string): string | undefined {
  return useContext(FieldErrors)[name];
}
