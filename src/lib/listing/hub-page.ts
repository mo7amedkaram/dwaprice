import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getHubDrugs, getHubForms } from '@/lib/data/listings';
import { pageCount, parseFilters, parsePage, sameQuery } from './logic';
import type { HubRow, HubType } from '@/lib/data/types';

export const HUB_PAGE_SIZE = 48;

type Params = Record<string, string | string[] | undefined>;

/**
 * Request state of a filterable hub list (company, category, ATC): filters and
 * page from the query string. Redirects to the clean URL when the query has
 * empty/unknown/default parameters; 404 for an invalid or out-of-range page.
 */
export async function hubListState(type: HubType, hub: HubRow, path: string, params: Params) {
  const forms = await getHubForms(type, hub.key);
  const { filters, filtered, cleanQuery } = parseFilters(params, new Set(forms.map((f) => f.form_class ?? 'other')));
  if (!sameQuery(params, cleanQuery)) redirect(cleanQuery ? `${path}?${cleanQuery}` : path);
  const page = parsePage(params.page);
  if (page === null) notFound();
  const { rows, total } = await getHubDrugs(type, hub, filters, HUB_PAGE_SIZE, (page - 1) * HUB_PAGE_SIZE);
  const pages = pageCount(total, HUB_PAGE_SIZE);
  if (page > pages) notFound();
  return { forms, filters, filtered, page, pages, rows, total, listed: forms.reduce((n, f) => n + f.n, 0) };
}

/** Products listed on a hub (indexable, duplicates excluded): the count shown in titles and descriptions. */
export async function listedCount(type: HubType, key: string): Promise<number> {
  return (await getHubForms(type, key)).reduce((n, f) => n + f.n, 0);
}

/** Metadata-side twin of hubListState (no redirects, no list query). */
export function hubListMeta(params: Params) {
  const { filtered } = parseFilters(params, new Set(typeof params.form === 'string' ? [params.form] : []));
  return { filtered, page: parsePage(params.page) ?? 1 };
}
