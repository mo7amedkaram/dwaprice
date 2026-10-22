import Link from 'next/link';
import { AdminPage, Card, Stat } from '@/components/admin/parts';
import { getDashboard } from '@/lib/settings/dashboard';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/site';

const num = (n: number) => new Intl.NumberFormat('en-US').format(n);

export default async function AdminDashboard() {
  const d = await getDashboard();
  return (
    <AdminPage title="لوحة التحكم" lead="نظرة سريعة على حالة الموقع وبياناته.">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="حالة الخادم" value={d.dbOk ? 'يعمل' : 'تعذّر' } tone={d.dbOk ? 'good' : 'bad'} hint={d.commit ? `نسخة ${d.commit.slice(0, 7)}` : 'نسخة غير معروفة'} />
        <Stat label="آخر تحديث للأسعار" value={d.stats?.last_price_date ? formatDate(d.stats.last_price_date) : '—'} />
        <Stat label="آخر مزامنة" value={d.stats?.last_sync_at ? formatDate(d.stats.last_sync_at) : '—'} />
        <Stat label="تغييرات الأسعار هذا الأسبوع" value={d.changesThisWeek ?? '—'} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="أدوية قابلة للفهرسة" value={d.stats ? num(d.stats.indexable_drugs) : '—'} />
        <Stat label="إجمالي الأدوية" value={d.stats ? num(d.stats.all_drugs) : '—'} />
        <Stat label="فهرس البحث" value={d.index ? `${num(d.index.drugs)} دواء` : '—'} hint={d.index ? `${d.index.brotliKb} ك.ب (brotli)${d.index.generatedAt ? ` · بُني ${formatDate(d.index.generatedAt)}` : ''}` : undefined} />
        <Stat label="واجهة الـ API" value={d.api ? `${d.api.activeClients} عميل` : '—'} hint={d.api ? `${d.api.activeKeys} مفتاح فعّال` : undefined} />
      </div>

      <Card title="الأكثر زيارة" description="أكثر الأدوية زيارةً (إجمالي تراكمي من عدّادات قاعدة بياناتنا، وليس من جوجل). لا يتوفّر عدّاد أسبوعي أو عدّاد «الأكثر بحثًا» بعد.">
        {d.topVisited.length === 0 ? (
          <p className="text-text-2">لا توجد بيانات زيارات بعد.</p>
        ) : (
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {d.topVisited.map((t, i) => (
              <li key={t.slug} className="flex items-center gap-2 border-b border-border/60 py-1.5">
                <span className="type-small w-6 shrink-0 text-muted tabular-nums">{i + 1}</span>
                <Link href={routes.drug(t.slug)} prefetch={false} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-primary">
                  {t.name_ar ?? t.name_en}
                </Link>
                <span className="type-small shrink-0 text-text-2 tabular-nums">{num(t.visit_count)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </AdminPage>
  );
}
