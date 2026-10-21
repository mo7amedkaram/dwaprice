import Link from 'next/link';
import type { ReactNode } from 'react';
import { Accordion } from '../Accordion';
import { JsonLd } from '../JsonLd';
import { CheckIcon } from '../icons';
import { Badge, buttonClass, cx } from '../ui';
import { Code } from './CodeBlock';
import { faqJsonLd } from '@/lib/seo/jsonld';
import type { PlanInfo } from '@/lib/api/dashboard-data';

const n = (v: number | string | null | undefined) => new Intl.NumberFormat('en-US').format(Number(v) || 0);

/** Coverage counters (home of the API section, admin, dashboard). */
export function StatsStrip({ items, className }: { items: Array<{ label: string; value: ReactNode; hint?: ReactNode }>; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-2 gap-3 md:grid-cols-4', className)}>
      {items.map((it) => (
        <div key={it.label} className="rounded-card border border-border bg-bg p-4">
          <dt className="type-small text-text-2">{it.label}</dt>
          <dd className="price mt-1 text-2xl font-semibold text-ink">{it.value}</dd>
          {it.hint && <dd className="type-small mt-0.5 text-muted">{it.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

const T = {
  ar: { free: 'مجانًا', month: 'ج.م / شهريًا', from: 'يبدأ من', contract: 'بالتعاقد', rpm: 'طلب / دقيقة', quota: 'طلب / شهر', keys: 'مفاتيح', window: 'نافذة التغييرات', days: 'يوم', unlimited: 'بالاتفاق', export: 'تصدير كامل (CSV/Excel/JSON)', webhooks: 'Webhooks عند تغيّر الأسعار', allowlist: 'قائمة IP مسموحة', support: 'الدعم', trySample: 'جرّب العينة', request: 'اطلب الوصول', popular: 'الأكثر طلبًا', sampleNote: '50 دواءً ثابتًا، بلا مفتاح' },
  en: { free: 'Free', month: 'EGP / month', from: 'from', contract: 'by contract', rpm: 'requests / min', quota: 'requests / month', keys: 'keys', window: 'change feed window', days: 'days', unlimited: 'by agreement', export: 'Full export (CSV/Excel/JSON)', webhooks: 'Webhooks on price changes', allowlist: 'IP allowlist', support: 'Support', trySample: 'Try the sample', request: 'Request access', popular: 'Most popular', sampleNote: 'Fixed set of 50 drugs, no key' },
};

/** Plan cards from api.plans (prices and limits are never hard-coded here). */
export function PlanCards({ plans, lang = 'ar' }: { plans: PlanInfo[]; lang?: 'ar' | 'en' }) {
  const t = T[lang];
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((p) => {
        const f = p.features as Record<string, unknown>;
        const sample = p.id === 'sample';
        const enterprise = p.id === 'enterprise';
        const popular = p.id === 'business';
        return (
          <li key={p.id} className={cx('relative flex flex-col rounded-card border bg-bg p-5', popular ? 'border-primary shadow-sm' : 'border-border')}>
            {popular && <Badge tone="primary" className="absolute -top-3 start-4">{t.popular}</Badge>}
            <h3 className="text-lg font-semibold text-ink">{lang === 'ar' ? p.name_ar : p.name}</h3>
            <p className="mt-2 text-ink">
              {sample || !p.price_egp_monthly ? (
                <span className="text-2xl font-semibold">{t.free}</span>
              ) : (
                <>
                  {enterprise && <span className="type-small text-text-2">{t.from} </span>}
                  <span className="price text-2xl font-semibold">{n(p.price_egp_monthly)}</span> <span className="type-small text-text-2">{t.month}</span>
                </>
              )}
            </p>
            <ul className="mt-4 space-y-1.5 text-text-2">
              {sample ? (
                <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" />{t.sampleNote}</li>
              ) : (
                <>
                  <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" /><span><span className="price">{n(p.rpm)}</span> {t.rpm}</span></li>
                  <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" /><span>{p.monthly_quota === null ? t.unlimited : <><span className="price">{n(p.monthly_quota)}</span> {t.quota}</>}</span></li>
                  <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" /><span><span className="price">{n(p.max_keys)}</span> {t.keys}</span></li>
                </>
              )}
              <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" /><span>{t.window}: <span className="price">{n(p.feed_window_days)}</span> {t.days}</span></li>
              {f.export === true && <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" />{t.export}</li>}
              {f.webhooks === true && <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" />{t.webhooks}</li>}
              {f.ip_allowlist === true && <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" />{t.allowlist}</li>}
              {typeof f.support === 'string' && f.support && <li className="flex gap-2"><CheckIcon size={18} className="mt-1 shrink-0 text-primary" /><span>{t.support}: <span dir="ltr">{f.support}</span></span></li>}
            </ul>
            <div className="mt-auto pt-5">
              <Link prefetch={false} href={sample ? `${lang === 'en' ? '/api/en' : '/api'}/sample` : `${lang === 'en' ? '/api/en' : '/api'}/request-access?plan=${p.id}`} className={buttonClass(popular ? 'primary' : 'secondary', 'w-full')}>
                {sample ? t.trySample : t.request}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface FieldRow {
  name: string;
  type: string;
  description: ReactNode;
  example?: string | null;
  required?: boolean;
}

/** Field table (what you get / schema reference): a table from md up, cards below. */
export function FieldTable({ rows, caption, lang = 'ar' }: { rows: FieldRow[]; caption: string; lang?: 'ar' | 'en' }) {
  const h = lang === 'ar' ? { name: 'الحقل', type: 'النوع', desc: 'الوصف', ex: 'مثال' } : { name: 'Field', type: 'Type', desc: 'Description', ex: 'Example' };
  return (
    <div className="overflow-hidden rounded-card border border-border">
      <table role="table" className="w-full border-collapse text-start">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="hidden bg-surface md:table-header-group">
          <tr role="row" className="type-small text-text-2">
            <th scope="col" className="px-3 py-2 text-start font-medium">{h.name}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{h.type}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{h.desc}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{h.ex}</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((r) => (
            <tr role="row" key={r.name} className="block border-t border-border px-3 py-2 md:table-row md:px-0 md:py-0">
              <td role="cell" className="block py-0.5 md:table-cell md:px-3 md:py-2 md:align-top">
                <Code>{r.name}</Code>
                {r.required && <span className="type-small ms-1 text-up">*</span>}
              </td>
              <td role="cell" className="block py-0.5 md:table-cell md:px-3 md:py-2 md:align-top">
                <span className="type-small text-text-2 md:hidden">{h.type}: </span>
                <span dir="ltr" className="type-small font-mono text-text-2">{r.type}</span>
              </td>
              <td role="cell" className="block py-0.5 text-text-2 md:table-cell md:px-3 md:py-2 md:align-top">{r.description}</td>
              <td role="cell" className="block py-0.5 md:table-cell md:px-3 md:py-2 md:align-top">
                {r.example != null && r.example !== '' && (
                  <span dir="ltr" className="type-small inline-block max-w-xs truncate font-mono text-text-2" title={r.example}>
                    {r.example}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** FAQ: visible accordion + FAQPage JSON-LD built from the same text. */
export function Faq({ items, className }: { items: Array<{ q: string; a: string }>; className?: string }) {
  return (
    <>
      <Accordion className={className} items={items.map((it, i) => ({ id: `faq-${i}`, title: it.q, content: <p>{it.a}</p> }))} />
      <JsonLd data={faqJsonLd(items.map((it) => ({ question: it.q, answer: it.a })))!} />
    </>
  );
}

/** Daily request bars for the last N days (SVG, HTML labels, data table for AT). */
export function UsageChart({ days, lang = 'ar' }: { days: Array<{ day: string; requests: number; errors: number }>; lang?: 'ar' | 'en' }) {
  const max = Math.max(1, ...days.map((d) => d.requests));
  const w = 100 / Math.max(1, days.length);
  const total = days.reduce((s, d) => s + d.requests, 0);
  return (
    <figure>
      <div className="relative h-40 w-full rounded-card border border-border bg-bg p-2" dir="ltr">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
          {days.map((d, i) => {
            const h = (d.requests / max) * 100;
            const eh = d.requests ? (d.errors / d.requests) * h : 0;
            return (
              <g key={d.day}>
                <rect x={i * w + w * 0.15} y={100 - h} width={w * 0.7} height={h} className="fill-primary" />
                {eh > 0 && <rect x={i * w + w * 0.15} y={100 - eh} width={w * 0.7} height={eh} className="fill-up" />}
              </g>
            );
          })}
        </svg>
        <span className="type-small absolute top-1 start-2 text-muted">{n(max)}</span>
      </div>
      <figcaption className="type-small mt-1 flex justify-between text-text-2">
        <span dir="ltr">{days[0]?.day}</span>
        <span>{lang === 'ar' ? `${n(total)} طلب في ${days.length} يومًا` : `${n(total)} requests in ${days.length} days`}</span>
        <span dir="ltr">{days[days.length - 1]?.day}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{lang === 'ar' ? 'الطلبات اليومية' : 'Daily requests'}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.requests}</td>
              <td>{d.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
