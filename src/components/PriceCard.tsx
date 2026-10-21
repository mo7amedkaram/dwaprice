import type { ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ClockIcon } from './icons';
import { Badge, Price, cx } from './ui';
import { formatDate, formatPercent, isoDate, priceChange, toNumber } from '@/lib/format';
import type { ListingStatus } from '@/lib/data/types';

const LISTING_LABEL: Record<Exclude<ListingStatus, null>, string> = {
  NOT_AVAILABLE: 'غير متوفر حاليًا',
  NOT_YET_AVAILABLE: 'لم يتوفر بعد',
  CANCELLED: 'تم إلغاؤه',
  ILLEGAL_IMPORT: 'استيراد غير رسمي',
};

export interface PriceCardProps {
  price: number | string | null;
  oldPrice?: number | string | null;
  /** Price per unit (tablet, ampoule…) and the unit word, e.g. "قرص". */
  unitPrice?: number | string | null;
  unitLabel?: string;
  units?: number | null;
  updated?: string | null;
  verified?: boolean;
  listingStatus?: ListingStatus;
  title?: string;
  footer?: ReactNode;
  className?: string;
}

/** Change badge: red for an increase, green for a decrease. */
export function PriceChangeBadge({ oldPrice, price }: { oldPrice: number | string | null | undefined; price: number | string | null | undefined }) {
  const change = priceChange(toNumber(oldPrice), toNumber(price));
  if (change === null) return null;
  const up = change > 0;
  return (
    <Badge tone={up ? 'up' : 'down'} icon={up ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}>
      <span className="sr-only">{up ? 'زيادة' : 'انخفاض'} </span>
      <span dir="ltr" className="price">
        {formatPercent(change)}
      </span>
    </Badge>
  );
}

export function PriceCard({
  price,
  oldPrice,
  unitPrice,
  unitLabel = 'الوحدة',
  units,
  updated,
  verified = true,
  listingStatus = null,
  title = 'السعر الحالي',
  footer,
  className,
}: PriceCardProps) {
  const hasOld = toNumber(oldPrice) !== null && toNumber(oldPrice) !== toNumber(price);
  return (
    <section aria-label={title} className={cx('rounded-card border border-border bg-bg p-4 md:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="type-small font-medium text-text-2">{title}</h2>
        <span className="flex flex-wrap gap-1">
          {verified && (
            <Badge tone="down" icon={<CheckIcon size={14} />}>
              سعر موثّق
            </Badge>
          )}
          {listingStatus && <Badge tone={listingStatus === 'NOT_AVAILABLE' || listingStatus === 'NOT_YET_AVAILABLE' ? 'rx' : 'up'}>{LISTING_LABEL[listingStatus]}</Badge>}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Price value={price} className="type-price text-ink" currencyClassName="type-small text-text-2" />
        <PriceChangeBadge oldPrice={oldPrice} price={price} />
      </div>

      {hasOld && (
        <p className="type-small mt-1 text-text-2">
          السعر السابق <Price value={oldPrice ?? null} className="text-muted line-through" />
        </p>
      )}

      <dl className="type-small mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
        {toNumber(unitPrice) !== null && (
          <div>
            <dt className="text-text-2">سعر {unitLabel}</dt>
            <dd className="font-medium text-ink">
              <Price value={unitPrice ?? null} />
            </dd>
          </div>
        )}
        {units ? (
          <div>
            <dt className="text-text-2">عدد الوحدات</dt>
            <dd className="price font-medium text-ink">{units}</dd>
          </div>
        ) : null}
        {updated && (
          <div className="col-span-2 flex items-center gap-1.5 text-text-2">
            <ClockIcon size={16} />
            <dt>آخر تحديث للسعر</dt>
            <dd>
              <time dateTime={isoDate(updated) ?? undefined} className="font-medium text-ink">
                {formatDate(updated)}
              </time>
            </dd>
          </div>
        )}
      </dl>
      {!verified && (
        <p className="type-small mt-3 rounded-control-sm bg-rx-bg px-3 py-2 text-rx">لم يتم تأكيد هذا السعر من مصدر رسمي بعد.</p>
      )}
      {footer && <div className="mt-4">{footer}</div>}
    </section>
  );
}
