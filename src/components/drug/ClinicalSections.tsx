import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AccordionItem } from '../Accordion';
import { Ltr } from '../ui';
import { DosingRules } from './DosingRules';
import { InteractionList, StatementList, UsesList, citableSources, type InfoLang } from './Statements';
import { hasEnglishInfo, mentionsResearchNotes } from '@/lib/drug/logic';
import type { DosingRule, DrugPage, Statement } from '@/lib/data/types';

interface Options {
  /** Show at most this many items per list and link to the uses page for the rest. */
  limit?: number;
  usesHref?: string | null;
  dosingRules: DosingRule[];
  /** Open the first section. */
  openFirst?: boolean;
}

const nonEmpty = <T,>(a: T[] | null | undefined): a is T[] => Array.isArray(a) && a.length > 0;
const hasEn = (items: Array<{ en?: string | null }> | null | undefined) => (items ?? []).some((s) => s.en && s.en.trim());

/** One clinical section, rendered in Arabic or English (English falls back per item to Arabic inside the list). */
interface Section {
  id: string;
  title: Record<InfoLang, string>;
  render: (lang: InfoLang) => ReactNode;
  /** Whether any English text exists for this section (false => the toggle shows a "not available" note). */
  english: boolean;
}

/** The sections a drug has, in display order, each able to render in either language. */
function sections(page: DrugPage, opts: Options): Section[] {
  const sources = citableSources(page.sources);
  const more = (count: number, lang: InfoLang): ReactNode =>
    opts.limit && opts.usesHref && count > opts.limit ? (
      <Link prefetch={false} href={opts.usesHref} className="mt-3 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
        {lang === 'en' ? `Show all (${count})` : `عرض الكل (${count})`}
      </Link>
    ) : null;
  const statements = (items: Statement[], lang: InfoLang) => (
    <>
      <StatementList items={items} sources={sources} limit={opts.usesHref ? opts.limit : undefined} lang={lang} />
      {more(items.length, lang)}
    </>
  );
  const pregnancy = [...(page.pregnancy?.risk_summary ?? []), ...(page.pregnancy?.breastfeeding ?? [])];
  const mechanisms = (page.ingredient_details ?? []).filter((i) => i.mechanism_ar || i.mechanism_en || i.pharmacological_class_ar);
  const descriptionOk = !page.description_needs_review;
  const descAr = descriptionOk && page.description_ar && !mentionsResearchNotes(page.description_ar) ? page.description_ar : null;
  const descEn = descriptionOk && page.description_en && !mentionsResearchNotes(page.description_en) ? page.description_en : null;

  const all: Array<Section | null> = [
    descAr || descEn
      ? {
          id: 'description',
          title: { ar: 'عن الدواء', en: 'About the medicine' },
          english: !!descEn,
          render: (lang) => <p className="text-ink">{lang === 'en' ? descEn : (descAr ?? (descEn ? <Ltr>{descEn}</Ltr> : null))}</p>,
        }
      : null,
    nonEmpty(page.uses)
      ? {
          id: 'uses',
          title: { ar: 'دواعي الاستعمال', en: 'Uses' },
          english: page.uses.some((u) => u.indication_en?.trim()),
          render: (lang) => (
            <>
              <UsesList items={page.uses} sources={sources} limit={opts.usesHref ? opts.limit : undefined} lang={lang} />
              {more(page.uses.length, lang)}
            </>
          ),
        }
      : null,
    nonEmpty(opts.dosingRules)
      ? {
          id: 'dosing',
          // Pharmacist-reviewed Arabic rules only; never machine-translated.
          title: { ar: 'الجرعة (مراجعة صيدلية)', en: 'Dosage (pharmacist-reviewed)' },
          english: false,
          render: () => <DosingRules rules={opts.dosingRules} />,
        }
      : null,
    nonEmpty(page.side_effects) ? { id: 'side-effects', title: { ar: 'الآثار الجانبية', en: 'Side effects' }, english: hasEn(page.side_effects), render: (lang) => statements(page.side_effects, lang) } : null,
    nonEmpty(page.contraindications)
      ? { id: 'contraindications', title: { ar: 'موانع الاستعمال', en: 'Contraindications' }, english: hasEn(page.contraindications), render: (lang) => statements(page.contraindications, lang) }
      : null,
    nonEmpty(page.warnings) ? { id: 'warnings', title: { ar: 'تحذيرات واحتياطات', en: 'Warnings & precautions' }, english: hasEn(page.warnings), render: (lang) => statements(page.warnings, lang) } : null,
    nonEmpty(page.interactions)
      ? {
          id: 'interactions',
          title: { ar: 'التداخلات الدوائية', en: 'Drug interactions' },
          english: page.interactions.some((it) => it.description_en?.trim()),
          render: (lang) => (
            <>
              <InteractionList items={page.interactions} sources={sources} limit={opts.usesHref ? opts.limit : undefined} lang={lang} />
              {more(page.interactions.length, lang)}
            </>
          ),
        }
      : null,
    pregnancy.length ? { id: 'pregnancy', title: { ar: 'الحمل والرضاعة', en: 'Pregnancy & breastfeeding' }, english: hasEn(pregnancy), render: (lang) => statements(pregnancy, lang) } : null,
    nonEmpty(page.monitoring) && !opts.limit ? { id: 'monitoring', title: { ar: 'المتابعة أثناء العلاج', en: 'Monitoring' }, english: hasEn(page.monitoring), render: (lang) => statements(page.monitoring, lang) } : null,
    mechanisms.length
      ? {
          id: 'mechanism',
          title: { ar: 'كيف يعمل الدواء', en: 'How it works' },
          english: mechanisms.some((m) => m.mechanism_en?.trim()),
          render: (lang) => (
            <ul className="space-y-3">
              {mechanisms.map((m, i) => (
                <li key={i} className="text-ink">
                  {m.name_ar && lang === 'ar' && <span className="font-medium">{m.name_ar}: </span>}
                  {m.name_en && lang === 'en' && (
                    <span className="font-medium">
                      <Ltr>{m.name_en}</Ltr>:{' '}
                    </span>
                  )}
                  {lang === 'en' ? (m.mechanism_en ? <span>{m.mechanism_en}</span> : m.mechanism_ar) : (m.mechanism_ar ?? (m.mechanism_en ? <Ltr>{m.mechanism_en}</Ltr> : null))}
                  {m.pharmacological_class_ar && lang === 'ar' && <span className="type-small block text-text-2">{m.pharmacological_class_ar}</span>}
                </li>
              ))}
            </ul>
          ),
        }
      : null,
    page.storage?.ar || page.storage?.en
      ? {
          id: 'storage',
          title: { ar: 'طريقة الحفظ', en: 'Storage' },
          english: !!page.storage?.en,
          render: (lang) => <p className="text-ink">{lang === 'en' ? (page.storage?.en ?? page.storage?.ar) : (page.storage?.ar ?? page.storage?.en)}</p>,
        }
      : null,
  ];
  return all.filter((s): s is Section => s !== null);
}

