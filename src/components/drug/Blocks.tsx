import Link from 'next/link';
import { ExternalIcon, InfoIcon } from '../icons';
import { Ltr, Price, SectionTitle } from '../ui';
import { citableSources } from './Statements';
import { formatDate, isoDate } from '@/lib/format';
import { routes } from '@/lib/site';
import type { DrugPage, GroupMemberRow } from '@/lib/data/types';
import type { RelatedCard } from '@/lib/data/drug-page';

/** Short medical disclaimer (Arabic), shown on every drug template. */
export function MedicalDisclaimer() {
  return (
    <aside aria-label="تنبيه طبي" className="type-small flex gap-2 rounded-card border border-border bg-surface p-4 text-text-2">
      <InfoIcon size={18} className="mt-0.5 shrink-0 text-primary" />
      <p>
        المعلومات هنا للاسترشاد فقط ولا تغني عن استشارة الطبيب أو الصيدلي. الأسعار هي الأسعار الرسمية المعلنة وقد تختلف
        في الصيدليات.
      </p>
    </aside>
  );
}

/** What an alternative is — written once, used on every alternatives view. */
export function AlternativesExplainer() {
  return (
    <p className="type-small rounded-card border border-border bg-primary-tint/50 p-4 text-text-2">
      <strong className="text-ink">ما هو البديل؟</strong> دواء من شركة أخرى بنفس المادة الفعالة ونفس التركيز، ويُسمّى
      أيضًا «البديل المثيل» أو «الجنيس». قد يختلف في السعر والشكل والمواد غير الفعالة. لا تغيّر دواءك قبل سؤال الطبيب أو
      الصيدلي.
    </p>
  );
}

/** "Also searched as" — other spellings people use, plain text, max 6. */
export function AlsoSearchedAs({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="type-small text-text-2">
      <span className="font-medium text-ink">يُبحث عنه أيضًا باسم: </span>
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && '، '}
          {/[a-z]/i.test(n) ? <Ltr>{n}</Ltr> : n}
        </span>
      ))}
    </p>
  );
}

const linkProps = { rel: 'nofollow noopener', target: '_blank' } as const;

