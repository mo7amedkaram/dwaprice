import type { ReactNode } from 'react';
import { Badge, Ltr } from '../ui';
import type { Source, Statement } from '@/lib/data/types';

/** UI language of a clinical list. 'ar' is the site default; 'en' is used by the drug-info toggle. */
export type InfoLang = 'ar' | 'en';

const EVIDENCE: Record<InfoLang, Record<string, string>> = {
  ar: {
    EGYPTIAN_LABEL: 'النشرة المصرية',
    EXACT_PRODUCT_INTL: 'نشرة دولية لنفس المنتج',
    SAME_FORMULATION_INTL: 'نشرة دولية لنفس التركيبة',
    EQUIVALENT_FORMULATION_INTL: 'نشرة دولية لتركيبة مكافئة',
    INGREDIENT_LEVEL: 'معلومة عامة عن المادة الفعالة',
    MANUFACTURER_CLAIM: 'حسب الشركة المنتجة',
  },
  en: {
    EGYPTIAN_LABEL: 'Egyptian label',
    EXACT_PRODUCT_INTL: 'International label, same product',
    SAME_FORMULATION_INTL: 'International label, same formulation',
    EQUIVALENT_FORMULATION_INTL: 'International label, equivalent formulation',
    INGREDIENT_LEVEL: 'General active-ingredient information',
    MANUFACTURER_CLAIM: 'Per the manufacturer',
  },
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
function EvidenceNote({ level, ids, sources, lang }: { level?: string; ids?: string[]; sources: Map<string, Source>; lang: InfoLang }) {
  const label = level ? EVIDENCE[lang][level] : undefined;
  const names = sourceNames(ids, sources);
  if (!label && names.length === 0) return null;
  return (
    <span className="type-small mt-0.5 block text-muted">
      {label}
      {label && names.length > 0 && ' · '}
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && (lang === 'en' ? ', ' : '، ')}
          <Ltr>{n}</Ltr>
        </span>
      ))}
    </span>
  );
}

/** In Arabic, the Arabic text (falling back to English when there is no Arabic). In English, only the English text. */
const text = (lang: InfoLang, ar?: string | null, en?: string | null): ReactNode => (lang === 'en' ? (en ? <span>{en}</span> : null) : ar ? ar : en ? <Ltr>{en}</Ltr> : null);

export function StatementList({ items, sources, limit, lang = 'ar' }: { items: Statement[]; sources: Map<string, Source>; limit?: number; lang?: InfoLang }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-3">
      {shown.map((s, i) => (
        <li key={s.statement_id ?? i} className="text-ink">
          {text(lang, s.ar, s.en)}
          <EvidenceNote level={s.evidence_level} ids={s.source_ids} sources={sources} lang={lang} />
        </li>
      ))}
    </ul>
  );
}

export function UsesList({
  items,
  sources,
  limit,
  lang = 'ar',
}: {
  items: Array<{ indication_ar?: string; indication_en?: string; population?: string; source_ids?: string[] }>;
  sources: Map<string, Source>;
  limit?: number;
  lang?: InfoLang;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-3">
      {shown.map((u, i) => (
        <li key={i} className="text-ink">
          {text(lang, u.indication_ar, u.indication_en)}
          {u.population && (
            <span className="type-small block text-text-2">
              {lang === 'en' ? 'Population: ' : 'الفئة: '}
              <Ltr>{u.population}</Ltr>
            </span>
          )}
          <EvidenceNote ids={u.source_ids} sources={sources} lang={lang} />
        </li>
      ))}
    </ul>
  );
}

const SEVERITY: Record<string, { ar: string; en: string; tone: 'up' | 'rx' | 'neutral' }> = {
  CONTRAINDICATED: { ar: 'ممنوع الجمع', en: 'Contraindicated', tone: 'up' },
  AVOID: { ar: 'يُتجنب', en: 'Avoid', tone: 'up' },
  MAJOR: { ar: 'شديد', en: 'Major', tone: 'up' },
  MODERATE: { ar: 'متوسط', en: 'Moderate', tone: 'rx' },
  MINOR: { ar: 'بسيط', en: 'Minor', tone: 'neutral' },
};

export function InteractionList({
  items,
  sources,
  limit,
  lang = 'ar',
}: {
  items: Array<{ interacting_substance?: string; severity?: string; description_ar?: string; description_en?: string; source_ids?: string[] }>;
  sources: Map<string, Source>;
  limit?: number;
  lang?: InfoLang;
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
              {sev && <Badge tone={sev.tone}>{lang === 'en' ? sev.en : sev.ar}</Badge>}
            </span>
            {text(lang, it.description_ar, it.description_en)}
            <EvidenceNote ids={it.source_ids} sources={sources} lang={lang} />
          </li>
        );
      })}
    </ul>
  );
}
