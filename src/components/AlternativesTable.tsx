import Link from 'next/link';
import { Badge, Ltr, Price, cx } from './ui';
import { describeDiff, type AlternativeRowOut } from '@/lib/drug/logic';
import { routes } from '@/lib/site';
import { tradeName } from '@/lib/format';

function DiffBadge({ row }: { row: AlternativeRowOut }) {
  const diff = describeDiff(row.diffAbs, row.diffPct);
  if (diff.tone === 'same') return <span className="type-small text-text-2">{row.price === null ? '—' : 'نفس السعر'}</span>;
  return (
    <Badge tone={diff.tone === 'down' ? 'down' : 'up'}>
      {diff.tone === 'down' ? 'أرخص' : 'أغلى'} <Price value={Math.abs(row.diffAbs!)} />{' '}
      <span dir="ltr" className="price">
        ({diff.pct})
      </span>
    </Badge>
  );
}

function NameCell({ row, details, substitute = false }: { row: AlternativeRowOut; details: boolean; substitute?: boolean }) {
  const strength = row.strength?.split('(')[0].trim();
  return (
    <>
      <Link prefetch={false} href={routes.drug(row.slug)} className="inline-block py-2 font-semibold text-ink hover:text-primary hover:underline">
        {row.nameAr ?? tradeName(row.nameEn)}
      </Link>
      {row.nameAr && (
        <Ltr block className="type-small text-text-2">
          {tradeName(row.nameEn)}
        </Ltr>
      )}
      {details && (row.company || row.form || strength) && (
        <span className="type-small mt-0.5 block text-muted">
          {[row.company && <Ltr key="c">{row.company}</Ltr>, row.form, strength && <Ltr key="s">{strength}</Ltr>]
            .filter(Boolean)
            .map((part, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {part}
              </span>
            ))}
        </span>
      )}
      {/* البدائل are a different ingredient, so "cheapest" / "different form" / "same drug" badges don't apply. */}
      {(substitute ? row.unavailable : row.cheapest || row.unavailable || row.sibling || !row.sameForm) && (
        <span className="mt-1 flex flex-wrap gap-1">
          {!substitute && row.cheapest && <Badge tone="down">الأرخص</Badge>}
          {!substitute && row.sibling && <Badge tone="neutral">عبوة أخرى من نفس الدواء</Badge>}
          {!substitute && !row.sameForm && <Badge tone="neutral">شكل مختلف</Badge>}
          {row.unavailable && <Badge tone="rx">غير متوفر</Badge>}
        </span>
      )}
    </>
  );
}

/**
 * Alternatives from groupAlternatives() (sorted by price; cheapest flagged).
 * - `full`: name, company, form, strength, price, unit price, difference (EGP and %);
 *   a table from lg up (it needs the full content width), one card per row below.
 * - `compact`: name (+ company · form · strength), price (+ unit price), difference —
 *   for the drug page next to the price card; a table from md up.
 * Table semantics are kept in card mode through explicit ARIA roles.
 */
export function AlternativesTable({
  rows,
  caption,
  variant = 'full',
  showDiff = true,
  substitute = false,
}: {
  rows: AlternativeRowOut[];
  caption: string;
  variant?: 'full' | 'compact';
  showDiff?: boolean;
  /** البدائل: a different active ingredient — hide the savings badge and the cheapest/form/sibling badges. */
  substitute?: boolean;
}) {
  const full = variant === 'full';
  // Breakpoint where the card layout becomes a table.
  const bp = full
    ? { row: 'lg:table-row lg:py-0', cell: 'lg:table-cell lg:py-3 lg:align-middle', head: 'lg:table-header-group', hide: 'lg:hidden', end: 'lg:text-end' }
    : { row: 'md:table-row md:py-0', cell: 'md:table-cell md:py-3 md:align-middle', head: 'md:table-header-group', hide: 'md:hidden', end: 'md:text-end' };
  const cell = cx('flex items-center justify-between gap-3 px-4 py-1', bp.cell);
  const label = cx('type-small text-text-2', bp.hide);
  const head = 'px-4 py-3 text-start font-medium';

  return (
    <div className="overflow-hidden rounded-card border border-border">
      <table role="table" className="w-full border-collapse text-start">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className={cx('hidden bg-surface', bp.head)}>
          <tr role="row" className="type-small text-text-2">
            <th role="columnheader" scope="col" className={head}>الدواء</th>
            {full && (
              <>
                <th role="columnheader" scope="col" className={head}>الشركة</th>
                <th role="columnheader" scope="col" className={head}>الشكل</th>
                <th role="columnheader" scope="col" className={head}>التركيز</th>
              </>
            )}
            <th role="columnheader" scope="col" className={cx(head, 'text-end')}>السعر</th>
            {full && <th role="columnheader" scope="col" className={cx(head, 'text-end')}>سعر الوحدة</th>}
            {showDiff && <th role="columnheader" scope="col" className={cx(head, 'text-end')}>الفرق عن الأصلي</th>}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((r) => (
            <tr role="row" key={r.slug} className={cx('block border-t border-border py-2 first:border-t-0', bp.row, r.cheapest && 'bg-down-bg/60')}>
              <td role="cell" className={cx('block px-4 py-1', bp.cell)}>
                <NameCell row={r} details={!full} substitute={substitute} />
              </td>
              {full && (
                <>
                  <td role="cell" className={cell}>
                    <span className={label}>الشركة</span>
                    <span className="type-small text-ink">{r.company && <Ltr>{r.company}</Ltr>}</span>
                  </td>
                  <td role="cell" className={cell}>
                    <span className={label}>الشكل</span>
                    <span className="type-small text-ink">{r.form}</span>
                  </td>
                  <td role="cell" className={cell}>
                    <span className={label}>التركيز</span>
                    <span className="type-small text-ink">{r.strength && <Ltr>{r.strength.split('(')[0].trim()}</Ltr>}</span>
                  </td>
                </>
              )}
              <td role="cell" className={cx(cell, bp.end)}>
                <span className={label}>السعر</span>
                <span>
                  <Price value={r.price} className={cx('font-semibold', r.cheapest ? 'text-down' : 'text-ink')} />
                  {!full && r.unitPrice !== null && (
                    <span className="type-small block text-text-2">
                      <Price value={r.unitPrice} /> للوحدة
                    </span>
                  )}
                </span>
              </td>
              {full && (
                <td role="cell" className={cx(cell, bp.end)}>
                  <span className={label}>سعر الوحدة</span>
                  <Price value={r.unitPrice} className="type-small text-text-2" />
                </td>
              )}
              {showDiff && (
                <td role="cell" className={cx(cell, bp.end)}>
                  <span className={label}>الفرق عن الأصلي</span>
                  <DiffBadge row={r} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
