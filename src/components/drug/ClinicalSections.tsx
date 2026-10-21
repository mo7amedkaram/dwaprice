import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AccordionItem } from '../Accordion';
import { Ltr } from '../ui';
import { DosingRules } from './DosingRules';
import { InteractionList, StatementList, UsesList, citableSources } from './Statements';
import { mentionsResearchNotes } from '@/lib/drug/logic';
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

/**
 * Accordion items built only from real data: a section appears when it has at
 * least one usable statement. Dosing appears only for APPROVED rules; the
 * payload's dosage statements are never shown.
 */
export function clinicalItems(page: DrugPage, opts: Options): AccordionItem[] {
  const sources = citableSources(page.sources);
  const more = (count: number): ReactNode =>
    opts.limit && opts.usesHref && count > opts.limit ? (
      <Link prefetch={false} href={opts.usesHref} className="mt-3 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
        عرض الكل ({count})
      </Link>
    ) : null;
  const list = (items: Statement[]) => (
    <>
      <StatementList items={items} sources={sources} limit={opts.usesHref ? opts.limit : undefined} />
      {more(items.length)}
    </>
  );
  const pregnancy = [...(page.pregnancy?.risk_summary ?? []), ...(page.pregnancy?.breastfeeding ?? [])];
  const mechanisms = (page.ingredient_details ?? []).filter((i) => i.mechanism_ar || i.pharmacological_class_ar);
  const description = page.description_ar && !page.description_needs_review && !mentionsResearchNotes(page.description_ar) ? page.description_ar : null;

  const items: Array<AccordionItem | null> = [
    description ? { id: 'description', title: 'عن الدواء', content: <p className="text-ink">{description}</p> } : null,
    nonEmpty(page.uses)
      ? {
          id: 'uses',
          title: 'دواعي الاستعمال',
          content: (
            <>
              <UsesList items={page.uses} sources={sources} limit={opts.usesHref ? opts.limit : undefined} />
              {more(page.uses.length)}
            </>
          ),
        }
      : null,
    nonEmpty(opts.dosingRules) ? { id: 'dosing', title: 'الجرعة (مراجعة صيدلية)', content: <DosingRules rules={opts.dosingRules} /> } : null,
    nonEmpty(page.side_effects) ? { id: 'side-effects', title: 'الآثار الجانبية', content: list(page.side_effects) } : null,
    nonEmpty(page.contraindications) ? { id: 'contraindications', title: 'موانع الاستعمال', content: list(page.contraindications) } : null,
    nonEmpty(page.warnings) ? { id: 'warnings', title: 'تحذيرات واحتياطات', content: list(page.warnings) } : null,
    nonEmpty(page.interactions)
      ? {
          id: 'interactions',
          title: 'التداخلات الدوائية',
          content: (
            <>
              <InteractionList items={page.interactions} sources={sources} limit={opts.usesHref ? opts.limit : undefined} />
              {more(page.interactions.length)}
            </>
          ),
        }
      : null,
    pregnancy.length ? { id: 'pregnancy', title: 'الحمل والرضاعة', content: list(pregnancy) } : null,
    nonEmpty(page.monitoring) && !opts.limit ? { id: 'monitoring', title: 'المتابعة أثناء العلاج', content: list(page.monitoring) } : null,
    mechanisms.length
      ? {
          id: 'mechanism',
          title: 'كيف يعمل الدواء',
          content: (
            <ul className="space-y-3">
              {mechanisms.map((m, i) => (
                <li key={i} className="text-ink">
                  {m.name_ar && <span className="font-medium">{m.name_ar}: </span>}
                  {m.mechanism_ar ?? (m.mechanism_en ? <Ltr>{m.mechanism_en}</Ltr> : null)}
                  {m.pharmacological_class_ar && <span className="type-small block text-text-2">{m.pharmacological_class_ar}</span>}
                </li>
              ))}
            </ul>
          ),
        }
      : null,
    page.storage?.ar ? { id: 'storage', title: 'طريقة الحفظ', content: <p className="text-ink">{page.storage.ar}</p> } : null,
  ];
  const out = items.filter((i): i is AccordionItem => i !== null);
  if (opts.openFirst && out[0]) out[0] = { ...out[0], defaultOpen: true };
  return out;
}
