import { DrugRow } from '../DrugRow';
import { Badge, cx } from '../ui';
import { rowDetail } from '@/lib/listing/logic';
import { marketingCompany } from '@/lib/drug/logic';
import type { HubDrug } from '@/lib/data/types';

/**
 * Drugs of a listing: one row per product, each a link to its drug page.
 * One column on phones, two from md up. `cheapest` marks one row.
 */
export function DrugList({
  rows,
  cheapest,
  showCompany = true,
  className,
  label,
}: {
  rows: HubDrug[];
  cheapest?: string | null;
  showCompany?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cx('grid grid-cols-1 gap-3 md:grid-cols-2', className)}>
      {rows.map((r) => (
        <li key={r.slug} className="min-w-0">
          <DrugRow
            slug={r.slug}
            nameAr={r.name_ar}
            nameEn={r.name_en}
            ingredient={showCompany ? marketingCompany(r.company) : null}
            detail={rowDetail(r)}
            price={r.current_price}
            badges={r.slug === cheapest ? <Badge tone="down">الأرخص</Badge> : null}
            className={r.slug === cheapest ? 'bg-down-bg/40' : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
