import { AdminPage, Card } from '@/components/admin/parts';
import { recentAudit } from '@/lib/settings/write';
import { formatDate } from '@/lib/format';

const GROUP_LABEL: Record<string, string> = {
  seo: 'تحسين الظهور',
  analytics: 'Google Analytics',
  verification: 'رموز التحقق',
  contact: 'التواصل والروابط',
  assets: 'الأصول (الأيقونة/الصور)',
};

function Changes({ oldValue, newValue }: { oldValue: unknown; newValue: unknown }) {
  const o = (oldValue ?? {}) as Record<string, unknown>;
  const n = (newValue ?? {}) as Record<string, unknown>;
  const show = (v: unknown) => (v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (newValue === null) return <span className="text-text-2">حُذف</span>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  if (keys.length === 0) return <span className="text-text-2">—</span>;
  return (
    <ul className="space-y-1">
      {keys.map((k) => (
        <li key={k} className="type-small" dir="ltr">
          <span className="font-medium text-ink">{k}: </span>
          <span className="text-up line-through">{show(o[k])}</span> <span aria-hidden>→</span> <span className="text-down">{show(n[k])}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AuditPage() {
  const rows = await recentAudit(200);
  return (
    <AdminPage title="سجل التغييرات" crumbs={[{ name: 'سجل التغييرات' }]} lead="كل تغيير في الإعدادات: ماذا تغيّر، بواسطة من، ومتى.">
      <Card>
        {rows.length === 0 ? (
          <p className="text-text-2">لا توجد تغييرات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <thead>
                <tr className="type-small border-b border-border text-text-2">
                  <th className="px-2 py-2 text-start font-medium">القسم</th>
                  <th className="px-2 py-2 text-start font-medium">التغيير</th>
                  <th className="px-2 py-2 text-start font-medium">بواسطة</th>
                  <th className="px-2 py-2 text-start font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top">
                    <td className="px-2 py-2 font-medium text-ink">{GROUP_LABEL[r.key] ?? r.key}</td>
                    <td className="px-2 py-2"><Changes oldValue={r.old_value} newValue={r.new_value} /></td>
                    <td className="px-2 py-2 text-text-2" dir="ltr">{r.changed_by ?? '—'}</td>
                    <td className="px-2 py-2 text-text-2 whitespace-nowrap">{formatDate(r.changed_at) ?? String(r.changed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminPage>
  );
}
