import { AdminShell } from '@/components/api/AdminShell';
import { field } from '@/components/api/form-styles';
import { buttonClass } from '@/components/ui';
import { updatePlanAction } from '@/lib/api/admin-actions';
import { getAllPlans, requireAdminSession } from '@/lib/api/admin-data';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata = buildMetadata({ kind: 'internal', path: '/admin/api/plans', title: 'إدارة الـ API: الخطط', description: 'حدود الخطط وأسعارها.' });
export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  const session = await requireAdminSession();
  const plans = await getAllPlans();
  return (
    <AdminShell current="/admin/api/plans" title="الخطط" email={session.email}>
      <p className="mt-1 text-text-2">الحدود والأسعار تُقرأ من هنا في كل طلب وفي صفحة /api؛ التغيير يسري خلال دقيقة.</p>
      <ul className="mt-4 grid gap-4 lg:grid-cols-2">
        {plans.map((p) => {
          const f = p.features as Record<string, unknown>;
          return (
            <li key={p.id} className="rounded-card border border-border p-4">
              <h2 className="font-semibold text-ink">{p.name} <span className="type-small font-normal text-text-2">({p.id})</span></h2>
              <form action={updatePlanAction} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                <input type="hidden" name="plan_id" value={p.id} />
                <label className="type-small text-text-2">طلبات/دقيقة<input name="rpm" type="number" min={1} defaultValue={p.rpm} className={field} /></label>
                <label className="type-small text-text-2">حصة شهرية (فارغ = بلا حد)<input name="monthly_quota" type="number" min={0} defaultValue={p.monthly_quota ?? ''} className={field} /></label>
                <label className="type-small text-text-2">أقصى عدد مفاتيح<input name="max_keys" type="number" min={0} defaultValue={p.max_keys} className={field} /></label>
                <label className="type-small text-text-2">نافذة التغييرات (يوم)<input name="feed_window_days" type="number" min={1} defaultValue={p.feed_window_days} className={field} /></label>
                <label className="type-small text-text-2">السعر ج.م/شهر<input name="price_egp_monthly" type="number" min={0} step="1" defaultValue={p.price_egp_monthly ?? ''} className={field} /></label>
                <label className="type-small text-text-2">الدعم<input name="support" defaultValue={String(f.support ?? '')} dir="ltr" className={field} /></label>
                <div className="col-span-2 flex flex-wrap gap-4 md:col-span-3">
                  <label className="flex items-center gap-2 text-text-2"><input type="checkbox" name="is_public" defaultChecked={p.is_public} /> معروضة للجمهور</label>
                  <label className="flex items-center gap-2 text-text-2"><input type="checkbox" name="export" defaultChecked={f.export === true} /> تصدير كامل</label>
                  <label className="flex items-center gap-2 text-text-2"><input type="checkbox" name="webhooks" defaultChecked={f.webhooks === true} /> Webhooks</label>
                  <label className="flex items-center gap-2 text-text-2"><input type="checkbox" name="ip_allowlist" defaultChecked={f.ip_allowlist === true} /> قائمة IP</label>
                </div>
                <div className="col-span-2 md:col-span-3"><button type="submit" className={buttonClass('secondary')}>حفظ</button></div>
              </form>
            </li>
          );
        })}
      </ul>
    </AdminShell>
  );
}
