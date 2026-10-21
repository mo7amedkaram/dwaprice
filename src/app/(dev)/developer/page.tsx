import Link from 'next/link';
import { ApiNav } from '@/components/api/ApiNav';
import { StatsStrip, UsageChart } from '@/components/api/Blocks';
import { Code } from '@/components/api/CodeBlock';
import { KeyCreateForm, RevokeKeyForm, RotateKeyForm } from '@/components/api/Forms';
import { Badge, Container, Ltr, SectionTitle, buttonClass } from '@/components/ui';
import { createKeyAction, devLogoutAction, revokeKeyAction, rotateKeyAction } from '@/lib/api/dashboard-actions';
import { getClientOverview, requireClientSession } from '@/lib/api/dashboard-data';
import { getLang } from '@/lib/api/lang';
import { apiPublicBase } from '@/lib/api/public-base';
import { formatDate } from '@/lib/format';
import { buildMetadata } from '@/lib/seo/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const ar = (await getLang()) === 'ar';
  return buildMetadata({ kind: 'internal', path: '/developer', title: ar ? 'لوحة المطورين' : 'Developer dashboard', absoluteTitle: !ar, description: ar ? 'مفاتيح الـ API والاستخدام والخطة.' : 'API keys, usage and plan.' });
}

const n = (v: number | string | null | undefined) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

const T = {
  ar: {
    missing: 'الحساب غير موجود.', plan: 'خطة', active: 'نشط', suspended: 'موقوف', closed: 'مغلق', logout: 'تسجيل الخروج',
    month: 'طلبات هذا الشهر', noQuota: 'بلا حصة شهرية', rpm: 'الحد في الدقيقة', activeKeys: 'المفاتيح النشطة', window: 'نافذة التغييرات', day: 'يوم', paidUntil: 'الاشتراك حتى', quotaBar: 'استهلاك الحصة الشهرية',
    keys: 'مفاتيح الـ API', name: 'الاسم', key: 'المفتاح', scopes: 'الصلاحيات', status: 'الحالة', lastUsed: 'آخر استخدام', actions: 'إجراءات', noKeys: 'لا مفاتيح بعد. أنشئ أول مفتاح أدناه.', revoked: 'ملغى', expires: 'ينتهي', expired: 'منتهٍ',
    newKey: 'مفتاح جديد', maxKeys: 'وصلت إلى الحد الأقصى لخطتك', maxKeys2: 'ألغِ مفتاحًا أو ارفع الخطة.', rotateNote: 'التدوير ينشئ مفتاحًا جديدًا ويبقي القديم يعمل 24 ساعة. الإلغاء فوري.',
    usage: 'الاستخدام في آخر 30 يومًا', alerts: 'تنبيهات', start: 'ابدأ', docs: 'التوثيق الكامل', docsD: 'المصادقة، الترقيم، الأخطاء، الحدود، دليل المزامنة.', delta: 'دليل المزامنة الجزئية', deltaD: 'كيف تحدّث نظامك بما تغيّر فقط.',
    explorer: 'المستكشف التفاعلي', explorerD: 'جرّب الطلبات وانسخ الكود.', terms: 'شروط الترخيص', exportYes: 'التصدير الكامل متاح عبر POST /exports', exportNo: 'ترقية الخطة للتصدير الكامل', base: 'الرابط الأساسي', of: 'من',
  },
  en: {
    missing: 'Account not found.', plan: 'plan', active: 'active', suspended: 'suspended', closed: 'closed', logout: 'Log out',
    month: 'Requests this month', noQuota: 'no monthly quota', rpm: 'Per-minute limit', activeKeys: 'Active keys', window: 'Feed window', day: 'days', paidUntil: 'Subscription until', quotaBar: 'Monthly quota used',
    keys: 'API keys', name: 'Name', key: 'Key', scopes: 'Scopes', status: 'Status', lastUsed: 'Last used', actions: 'Actions', noKeys: 'No keys yet. Create your first key below.', revoked: 'revoked', expires: 'expires', expired: 'expired',
    newKey: 'New key', maxKeys: 'You reached your plan limit', maxKeys2: 'Revoke a key or upgrade the plan.', rotateNote: 'Rotation creates a new key and keeps the old one working for 24 hours. Revocation is immediate.',
    usage: 'Usage in the last 30 days', alerts: 'Alerts', start: 'Get started', docs: 'Full documentation', docsD: 'authentication, pagination, errors, limits, the sync guide.', delta: 'Delta-sync guide', deltaD: 'update your system with only what changed.',
    explorer: 'Interactive explorer', explorerD: 'try requests and copy the code.', terms: 'License terms', exportYes: 'full export is available via POST /exports', exportNo: 'upgrade the plan for the full export', base: 'Base URL', of: 'of',
  },
} as const;

