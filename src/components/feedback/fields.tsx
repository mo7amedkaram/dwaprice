'use client';

// Shared bits of the public forms (comment, report): labelled inputs with inline errors wired by
// aria-describedby, the hidden anti-bot fields, and the submit button. RTL, 44 px targets.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../ui';
import { HONEYPOT_FIELD, TIMESTAMP_FIELD } from '@/lib/feedback/logic';

export const inputClass =
  'mt-1 w-full rounded-control border border-border bg-bg px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary-tint aria-[invalid=true]:border-up';

export function Field({
  id,
  label,
  error,
  help,
  optional,
  counter,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  help?: ReactNode;
  optional?: boolean;
  counter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-medium text-ink">
          {label}
          {optional && <span className="type-small font-normal text-muted"> (اختياري)</span>}
        </label>
        {counter}
      </div>
      {help && (
        <p id={`${id}-help`} className="type-small mt-0.5 text-text-2">
          {help}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="type-small mt-1 text-up">
          {error}
        </p>
      )}
    </div>
  );
}

/** aria-describedby value for a field: its help and/or error ids. */
export function describedBy(id: string, hasHelp: boolean, hasError: boolean): string | undefined {
  const parts = [hasHelp && `${id}-help`, hasError && `${id}-error`].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/**
 * Anti-bot fields. The honeypot must stay empty (off-screen, tabindex -1, autocomplete off, hidden
 * from assistive tech). The timestamp is set on the CLIENT after mount: drug pages are cached HTML
 * (ISR, up to a day old), so a server-stamped render time would be meaningless — the server only
 * rejects a post made under 3 s after this value, or more than a day after it.
 */
export function BotFields() {
  // '' in the server HTML (no hydration mismatch); the real time lands after mount.
  const [t, setT] = useState('');
  useEffect(() => {
    const id = requestAnimationFrame(() => setT(String(Date.now())));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <>
      {/* sr-only (1×1 px, clipped) rather than an off-screen offset, so it can never widen the page.
          Meaningless name/label + autocomplete="off" + the password-manager ignore attributes: browser
          autofill must never touch it (a filled honeypot = the post is dropped as a bot). */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor={`${HONEYPOT_FIELD}-hp`}>اتركه فارغًا</label>
        <input id={`${HONEYPOT_FIELD}-hp`} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other" defaultValue="" />
      </div>
      <input type="hidden" name={TIMESTAMP_FIELD} value={t} readOnly />
    </>
  );
}

export function SubmitButton({ pending, children, className }: { pending: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cx('tap inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-5 font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-progress disabled:opacity-70', className)}
    >
      {pending ? (
        <>
          <Loader2 size={18} aria-hidden="true" className="animate-spin" />
          جارٍ الإرسال…
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Progress + outcome of a submission. While pending: an indeterminate bar across the form and a
 * live "sending" line (the inputs are locked by the surrounding <fieldset disabled>). When a result
 * arrives (`at` changes): the message is scrolled into view and focused, so a rate-limit or
 * validation refusal can never go unnoticed below the fold.
 */
export function Progress({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-primary-tint" aria-hidden="true">
        <div className="h-full w-1/3 animate-[progress_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <p className="type-small flex items-center gap-2 text-text-2">
        <Loader2 size={16} aria-hidden="true" className="animate-spin text-primary" />
        جارٍ إرسال النموذج… لا تغلق الصفحة.
      </p>
    </div>
  );
}

/** Form-level error box that scrolls into view and takes focus whenever a new result arrives. */
export function FormError({ message, at }: { message?: string; at?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!message || !ref.current) return;
    ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ref.current.focus({ preventScroll: true });
  }, [message, at]);
  if (!message) return null;
  return (
    <p ref={ref} tabIndex={-1} role="alert" className="rounded-control border-2 border-up/50 bg-up-bg p-3 font-medium text-ink outline-none">
      {message}
    </p>
  );
}

/** Success box (replaces the form) that scrolls into view and takes focus. */
export function FormSuccess({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <p ref={ref} tabIndex={-1} role="status" className="rounded-card border-2 border-down/40 bg-down-bg p-4 font-medium text-ink outline-none">
      ✓ {message}
    </p>
  );
}

export function Counter({ length, max, min }: { length: number; max: number; min?: number }) {
  const low = min !== undefined && length > 0 && length < min;
  return (
    <span className={cx('type-small tabular-nums', length > max || low ? 'text-up' : 'text-muted')} dir="ltr" aria-live="polite">
      {length}/{max}
    </span>
  );
}
