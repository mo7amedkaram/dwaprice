'use client';
/* eslint-disable @next/next/no-img-element -- admin-only icon previews: object URLs / ICO, not page content; next/image would not help. */

// Favicon upload with a live preview of how the icon looks in a browser tab, on a phone home
// screen, and in a Google search-result row. Validation is repeated on the server (sharp); here we
// give fast feedback and the preview. A separate form resets to the built-in icon.
import { useRef, useState } from 'react';
import { SettingsForm, useFieldError } from './SettingsForm';
import { Field } from './parts';
import { UploadIcon } from './icons';
import { uploadFaviconAction, resetFaviconAction } from '@/lib/settings/actions';
import { SITE } from '@/lib/site';

const MIN = 512;

function TabPreview({ src, title }: { src: string; title: string }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-t-lg border border-border bg-surface px-3 py-2">
      <img src={src} alt="" width={16} height={16} className="size-4 rounded-sm" />
      <span className="type-small truncate text-ink">{title}</span>
    </div>
  );
}

function PhonePreview({ src }: { src: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <img src={src} alt="" width={56} height={56} className="size-14 rounded-[12px] shadow" />
      <span className="type-small text-text-2">دليل الأدوية</span>
    </div>
  );
}

function GooglePreview({ src }: { src: string }) {
  return (
    <div dir="ltr" className="flex items-center gap-2 text-start">
      <img src={src} alt="" width={28} height={28} className="size-7 rounded-full border border-border bg-bg p-0.5" />
      <div className="min-w-0">
        <div className="truncate text-sm text-ink">{SITE.name}</div>
        <div className="truncate text-xs text-text-2">{SITE.url.replace(/^https?:\/\//, '')}</div>
      </div>
    </div>
  );
}

export function BrandingForm({ hasCustom }: { hasCustom: boolean }) {
  // Cache-bust the current icon so a fresh upload shows immediately.
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const current = `/icon-192.png?v=${hasCustom ? 'custom' : 'builtin'}`;
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setLocalError('الصيغة يجب أن تكون PNG أو JPG فقط.');
      setPreview(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLocalError('حجم الملف أكبر من 2 ميجابايت.');
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.width !== img.height) setLocalError('الصورة يجب أن تكون مربعة.');
      else if (img.width < MIN) setLocalError(`الصورة يجب أن تكون ${MIN}×${MIN} بكسل على الأقل.`);
      else setLocalError(null);
      setPreview(url);
    };
    img.onerror = () => setLocalError('تعذّر قراءة الصورة.');
    img.src = url;
  }

  const shown = preview ?? current;

  return (
    <div className="space-y-6">
      <SettingsForm action={uploadFaviconAction} submitLabel="رفع الأيقونة وتوليد كل المقاسات">
        <FaviconField onPick={onPick} inputRef={inputRef} localError={localError} />
        <div className="mt-4 rounded-card border border-border bg-surface p-4">
          <p className="type-small mb-3 font-medium text-text-2">معاينة</p>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="type-small mb-1 text-muted">تبويب المتصفح</p>
              <TabPreview src={shown} title={SITE.name} />
            </div>
            <div>
              <p className="type-small mb-1 text-muted">شاشة الهاتف</p>
              <PhonePreview src={shown} />
            </div>
            <div>
              <p className="type-small mb-1 text-muted">نتيجة بحث جوجل</p>
              <GooglePreview src={shown} />
            </div>
          </div>
        </div>
      </SettingsForm>

      {hasCustom && (
        <form action={resetFaviconAction} className="border-t border-border pt-4">
          <p className="type-small mb-2 text-text-2">العودة إلى الأيقونة الافتراضية للموقع.</p>
          <button type="submit" className="tap rounded-control border border-border px-4 py-2 text-sm font-medium text-text-2 hover:bg-surface hover:text-ink">
            استعادة الأيقونة الافتراضية
          </button>
        </form>
      )}
    </div>
  );
}

function FaviconField({ onPick, inputRef, localError }: { onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; inputRef: React.RefObject<HTMLInputElement | null>; localError: string | null }) {
  const serverError = useFieldError('favicon');
  return (
    <Field label="أيقونة الموقع (favicon)" htmlFor="favicon" help="صورة مربعة PNG أو JPG، 512×512 بكسل على الأقل، بحد أقصى 2 ميجابايت. لا يُقبل SVG. سنولّد تلقائيًا كل المقاسات المطلوبة." error={localError ?? serverError}>
      <label htmlFor="favicon" className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-control border-2 border-dashed border-border bg-bg px-4 py-6 text-text-2 hover:border-primary hover:text-primary">
        <UploadIcon size={20} />
        <span>اختر صورة أو اسحبها هنا</span>
      </label>
      <input ref={inputRef} id="favicon" name="favicon" type="file" accept="image/png,image/jpeg" onChange={onPick} className="sr-only" />
    </Field>
  );
}
