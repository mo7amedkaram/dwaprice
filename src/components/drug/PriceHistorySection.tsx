import { PriceHistoryChart } from '../PriceHistoryChart';
import { Badge, Price, SectionTitle } from '../ui';
import { formatDate, formatPercent, isoDate } from '@/lib/format';
import { orderedHistory, priceChanges, type HistoryPoint } from '@/lib/drug/logic';

/** Chart + table of past changes; renders nothing unless the price changed at least once. */
export function PriceHistorySection({ points }: { points: HistoryPoint[] }) {
  const changes = priceChanges(points);
  if (changes.length === 0) return null;
  const ordered = orderedHistory(points);
  return (
    <section aria-labelledby="history">
      <SectionTitle id="history">تاريخ السعر</SectionTitle>
      <PriceHistoryChart title="تغيّر السعر الرسمي" points={ordered.map((p) => ({ price: p.price, date: p.effective_date }))} />
      <div className="mt-3 overflow-hidden rounded-card border border-border">
        <table className="w-full text-start">
          <caption className="sr-only">تغييرات السعر السابقة</caption>
          <thead className="type-small bg-surface text-text-2">
            <tr>
              <th scope="col" className="px-4 py-2 text-start font-medium">التاريخ</th>
              <th scope="col" className="px-4 py-2 text-start font-medium">من</th>
              <th scope="col" className="px-4 py-2 text-start font-medium">إلى</th>
              <th scope="col" className="px-4 py-2 text-start font-medium">التغيير</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c, i) => (
              <tr key={i} className="border-t border-border">
                <td className="type-small px-4 py-2 text-text-2">
                  {c.date ? <time dateTime={isoDate(c.date) ?? undefined}>{formatDate(c.date)}</time> : 'غير مؤرخ'}
                </td>
                <td className="px-4 py-2">
                  <Price value={c.previous} className="text-text-2" />
                </td>
                <td className="px-4 py-2">
                  <Price value={c.current} className="font-medium text-ink" />
                </td>
                <td className="px-4 py-2">
                  <Badge tone={c.pct > 0 ? 'up' : 'down'}>
                    {c.pct > 0 ? 'زيادة' : 'انخفاض'}{' '}
                    <span dir="ltr" className="price">
                      {formatPercent(c.pct)}
                    </span>
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
