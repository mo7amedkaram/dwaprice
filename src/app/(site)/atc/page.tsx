import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Ltr } from '@/components/ui';
import { PageHeader } from '@/components/listing/PageHeader';
import { getAtcRoots, getHubIndex } from '@/lib/data/listings';
import { formatCount } from '@/lib/listing/logic';
import { buildMetadata, pageText } from '@/lib/seo/metadata';
import { routes } from '@/lib/site';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({ kind: 'atc', path: routes.atcIndex(), ...pageText.atcIndex() });

/**
 * The 14 anatomical groups, then every named class (level 5) under its group,
 * so each indexable ATC page is two clicks from home (levels 2-4 have no names
 * in the catalogue: reachable from their group page, noindex).
 */
export default async function AtcIndexPage() {
  const [roots, all] = await Promise.all([getAtcRoots(), getHubIndex('atc')]);
  const classes = all.filter((h) => h.level === 5);
  return (
    <Container className="py-6 md:py-10">
      <PageHeader
        crumbs={[{ name: 'تصنيف ATC' }]}
        title="تصنيف ATC للأدوية"
        lead="التصنيف التشريحي العلاجي الكيميائي (ATC) لمنظمة الصحة العالمية يقسم الأدوية حسب العضو أو الجهاز الذي تعمل عليه ثم حسب تأثيرها العلاجي ومادتها الكيميائية."
      />
      <section aria-labelledby="groups" className="mb-10">
        <h2 id="groups" className="type-h2 mb-3 text-ink">
          المجموعات الرئيسية
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roots.map((r) => (
            <li key={r.key}>
              <Link
                prefetch={false}
                href={routes.atc(r.key, r.name_en)}
                className="flex min-h-16 items-center gap-3 rounded-card border border-border bg-bg px-4 py-3 transition-colors hover:border-primary hover:bg-primary-tint"
              >
                <Ltr className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-tint text-lg font-semibold text-primary">{r.key}</Ltr>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{r.name_ar}</span>
                  <span className="type-small text-text-2">
                    <span className="price">{formatCount(r.indexable_count)}</span> دواء
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {roots.map((r) => {
        const items = classes.filter((c) => c.key.startsWith(r.key));
        if (!items.length) return null;
        return (
          <section key={r.key} aria-labelledby={`atc-${r.key}`} className="mb-8">
            <h2 id={`atc-${r.key}`} className="type-h2 mb-3 border-b border-border pb-2 text-ink">
              <Ltr>{r.key}</Ltr> — {r.name_ar}
            </h2>
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => (
                <li key={c.key} className="min-w-0">
                  <Link prefetch={false} href={routes.atc(c.key, c.name_en)} className="group flex min-h-11 items-center justify-between gap-3 border-b border-border py-2">
                    <span className="min-w-0 truncate">
                      <Ltr className="type-small me-2 text-muted">{c.key}</Ltr>
                      <span className="font-medium text-ink group-hover:text-primary">{c.name_ar}</span>
                    </span>
                    <span className="type-small shrink-0 text-muted">
                      <span className="price">{formatCount(c.indexable_count)}</span> دواء
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Container>
  );
}
