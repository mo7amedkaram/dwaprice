import Link from 'next/link';
import { buttonClass, cx } from '../ui';
import { FORM_LABELS } from '@/lib/listing/logic';
import type { ListFilters } from '@/lib/data/types';

const field =
  'min-h-11 w-full rounded-control border border-border bg-bg px-3 text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-tint';
const label = 'type-small mb-1 block font-medium text-text-2';

/**
 * Server-rendered GET form (works without JavaScript). Filtered URLs are
 * noindex,follow with a canonical to the clean list; the page redirects away
 * empty parameters, so submitting the defaults lands on the clean URL.
 */
export function FilterForm({
  action,
  filters,
  forms,
  showRx = true,
  className,
}: {
  action: string;
  filters: ListFilters;
  forms: Array<{ form_class: string | null; n: number }>;
  showRx?: boolean;
  className?: string;
}) {
  const active = filters.form !== null || filters.rx !== null || filters.min !== null || filters.max !== null || filters.sort !== 'name';
  return (
    <form method="get" action={action} aria-label="تصفية القائمة" className={cx('rounded-card border border-border bg-surface p-4', className)}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="f-form" className={label}>
            الشكل الدوائي
          </label>
          <select id="f-form" name="form" defaultValue={filters.form ?? ''} className={field}>
            <option value="">كل الأشكال</option>
            {forms.map((f) => (
              <option key={f.form_class ?? 'other'} value={f.form_class ?? 'other'}>
                {`${f.form_class ? (FORM_LABELS[f.form_class] ?? f.form_class) : 'أشكال أخرى'} (${f.n})`}
              </option>
            ))}
          </select>
        </div>
        {showRx && (
          <div className="col-span-2 lg:col-span-1">
            <label htmlFor="f-rx" className={label}>
              الوصفة الطبية
            </label>
            <select id="f-rx" name="rx" defaultValue={filters.rx ?? ''} className={field}>
              <option value="">الكل</option>
              <option value="rx">بوصفة طبية</option>
              <option value="otc">بدون وصفة</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-min" className={label}>
            السعر من (ج.م)
          </label>
          <input id="f-min" name="min" type="number" inputMode="decimal" min={0} step="any" defaultValue={filters.min ?? ''} dir="ltr" className={cx(field, 'price')} />
        </div>
        <div>
          <label htmlFor="f-max" className={label}>
            إلى (ج.م)
          </label>
          <input id="f-max" name="max" type="number" inputMode="decimal" min={0} step="any" defaultValue={filters.max ?? ''} dir="ltr" className={cx(field, 'price')} />
        </div>
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="f-sort" className={label}>
            الترتيب
          </label>
          <select id="f-sort" name="sort" defaultValue={filters.sort} className={field}>
            <option value="name">الاسم</option>
            <option value="price-asc">الأرخص أولاً</option>
            <option value="price-desc">الأغلى أولاً</option>
          </select>
        </div>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <button type="submit" className={buttonClass('primary', 'flex-1 lg:flex-none')}>
            تطبيق
          </button>
          {active && (
            <Link prefetch={false} href={action} className={buttonClass('ghost')}>
              مسح
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
