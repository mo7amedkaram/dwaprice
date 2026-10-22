'use client';

// SEO defaults form: home title + meta description + title suffix + default OG text, each with a
// live character counter against Google's limits, and a Google-style search-result preview that
// updates as you type. Server validation and save come from saveSeoAction via <SettingsForm>.
import { useState } from 'react';
import { SettingsForm, useFieldError } from './SettingsForm';
import { Field, fieldInput } from './parts';
import { SEO_LIMITS, type SeoSettings } from '@/lib/settings/config';
import { saveSeoAction } from '@/lib/settings/actions';
import { SITE } from '@/lib/site';

function Counter({ n, max }: { n: number; max: number }) {
  const over = n > max;
  return (
    <span className={'type-small tabular-nums ' + (over ? 'text-up' : n > max * 0.9 ? 'text-rx' : 'text-muted')}>
      {n}/{max}
    </span>
  );
}

function CountedField({ name, label, help, max, value, onChange, textarea }: { name: string; label: string; help?: string; max: number; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  const serverError = useFieldError(name);
  const over = value.length > max;
  return (
    <Field label={label} htmlFor={`seo-${name}`} help={help} error={serverError ?? (over ? `أطول من ${max} حرفًا.` : undefined)} counter={<Counter n={value.length} max={max} />}>
      {textarea ? (
        <textarea id={`seo-${name}`} name={name} value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={fieldInput} aria-invalid={over} />
      ) : (
        <input id={`seo-${name}`} name={name} value={value} onChange={(e) => onChange(e.target.value)} className={fieldInput} aria-invalid={over} />
      )}
    </Field>
  );
}

export function SeoForm({ initial }: { initial: SeoSettings }) {
  const [title, setTitle] = useState(initial.homeTitle);
  const [description, setDescription] = useState(initial.homeDescription);
  const [suffix, setSuffix] = useState(initial.titleSuffix);
  const [ogText, setOgText] = useState(initial.ogText);

  return (
    <SettingsForm action={saveSeoAction}>
      <CountedField name="homeTitle" label="عنوان الصفحة الرئيسية" help="يظهر في تبويب المتصفح ونتيجة البحث. يُفضّل ألا يزيد عن 60 حرفًا." max={SEO_LIMITS.homeTitle} value={title} onChange={setTitle} />
      <CountedField name="homeDescription" label="وصف الصفحة الرئيسية (meta description)" help="ملخص قصير يظهر تحت العنوان في نتائج البحث." max={SEO_LIMITS.homeDescription} value={description} onChange={setDescription} textarea />
      <CountedField name="titleSuffix" label="لاحقة عناوين الصفحات الداخلية" help="تُضاف بعد عنوان كل صفحة، مثل « | دليل الأدوية المصري»." max={SEO_LIMITS.titleSuffix} value={suffix} onChange={setSuffix} />
      <CountedField name="ogText" label="نص المشاركة الاجتماعية الافتراضي (Open Graph)" help="يظهر عند مشاركة رابط الموقع على فيسبوك وتويتر وواتساب." max={SEO_LIMITS.ogText} value={ogText} onChange={setOgText} textarea />

      <div className="mt-2 rounded-card border border-border bg-surface p-4">
        <p className="type-small mb-2 font-medium text-text-2">معاينة نتيجة بحث جوجل</p>
        <div dir="ltr" className="text-start">
          <div className="truncate text-xs text-[#4d5156] dark:text-text-2">{SITE.url.replace(/^https?:\/\//, '')} › </div>
          <div className="truncate text-lg text-[#1a0dab] dark:text-primary">{title || 'عنوان الصفحة'}</div>
          <div className="type-small line-clamp-2 text-[#4d5156] dark:text-text-2">{description || 'وصف الصفحة سيظهر هنا.'}</div>
        </div>
      </div>
    </SettingsForm>
  );
}
