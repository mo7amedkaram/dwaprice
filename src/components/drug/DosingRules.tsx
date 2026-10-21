import { ShieldIcon } from '../icons';
import { Badge, Ltr } from '../ui';
import { formatAmount, formatDate } from '@/lib/format';
import type { DosingRule } from '@/lib/data/types';

const ageText = (min: number | null, max: number | null) => {
  if (min === null && max === null) return null;
  const y = (m: number) => (m % 12 === 0 ? `${m / 12} سنة` : `${m} شهر`);
  if (min !== null && max !== null) return `من ${y(min)} إلى ${y(max)}`;
  return min !== null ? `من ${y(min)}` : `حتى ${y(max!)}`;
};

const sourceLabel = (s: DosingRule['sources'][number]) => (typeof s === 'string' ? s : s.title ?? s.name ?? s.url ?? '');

/**
 * Dosing comes ONLY from reviewed, APPROVED rules (web.dosing_rules_public).
 * Every rule shows who reviewed it, their credentials, the review date and sources.
 */
export function DosingRules({ rules }: { rules: DosingRule[] }) {
  if (rules.length === 0) return null;
  return (
    <div className="space-y-4">
      {rules.map((r) => (
        <article key={r.id} className="rounded-card border border-border bg-surface p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">{r.indication}</h3>
            <Badge tone="down" icon={<ShieldIcon size={14} />}>
              مراجعة صيدلية معتمدة
            </Badge>
          </header>
          <dl className="type-small mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
            <div>
              <dt className="text-text-2">الفئة</dt>
              <dd className="text-ink">{r.population}</dd>
            </div>
            {ageText(r.min_age_months, r.max_age_months) && (
              <div>
                <dt className="text-text-2">العمر</dt>
                <dd className="text-ink">{ageText(r.min_age_months, r.max_age_months)}</dd>
              </div>
            )}
            {(r.min_weight_kg || r.max_weight_kg) && (
              <div>
                <dt className="text-text-2">الوزن</dt>
                <dd className="price text-ink">
                  {formatAmount(r.min_weight_kg) ?? '—'} – {formatAmount(r.max_weight_kg) ?? '—'} كجم
                </dd>
              </div>
            )}
            {(r.dose_min_mg || r.dose_max_mg) && (
              <div>
                <dt className="text-text-2">الجرعة</dt>
                <dd className="price text-ink">
                  {formatAmount(r.dose_min_mg) ?? '—'} – {formatAmount(r.dose_max_mg) ?? '—'} مجم
                </dd>
              </div>
            )}
            {r.max_daily_mg && (
              <div>
                <dt className="text-text-2">الحد الأقصى يوميًا</dt>
                <dd className="price text-ink">{formatAmount(r.max_daily_mg)} مجم</dd>
              </div>
            )}
            {r.routes.length > 0 && (
              <div>
                <dt className="text-text-2">طريقة الاستخدام</dt>
                <dd className="text-ink">
                  <Ltr>{r.routes.join(', ')}</Ltr>
                </dd>
              </div>
            )}
          </dl>
          {r.contraindications && <p className="type-small mt-3 text-rx">موانع: {r.contraindications}</p>}
          <footer className="type-small mt-3 border-t border-border pt-3 text-text-2">
            <p>
              راجعها: <span className="font-medium text-ink">{r.reviewer_name}</span>
              {r.reviewer_credentials && <>، {r.reviewer_credentials}</>} — بتاريخ{' '}
              <time dateTime={r.review_date}>{formatDate(r.review_date)}</time>
              {r.guideline_version && <> — الإرشاد: <Ltr>{r.guideline_version}</Ltr></>}
            </p>
            {r.sources.length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {r.sources.map((s, i) => {
                  const url = typeof s === 'string' ? null : s.url;
                  const label = sourceLabel(s);
                  return (
                    <li key={i}>
                      {url ? (
                        <a href={url} rel="nofollow noopener" target="_blank" className="text-primary hover:underline">
                          <Ltr>{label}</Ltr>
                        </a>
                      ) : (
                        <Ltr>{label}</Ltr>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </footer>
        </article>
      ))}
    </div>
  );
}