export default async function DeveloperPage() {
  const [session, lang] = await Promise.all([requireClientSession(), getLang()]);
  const o = await getClientOverview(session.id);
  const t = T[lang];
  const ar = lang === 'ar';
  const base = ar ? '/api' : '/api/en';
  const date = (v: string | Date | null | undefined) => (ar ? formatDate(v) : v ? new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Africa/Cairo' }).format(new Date(v)) : '—');
  if (!o) {
    return (
      <Container className="py-10"><p className="text-text-2">{t.missing}</p></Container>
    );
  }
  const quota = o.plan.monthly_quota;
  const pct = quota ? Math.min(100, Math.round((o.monthRequests / quota) * 100)) : null;
  const activeKeys = o.keys.filter((k) => k.live).length;
  const f = o.plan.features as Record<string, unknown>;
  const statusLabel = o.client.status === 'active' ? t.active : o.client.status === 'suspended' ? t.suspended : t.closed;
  return (
    <>
      <ApiNav current="/developer" lang={lang} />
      <Container className="py-6 md:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="type-h1 text-ink">{o.client.company}</h1>
            <p className="mt-1 text-text-2">
              {o.client.contact_name} · <Ltr>{o.client.email}</Ltr> · {t.plan} <strong className="text-ink">{ar ? o.plan.name_ar : o.plan.name}</strong>{' '}
              <Badge tone={o.client.status === 'active' ? 'down' : 'up'}>{statusLabel}</Badge>
            </p>
          </div>
          <form action={devLogoutAction}><button type="submit" className={buttonClass('ghost')}>{t.logout}</button></form>
        </div>

        <StatsStrip
          className="mt-6"
          items={[
            { label: t.month, value: n(o.monthRequests), hint: quota ? `${t.of} ${n(quota)} (${pct}%)` : t.noQuota },
            { label: t.rpm, value: n(o.plan.rpm) },
            { label: t.activeKeys, value: `${activeKeys} / ${o.plan.max_keys}` },
            { label: t.window, value: `${o.plan.feed_window_days} ${t.day}`, hint: o.client.paid_until ? `${t.paidUntil} ${date(o.client.paid_until)}` : undefined },
          ]}
        />
        {pct !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t.quotaBar}>
            <div className={pct >= 90 ? 'h-full bg-up' : 'h-full bg-primary'} style={{ width: `${pct}%` }} />
          </div>
        )}

        <section aria-labelledby="keys" className="mt-10">
          <SectionTitle id="keys">{t.keys}</SectionTitle>
          <div className="overflow-hidden rounded-card border border-border">
            <table className="w-full border-collapse text-start">
              <thead className="hidden bg-surface md:table-header-group">
                <tr className="type-small text-text-2">
                  <th className="px-3 py-2 text-start font-medium">{t.name}</th>
                  <th className="px-3 py-2 text-start font-medium">{t.key}</th>
                  <th className="px-3 py-2 text-start font-medium">{t.scopes}</th>
                  <th className="px-3 py-2 text-start font-medium">{t.status}</th>
                  <th className="px-3 py-2 text-start font-medium">{t.lastUsed}</th>
                  <th className="px-3 py-2 text-start font-medium">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {o.keys.length === 0 && <tr><td className="px-3 py-4 text-text-2" colSpan={6}>{t.noKeys}</td></tr>}
                {o.keys.map((k) => {
                  const { live, expiring } = k;
                  return (
                    <tr key={k.id} className="block border-t border-border p-3 md:table-row md:p-0">
                      <td className="block py-0.5 font-medium text-ink md:table-cell md:px-3 md:py-2">{k.name}</td>
                      <td className="block py-0.5 md:table-cell md:px-3 md:py-2"><Code>{k.key_prefix}…</Code></td>
                      <td className="block py-0.5 md:table-cell md:px-3 md:py-2"><span dir="ltr" className="type-small font-mono text-text-2">{k.scopes.join(', ')}</span></td>
                      <td className="block py-0.5 md:table-cell md:px-3 md:py-2">
                        {k.status === 'revoked' ? <Badge tone="up">{t.revoked}</Badge> : expiring ? <Badge tone="rx">{t.expires} {date(k.expires_at)}</Badge> : live ? <Badge tone="down">{t.active}</Badge> : <Badge tone="muted">{t.expired}</Badge>}
                      </td>
                      <td className="block py-0.5 text-text-2 md:table-cell md:px-3 md:py-2">{k.last_used_at ? date(k.last_used_at) : '—'}</td>
                      <td className="block py-1 md:table-cell md:px-3 md:py-2">
                        {live && (
                          <div className="flex flex-wrap items-start gap-2">
                            <RotateKeyForm action={rotateKeyAction} keyId={k.id} lang={lang} />
                            <RevokeKeyForm action={revokeKeyAction} hidden={{ key_id: k.id }} lang={lang} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-card border border-border bg-surface p-4">
            <h3 className="mb-2 font-semibold text-ink">{t.newKey}</h3>
            {activeKeys >= o.plan.max_keys && <p className="type-small mb-2 text-text-2">{t.maxKeys} ({o.plan.max_keys}). {t.maxKeys2}</p>}
            <KeyCreateForm action={createKeyAction} disabled={activeKeys >= o.plan.max_keys || o.client.status !== 'active'} lang={lang} />
            <p className="type-small mt-2 text-text-2">{t.rotateNote}</p>
          </div>
        </section>

        <section aria-labelledby="usage" className="mt-10">
          <SectionTitle id="usage">{t.usage}</SectionTitle>
          <UsageChart days={o.usageByDay} lang={lang} />
          {o.topEndpoints.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
              {o.topEndpoints.map((e) => (
                <li key={e.endpoint} className="flex items-center justify-between rounded-control border border-border px-3 py-2">
                  <Code>{e.endpoint}</Code>
                  <span className="price text-ink">{n(e.requests)}</span>
                </li>
              ))}
            </ul>
          )}
          {o.alerts.length > 0 && (
            <div className="mt-4 rounded-card border border-rx/40 bg-rx-bg p-4">
              <h3 className="font-semibold text-ink">{t.alerts}</h3>
              <ul className="type-small mt-1 text-text-2">{o.alerts.map((a, i) => <li key={i}>{date(a.at)}: <Ltr>{a.kind}</Ltr></li>)}</ul>
            </div>
          )}
        </section>

        <section aria-labelledby="docs" className="mt-10 rounded-card border border-border bg-surface p-4 md:p-6">
          <SectionTitle id="docs">{t.start}</SectionTitle>
          <ul className="grid gap-2 md:grid-cols-2">
            <li><Link prefetch={false} href={`${base}/docs`} className="text-primary underline">{t.docs}</Link> — {t.docsD}</li>
            <li><Link prefetch={false} href={`${base}/docs#delta-sync`} className="text-primary underline">{t.delta}</Link> — {t.deltaD}</li>
            <li><Link prefetch={false} href={`${base}/sample`} className="text-primary underline">{t.explorer}</Link> — {t.explorerD}</li>
            <li><Link prefetch={false} href={`${base}/terms`} className="text-primary underline">{t.terms}</Link>{ar ? ' و' : '; '}{f.export === true ? t.exportYes : t.exportNo}.</li>
          </ul>
          <p className="type-small mt-3 text-text-2">{t.base}: <Code>{apiPublicBase()}</Code></p>
        </section>
      </Container>
    </>
  );
}
