'use client';

// "في مشكلة في السعر أو البيانات؟ بلّغنا" under the price card. The link toggles an inline form in
// place (no navigation); the form itself is a fixed block that only appears below the trigger, so
// nothing above or beside it moves. page_url/referrer are filled on the client from the live
// document (a cached server render could not know them). Follow-up contact is never shown publicly.
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, MessageSquareWarning, Send } from 'lucide-react';
import { BotFields, Counter, Field, FormError, FormSuccess, Progress, SubmitButton, describedBy, inputClass } from './fields';
import { submitReportAction } from '@/lib/feedback/actions';
import { REPORT_LIMITS, REPORT_TYPES, REPORT_TYPE_LABEL, type FeedbackFormState, type ReportType } from '@/lib/feedback/logic';
import { cx } from '../ui';

export function ReportProblem({ slug, className }: { slug: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={cx('rounded-card border border-border bg-bg', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cx(
          'tap group flex w-full items-center gap-3 rounded-card p-3 text-start transition-colors',
          'hover:bg-primary-tint/40 focus-visible:outline-primary',
          open && 'rounded-b-none border-b border-border bg-primary-tint/30',
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-rx-bg text-rx transition-colors group-hover:bg-rx group-hover:text-white">
          <MessageSquareWarning size={20} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">في مشكلة في السعر أو البيانات؟</span>
          <span className="type-small block text-text-2">بلّغنا وهنراجعها ونصحّحها</span>
        </span>
        <ChevronDown size={20} aria-hidden="true" className={cx('shrink-0 text-muted transition-transform duration-200 group-hover:text-primary', open && 'rotate-180')} />
      </button>
      <div id={panelId} hidden={!open} className="p-3">
        {open && <ReportForm slug={slug} />}
      </div>
    </div>
  );
}

function ReportForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState<FeedbackFormState, FormData>(submitReportAction, {});
  const [type, setType] = useState<ReportType | ''>('');
  const [details, setDetails] = useState('');
  const pageUrl = useRef<HTMLInputElement>(null);
  const referrer = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pageUrl.current) pageUrl.current.value = window.location.href;
    if (referrer.current) referrer.current.value = document.referrer;
  }, []);
  const errors = state.fieldErrors ?? {};

  if (state.ok) return <FormSuccess message={state.message ?? 'شكراً، هنراجع البلاغ ونصحّحه لو لزم.'} />;

  return (
    <form action={formAction} className="relative space-y-3" aria-busy={pending} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input ref={pageUrl} type="hidden" name="page_url" defaultValue="" />
      <input ref={referrer} type="hidden" name="referrer" defaultValue="" />
      <BotFields />
      <fieldset disabled={pending} className="min-w-0 space-y-3 disabled:opacity-70">
      <Field id="r-type" label="نوع المشكلة" error={errors.type}>
        <select
          id="r-type"
          name="type"
          required
          value={type}
          onChange={(e) => setType(e.target.value as ReportType | '')}
          aria-invalid={!!errors.type}
          aria-describedby={describedBy('r-type', false, !!errors.type)}
          className={inputClass}
        >
          <option value="">اختر…</option>
          {REPORT_TYPES.map((t) => (
            <option key={t} value={t}>
              {REPORT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      {type === 'PRICE' && (
        <Field id="r-price" label="السعر الصحيح" optional help="بالجنيه، كما تراه في الصيدلية أو على العبوة." error={errors.suggestedPrice}>
          <input
            id="r-price"
            name="suggested_price"
            inputMode="decimal"
            dir="ltr"
            placeholder="0.00"
            aria-invalid={!!errors.suggestedPrice}
            aria-describedby={describedBy('r-price', true, !!errors.suggestedPrice)}
            className={inputClass}
          />
        </Field>
      )}
      <Field id="r-details" label="التفاصيل" error={errors.details} counter={<Counter length={details.length} max={REPORT_LIMITS.detailsMax} min={REPORT_LIMITS.detailsMin} />}>
        <textarea
          id="r-details"
          name="details"
          required
          rows={3}
          maxLength={REPORT_LIMITS.detailsMax + 50}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          aria-invalid={!!errors.details}
          aria-describedby={describedBy('r-details', false, !!errors.details)}
          className={inputClass + ' resize-y'}
        />
      </Field>
      <Field id="r-contact" label="بريد أو رقم واتساب للمتابعة" optional help="لا يُنشر أبدًا." error={errors.contact}>
        <input
          id="r-contact"
          name="contact"
          dir="ltr"
          autoComplete="off"
          maxLength={REPORT_LIMITS.contact}
          aria-invalid={!!errors.contact}
          aria-describedby={describedBy('r-contact', true, !!errors.contact)}
          className={inputClass}
        />
      </Field>
      </fieldset>
      <Progress pending={pending} />
      <FormError message={state.error} at={state.at} />
      <SubmitButton pending={pending} className="w-full sm:w-auto">
        <Send size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        أرسل البلاغ
      </SubmitButton>
    </form>
  );
}