/**
 * Arabic accordion items built only from real data (used by the uses page). A section appears
 * when it has at least one usable statement; dosing appears only for APPROVED rules.
 */
export function clinicalItems(page: DrugPage, opts: Options): AccordionItem[] {
  const out: AccordionItem[] = sections(page, opts).map((s) => ({ id: s.id, title: s.title.ar, content: s.render('ar') }));
  if (opts.openFirst && out[0]) out[0] = { ...out[0], defaultOpen: true };
  return out;
}

const EN_UNAVAILABLE_NOTE = 'English text not available for this section.';

/**
 * Bilingual accordion items for the drug page: each item carries both the Arabic text (visible by
 * default) and the English text in a `lang="en" dir="ltr"` container, toggled with CSS on
 * `html[data-info-lang]` (components/drug/InfoLangToggle). Both are in the server HTML, so the
 * switch is instant with no request and no layout shift. `hasEnglish` is false when the drug has no
 * English in any section (then the page hides the toggle).
 */
export function bilingualClinicalItems(page: DrugPage, opts: Options): { items: AccordionItem[]; hasEnglish: boolean } {
  const secs = sections(page, opts);
  const hasEnglish = hasEnglishInfo(page);
  const items: AccordionItem[] = secs.map((s) => ({
    id: s.id,
    title: (
      <>
        <span className="info-ar">{s.title.ar}</span>
        <span className="info-en" lang="en" dir="ltr">
          {s.title.en}
        </span>
      </>
    ),
    content: (
      <>
        <div className="info-ar">{s.render('ar')}</div>
        <div className="info-en" lang="en" dir="ltr">
          {s.english ? s.render('en') : <p className="text-text-2">{EN_UNAVAILABLE_NOTE}</p>}
        </div>
      </>
    ),
  }));
  if (opts.openFirst && items[0]) items[0] = { ...items[0], defaultOpen: true };
  return { items, hasEnglish };
}