/** Barcode, ATC codes, DrugBank / PubChem links (external, nofollow). */
export function IdentifiersBlock({ page }: { page: DrugPage }) {
  const refs = new Map<string, { name: string; drugbank: string | null; pubchem: string | null }>();
  for (const i of page.ingredient_details ?? []) {
    const name = i.name_en ?? i.name_ar;
    if (!name) continue;
    refs.set(name, {
      name,
      drugbank: i.drugbank_id ? `https://go.drugbank.com/drugs/${i.drugbank_id}` : null,
      pubchem: i.pubchem_cid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${i.pubchem_cid}` : null,
    });
  }
  const ingredientRefs = [...refs.values()].filter((r) => r.drugbank || r.pubchem);
  const atc = page.atc_links ?? [];
  if (!page.barcode && atc.length === 0 && ingredientRefs.length === 0) return null;

  const ext = 'inline-flex min-h-11 items-center gap-1 text-primary hover:underline';
  return (
    <section aria-labelledby="identifiers">
      <SectionTitle id="identifiers">المعرّفات</SectionTitle>
      <dl className="grid gap-4 rounded-card border border-border p-4 md:grid-cols-2">
        {page.barcode && (
          <div>
            <dt className="type-small text-text-2">الباركود</dt>
            <dd className="price font-medium text-ink">
              <Ltr>{page.barcode}</Ltr>
            </dd>
          </div>
        )}
        {atc.length > 0 && (
          <div>
            <dt className="type-small text-text-2">تصنيف ATC</dt>
            <dd>
              <ul>
                {atc.map((a) => (
                  <li key={a.code}>
                    {a.slug ? (
                      <Link prefetch={false} href={routes.atc(a.code, a.name_en)} className="inline-flex min-h-11 items-center gap-2 hover:text-primary">
                        <Ltr className="font-medium">{a.code}</Ltr>
                        {a.name_ar && <span className="text-text-2">{a.name_ar}</span>}
                      </Link>
                    ) : (
                      <Ltr className="font-medium">{a.code}</Ltr>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {ingredientRefs.length > 0 && (
          <div className="md:col-span-2">
            <dt className="type-small text-text-2">مراجع علمية للمادة الفعالة</dt>
            <dd>
              <ul className="space-y-1">
                {ingredientRefs.map((r) => (
                  <li key={r.name} className="flex flex-wrap items-center gap-x-4">
                    <Ltr className="font-medium text-ink">{r.name}</Ltr>
                    {r.drugbank && (
                      <a href={r.drugbank} {...linkProps} className={ext}>
                        DrugBank <ExternalIcon size={14} />
                        <span className="sr-only">(يفتح في نافذة جديدة)</span>
                      </a>
                    )}
                    {r.pubchem && (
                      <a href={r.pubchem} {...linkProps} className={ext}>
                        PubChem <ExternalIcon size={14} />
                        <span className="sr-only">(يفتح في نافذة جديدة)</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function CardLinks({ items }: { items: RelatedCard[] }) {
  return (
    <ul className="divide-y divide-border rounded-card border border-border">
      {items.map((d) => (
        <li key={d.slug}>
          <Link prefetch={false} href={routes.drug(d.slug)} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-primary-tint/40">
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{d.name_ar ?? d.name_en}</span>
              {d.dosage_form_ar && <span className="type-small block truncate text-text-2">{d.dosage_form_ar}</span>}
            </span>
            <Price value={d.current_price} className="type-small shrink-0 font-medium text-ink" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Same ingredient other strengths · same company · same category. */
export function RelatedLinks({
  otherStrengths,
  sameCompany,
  companyName,
  sameCategory,
  categoryName,
}: {
  otherStrengths: RelatedCard[];
  sameCompany: RelatedCard[];
  companyName: string | null;
  sameCategory: RelatedCard[];
  categoryName: string | null;
}) {
  const groups = [
    { id: 'related-strengths', title: 'نفس المادة الفعالة بتركيز آخر', items: otherStrengths },
    { id: 'related-company', title: companyName ? `منتجات أخرى من ${companyName}` : 'منتجات أخرى من نفس الشركة', items: sameCompany, ltr: !!companyName },
    { id: 'related-category', title: categoryName ? `من فئة ${categoryName}` : 'من نفس الفئة', items: sameCategory },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="related" className="space-y-6">
      <h2 id="related" className="type-h2 text-ink">
        أدوية ذات صلة
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id} className="min-w-0">
            <h3 id={g.id} className="mb-2 font-semibold text-ink">
              {g.title}
            </h3>
            <CardLinks items={g.items} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Other packs of the same drug (recognition_product_index group), with prices. */
export function OtherPacks({ members, current }: { members: GroupMemberRow[]; current: string }) {
  const others = members.filter((m) => m.member_slug !== current);
  if (others.length === 0) return null;
  return (
    <section aria-labelledby="other-packs" className="rounded-card border border-border p-4">
      <h2 id="other-packs" className="mb-2 font-semibold text-ink">
        عبوات أخرى من نفس الدواء
      </h2>
      <ul className="divide-y divide-border">
        {others.map((m) => (
          <li key={m.member_slug}>
            <Link prefetch={false} href={routes.drug(m.member_slug)} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-primary">
              <span className="min-w-0 truncate">{m.name_ar ?? m.name_en}</span>
              <Price value={m.current_price} className="type-small shrink-0 font-medium" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where the information comes from: citable sources only, plus the price basis. */
export function SourcesBlock({ page }: { page: DrugPage }) {
  const sources = [...citableSources(page.sources).values()].filter((s) => s.source_name);
  return (
    <section aria-labelledby="sources" className="type-small text-text-2">
      <h2 id="sources" className="mb-2 font-semibold text-ink">
        المصادر
      </h2>
      <ul className="space-y-1">
        <li>
          السعر: قوائم أسعار الأدوية المنشورة في مصر
          {page.price_verified_at && (
            <>
              {' '}
              — تم التحقق في <time dateTime={isoDate(page.price_verified_at) ?? undefined}>{formatDate(page.price_verified_at)}</time>
            </>
          )}
          .
        </li>
        {sources.slice(0, 8).map((s) => (
          <li key={s.source_id}>
            {s.url ? (
              <a href={s.url} rel="nofollow noopener" target="_blank" className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline">
                <Ltr>{s.source_name}</Ltr>
                <ExternalIcon size={12} />
              </a>
            ) : (
              <Ltr>{s.source_name}</Ltr>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
