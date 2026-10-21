import Link from 'next/link';
import { Badge, Ltr, Price, cx } from '../ui';
import { ArrowDownIcon, ArrowUpIcon } from '../icons';
import { formatDate, formatPercent, isoDate, toNumber, tradeName } from '@/lib/format';
import { strengthLabel } from '@/lib/listing/logic';
import { routes } from '@/lib/site';
import type { LatestChange } from '@/lib/data/types';

/**
 * Latest price changes: drug, old price, new price, change (EGP), %, date.
 * A table from md up; one card per row below (table roles kept for AT).
 * `compact` (home page) folds the percentage into the change column.
 */
export function PriceChangesTable({ rows, caption, compact = false }: { rows: LatestChange[]; caption: string; compact?: boolean }) {
  const cell = 'flex items-center justify-between gap-3 px-4 py-1 md:table-cell md:py-3 md:align-middle md:text-end';
  const label = 'type-small text-text-2 md:hidden';
  const head = 'px-4 py-3 font-medium';
  return (
    <div className="overflow-hidden rounded-card border border-border">
      <table role="table" className="w-full border-collapse text-start">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="hidden bg-surface md:table-header-group">
          <tr role="row" className="type-small text-text-2">
            <th role="columnheader" scope="col" className={cx(head, 'text-start')}>
              الدواء
            </th>
            <th role="columnheader" scope="col" className={cx(head, 'text-end')}>
              السعر القديم
            </th>
            <th role="columnheader" scope="col" className={cx(head, 'text-end')}>
              السعر الجديد
            </th>
            <th role="columnheader" scope="col" className={cx(head, 'text-end')}>
              التغيير
            </th>
            {!compact && (
              <th role="columnheader" scope="col" className={cx(head, 'text-end')}>
                النسبة
              </th>
            )}
            <th role="columnheader" scope="col" className={cx(head, 'text-end')}>
              التاريخ
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((r) => {
            const up = r.is_increase;
            const pct = toNumber(r.change_pct);
            const strength = strengthLabel(r.strength);
            return (
              <tr role="row" key={r.slug} className="block border-t border-border py-2 first:border-t-0 md:table-row md:py-0">
                <td role="cell" className="block px-4 py-1 md:table-cell md:py-3 md:align-middle">
                  <Link prefetch={false} href={routes.drug(r.slug)} className="inline-block py-1 font-semibold text-ink hover:text-primary hover:underline">
                    {r.name_ar ?? tradeName(r.name_en)}
                  </Link>
                  {(r.name_ar || strength) && (
                    <span className="type-small block text-text-2">
                      {r.name_ar && <Ltr>{tradeName(r.name_en)}</Ltr>}
                      {r.name_ar && strength && ' • '}
                      {strength}
                    </span>
                  )}
                </td>
                <td role="cell" className={cell}>
                  <span className={label}>السعر القديم</span>
                  <Price value={r.previous_price} className="text-text-2 line-through decoration-muted" />
                </td>
                <td role="cell" className={cell}>
                  <span className={label}>السعر الجديد</span>
                  <Price value={r.new_price} className="font-semibold text-ink" />
                </td>
                <td role="cell" className={cell}>
                  <span className={label}>التغيير</span>
                  <Badge tone={up ? 'up' : 'down'} icon={up ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}>
                    <span className="sr-only">{up ? 'زيادة' : 'انخفاض'} </span>
                    <Price value={Math.abs(toNumber(r.change_abs) ?? 0)} />
                    {compact && pct !== null && (
                      <span dir="ltr" className="price">
                        ({formatPercent(pct)})
                      </span>
                    )}
                  </Badge>
                </td>
                {!compact && (
                  <td role="cell" className={cell}>
                    <span className={label}>النسبة</span>
                    <span dir="ltr" className={cx('price font-medium', up ? 'text-up' : 'text-down')}>
                      {pct === null ? '—' : `${up ? '+' : '−'}${formatPercent(pct)}`}
                    </span>
                  </td>
                )}
                <td role="cell" className={cell}>
                  <span className={label}>التاريخ</span>
                  <time dateTime={isoDate(r.effective_date) ?? undefined} className="type-small text-text-2">
                    {formatDate(r.effective_date)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
