// ISR and tag-based revalidation policy (see docs/DESIGN.md "Rendering & caching").
//
// * Pages render on demand and are cached for a day: `export const revalidate = 86400`
//   in each page file (the value must be a literal there).
// * Every data loader is wrapped in unstable_cache with these tags, so a single
//   page can be refreshed with POST /api/revalidate {"tags":["drug:<slug>"]}.

export const REVALIDATE_SECONDS = 86_400;

/** How many of the most visited drug pages are generated at build time. */
export const STATIC_TOP_DRUGS = 200;

export const tags = {
  /** Everything read from the catalogue (use to refresh the whole site). */
  catalog: 'catalog',
  drug: (slug: string) => `drug:${slug}`,
  hub: (type: 'ingredient' | 'company' | 'category' | 'atc', slug: string) => `${type}:${slug}`,
  prices: 'prices',
  sitemap: 'sitemap',
  slugs: 'slugs',
  /** Editable site settings + uploaded assets (admin area). Revalidated on save, so the live site updates in seconds. */
  settings: 'site-settings',
} as const;

/** Tag names accepted by /api/revalidate. */
export function isValidTag(tag: string): boolean {
  return /^(catalog|prices|sitemap|slugs|(drug|ingredient|company|category|atc):[a-z0-9-]{1,100})$/.test(tag);
}
