import type { ReactNode } from 'react';
import { Badge, Ltr } from '../ui';
import type { Source, Statement } from '@/lib/data/types';

const EVIDENCE: Record<string, string> = {
  EGYPTIAN_LABEL: 'النشرة المصرية',
  EXACT_PRODUCT_INTL: 'نشرة دولية لنفس المنتج',
  SAME_FORMULATION_INTL: 'نشرة دولية لنفس التركيبة',
  EQUIVALENT_FORMULATION_INTL: 'نشرة دولية لتركيبة مكافئة',
  INGREDIENT_LEVEL: 'معلومة عامة عن المادة الفعالة',
  MANUFACTURER_CLAIM: 'حسب الشركة المنتجة',
};

/** Source types that are cited by name. Price directories and shops are never named or linked. */
export const CITABLE_SOURCE_TYPES = new Set(['DRUG_LABEL', 'OFFICIAL_LEAFLET', 'REGULATORY', 'REFERENCE_DATABASE', 'ENCYCLOPEDIA', 'GUIDELINE', 'MANUFACTURER']);

export function citableSources(sources: Source[] | null | undefined): Map<string, Source> {
  const map = new Map<string, Source>();
  for (const s of sources ?? []) if (s.source_type && CITABLE_SOURCE_TYPES.has(s.source_type)) map.set(s.source_id, s);
  return map;
}

function sourceNames(ids: string[] | undefined, sources: Map<string, Source>): string[] {
  const names = (ids ?? []).map((id) => sources.get(id)?.source_name).filter((n): n is string => !!n);
  return [...new Set(names)].slice(0, 2);
}

/** "نشرة دولية لنفس التركيبة · DailyMed" under each statement. */
function EvidenceNote({ level, ids, sources }: { level?: string; ids?: string[]; sources: Map<string, Source> }) {
  const label = level ? EVIDENCE[level] : undefined;
  const names = sourceNames(ids, sources);
  if (!label && names.length === 0) return null;
  return (
    <span className="type-small mt-0.5 block text-muted">
      {label}
      {label && names.length > 0 && ' · '}
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && '، '}
          <Ltr>{n}</Ltr>
        </span>
      ))}
    </span>
  );
}

const text = (ar?: string | null, en?: string | null): ReactNode => (ar ? ar : en ? <Ltr>{en}</Ltr> : null);

export function StatementList({ items, sources, limit }: { items: Statement[]; sources: Map<string, Source>; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-3">
      {shown.map((s, i) => (
        <li key={s.statement_id ?? i} className="text-ink">
          {text(s.ar, s.en)}
          <EvidenceNote level={s.evidence_level} ids={s.source_ids} sources={sources} />
        </li>
      ))}
    </ul>
  );
}

export function UsesList({
  items,
  sources,
  limit,
}: {
  items: Array<{ indication_ar?: string; indication_en?: string; population?: string; source_ids?: string[] }>;
  sources: Map<string, Source>;
  limit?: number;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-3">
      {shown.map((u, i) => (
        <li key={i} className="text-ink">
          {text(u.indication_ar, u.indication_en)}
          {u.population && (
            <span className="type-small block text-text-2">
              الفئة: <Ltr>{u.population}</Ltr>
            </span>
          )}
          <EvidenceNote ids={u.source_ids} sources={sources} />
        </li>
      ))}
    </ul>
  );
}

const SEVERITY: Record<string, { label: string; tone: 'up' | 'rx' | 'neutral' }> = {
  CONTRAINDICATED: { label: 'ممنوع الجمع', tone: 'up' },
  AVOID: { label: 'يُتجنب', tone: 'up' },
  MAJOR: { label: 'شديد', tone: 'up' },
  MODERATE: { label: 'متوسط', tone: 'rx' },
  MINOR: { label: 'بسيط', tone: 'neutral' },
};

export function InteractionList({
  items,
  sources,
  limit,
}: {
  items: Array<{ interacting_substance?: string; severity?: string; description_ar?: string; description_en?: string; source_ids?: string[] }>;
  sources: Map<string, Source>;
  limit?: number;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-3">
      {shown.map((it, i) => {
        const sev = it.severity ? SEVERITY[it.severity] : undefined;
        return (
          <li key={i} className="text-ink">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {it.interacting_substance && <Ltr>{it.interacting_substance}</Ltr>}
              {sev && <Badge tone={sev.tone}>{sev.label}</Badge>}
            </span>
            {text(it.description_ar, it.description_en)}
            <EvidenceNote ids={it.source_ids} sources={sources} />
          </li>
        );
      })}
    </ul>
  );
}
