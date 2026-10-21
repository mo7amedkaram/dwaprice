// Step chart of official price changes without a chart library: the line is an
// SVG stretched to the box (non-scaling stroke), points and labels are HTML
// positioned in percent, so text keeps its real size at every width.
// Accessible: a text summary and the full data as a (visually hidden) table.
import { CURRENCY_AR, formatAmount, formatDate, isoDate } from '@/lib/format';
import { cx } from './ui';

export interface PricePointInput {
  price: number;
  /** null = undated older price from the catalogue */
  date: string | null;
}

// Plot area inside the box, in percent (room for labels above and the date row below).
const X0 = 6;
const X1 = 94;
const Y0 = 18;
const Y1 = 82;

export function PriceHistoryChart({ points, title = 'تاريخ السعر', className }: { points: PricePointInput[]; title?: string; className?: string }) {
  // Undated entries are older prices: keep them first, in the given order.
  const series = [...points.filter((p) => !p.date), ...points.filter((p) => p.date).sort((a, b) => a.date!.localeCompare(b.date!))];
  if (series.length < 2) return null;

  const prices = series.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const x = (i: number) => X0 + (i * (X1 - X0)) / (series.length - 1);
  const y = (v: number) => (max === min ? (Y0 + Y1) / 2 : Y0 + (1 - (v - min) / span) * (Y1 - Y0));

  // a price holds until the next change: horizontal, then vertical
  let d = `M ${x(0)} ${y(series[0].price)}`;
  for (let i = 1; i < series.length; i++) d += ` H ${x(i)} V ${y(series[i].price)}`;

  const first = series[0];
  const last = series[series.length - 1];
  const summary = `${title}: من ${formatAmount(first.price)} إلى ${formatAmount(last.price)} ${CURRENCY_AR}، ${series.length} أسعار مسجلة`;
  const anchor = (i: number) => (i === 0 ? 'translate-x-0' : i === series.length - 1 ? '-translate-x-full' : '-translate-x-1/2');

  return (
    <figure className={cx('rounded-card border border-border bg-bg p-4', className)}>
      <figcaption className="type-small mb-2 font-medium text-text-2">{title}</figcaption>
      <p className="sr-only">{summary}</p>

      {/* Time runs left to right even on RTL pages. */}
      <div dir="ltr" aria-hidden="true" className="relative h-40 md:h-48">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <line x1={X0} x2={X1} y1={Y1 + 4} y2={Y1 + 4} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={d} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {series.map((p, i) => (
          <div key={i}>
            <span
              className={cx(
                'absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary',
                i === series.length - 1 ? 'bg-primary' : 'bg-bg',
              )}
              style={{ left: `${x(i)}%`, top: `${y(p.price)}%` }}
            />
            <span
              className={cx('type-small price absolute -translate-y-full pb-1.5 font-medium text-ink', anchor(i))}
              style={{ left: `${x(i)}%`, top: `${y(p.price)}%` }}
            >
              {formatAmount(p.price)}
            </span>
            <span className={cx('type-small price absolute bottom-0 text-text-2', anchor(i))} style={{ left: `${x(i)}%` }}>
              {p.date ? p.date.slice(0, 7) : 'سابقًا'}
            </span>
          </div>
        ))}
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">التاريخ</th>
            <th scope="col">السعر ({CURRENCY_AR})</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p, i) => (
            <tr key={i}>
              <td>{p.date ? <time dateTime={isoDate(p.date) ?? undefined}>{formatDate(p.date)}</time> : 'سعر سابق بدون تاريخ'}</td>
              <td>{formatAmount(p.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
