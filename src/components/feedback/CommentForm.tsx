'use client';

// The comment form under a drug page. Live length validation, server validation shown inline, and
// the "received, will appear after review" message in place of the form once accepted.
import { useActionState, useState } from 'react';
import { BotFields, Counter, Field, FormError, FormSuccess, Progress, SubmitButton, describedBy, inputClass } from './fields';
import { submitCommentAction } from '@/lib/feedback/actions';
import { COMMENT_LIMITS, COMMENT_NOTE, type FeedbackFormState } from '@/lib/feedback/logic';

export function CommentForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState<FeedbackFormState, FormData>(submitCommentAction, {});
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const errors = state.fieldErrors ?? {};

  if (state.ok) return <FormSuccess message={state.message ?? 'تم استلام تعليقك وسيظهر بعد المراجعة.'} />;

  return (
    <form action={formAction} className="relative rounded-card border border-border bg-bg p-4 md:p-5" aria-describedby="comment-note" aria-busy={pending} noValidate>
      <input type="hidden" name="slug" value={slug} />
      <BotFields />
      <fieldset disabled={pending} className="min-w-0 space-y-4 disabled:opacity-70">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="c-name" label="الاسم" error={errors.name} counter={<Counter length={name.length} max={COMMENT_LIMITS.name} />}>
          <input
            id="c-name"
            name="name"
            required
            maxLength={COMMENT_LIMITS.name + 20}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={describedBy('c-name', false, !!errors.name)}
            className={inputClass}
          />
        </Field>
        <Field id="c-email" label="البريد الإلكتروني" optional help="لا يُنشر أبدًا؛ للتواصل فقط إن لزم." error={errors.email}>
          <input
            id="c-email"
            name="email"
            type="email"
            inputMode="email"
            dir="ltr"
            autoComplete="email"
            maxLength={COMMENT_LIMITS.email}
            aria-invalid={!!errors.email}
            aria-describedby={describedBy('c-email', true, !!errors.email)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field id="c-body" label="التعليق" error={errors.body} counter={<Counter length={body.length} max={COMMENT_LIMITS.bodyMax} min={COMMENT_LIMITS.bodyMin} />} help={`من ${COMMENT_LIMITS.bodyMin} إلى ${COMMENT_LIMITS.bodyMax} حرف. بدون روابط.`}>
        <textarea
          id="c-body"
          name="body"
          required
          rows={4}
          maxLength={COMMENT_LIMITS.bodyMax + 50}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={!!errors.body}
          aria-describedby={describedBy('c-body', true, !!errors.body)}
          className={inputClass + ' resize-y'}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-ink">
        <input type="checkbox" name="is_pharmacist" className="size-5 accent-primary" />
        <span>أنا صيدلي</span>
      </label>
      </fieldset>
      <div className="mt-4 space-y-3">
        <Progress pending={pending} />
        <FormError message={state.error} at={state.at} />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>أرسل التعليق</SubmitButton>
          <p id="comment-note" className="type-small text-text-2">
            {COMMENT_NOTE}
          </p>
        </div>
      </div>
    </form>
  );
}
