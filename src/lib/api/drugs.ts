// Data access of the catalogue endpoints: api.drug_state (records), web.drug_alternatives,
// web.drug_price_history, api.events, web.companies / web.ingredients. Every query takes a
// `sample` flag that restricts it to api.sample_drugs by construction.
import { apiQuery } from './db';
import { decodeCursor, decodeFeedCursor, encodeCursor, encodeFeedCursor } from './cursor';
import { errors } from './errors';
import { filterFingerprint, LIMIT_MAX, SEARCH_RESULTS_MAX, type DrugFilters, type EventType } from './params';
import { finalizeRecord, iso, type StateRow } from './records';

const SAMPLE = 'and s.id in (select id from api.sample_drugs)';

const STATE_COLUMNS = 's.id, s.record, s.price, s.first_seen_at, s.last_changed_at, s.last_price_changed_at, s.is_current, s.superseded_by';

export interface Page<T> {
  data: T[];
  page: { limit: number; has_more: boolean; next_cursor: string | null };
}

// ---------------------------------------------------------------- drugs: list / search

function whereClauses(f: DrugFilters, sample: boolean, params: unknown[]): string[] {
  const where = ['s.is_current'];
  if (sample) where.push('s.id in (select id from api.sample_drugs)');
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.company) add('s.company_ids @> array[?::text]', f.company);
  if (f.ingredient) add('s.ingredient_ids @> array[?::text]', f.ingredient);
  if (f.atc) add('s.atc_prefixes @> array[?::text]', f.atc);
  if (f.dosage_form) add('s.form_class = ?', f.dosage_form);
  if (f.route) add('s.route_class = ?', f.route);
  if (f.prescription_status) add('s.rx = ?', f.prescription_status);
  if (f.status) add('s.status = ?', f.status);
  if (f.has_barcode === true) where.push('s.barcode is not null');
  if (f.has_barcode === false) where.push('s.barcode is null');
  if (f.updated_since) add('s.last_changed_at > ?::timestamptz', f.updated_since);
  return where;
}

const SORT_SQL = {
  name: { order: 's.name_sort asc, s.id asc', key: (r: SortRow) => [r.name_sort, r.id], cond: (p: number) => `(s.name_sort, s.id) > ($${p}, $${p + 1})` },
  price: { order: 's.price asc nulls last, s.id asc', key: (r: SortRow) => [r.price, r.id], cond: (p: number) => `((s.price > $${p}::numeric) or (s.price = $${p}::numeric and s.id > $${p + 1}) or ($${p}::numeric is null and s.price is null and s.id > $${p + 1}) or ($${p}::numeric is not null and s.price is null))` },
  '-price': { order: 's.price desc nulls last, s.id asc', key: (r: SortRow) => [r.price, r.id], cond: (p: number) => `((s.price < $${p}::numeric) or (s.price = $${p}::numeric and s.id > $${p + 1}) or ($${p}::numeric is null and s.price is null and s.id > $${p + 1}) or ($${p}::numeric is not null and s.price is null))` },
  updated_at: { order: 's.last_changed_at asc, s.id asc', key: (r: SortRow) => [iso(r.last_changed_at), r.id], cond: (p: number) => `(s.last_changed_at, s.id) > ($${p}::timestamptz, $${p + 1})` },
  '-updated_at': { order: 's.last_changed_at desc, s.id asc', key: (r: SortRow) => [iso(r.last_changed_at), r.id], cond: (p: number) => `(s.last_changed_at < $${p}::timestamptz) or (s.last_changed_at = $${p}::timestamptz and s.id > $${p + 1})` },
} as const;

type SortRow = StateRow & { name_sort: string; last_changed_at: string | Date; price: string | null };

export async function listDrugs(f: DrugFilters, cursor: string | null, limit: number, sample: boolean, secret: string): Promise<Page<Record<string, unknown>>> {
  const fingerprint = filterFingerprint(sample ? 'sample-drugs' : 'drugs', f);
  if (f.q) return searchDrugs(f, cursor, limit, sample, secret, fingerprint);
  const params: unknown[] = [];
  const where = whereClauses(f, sample, params);
  const sort = SORT_SQL[f.sort];
  if (cursor) {
    const c = decodeCursor(cursor, fingerprint, secret);
    if (!c) throw errors.invalidCursor();
    const [k1, k2] = c.k;
    params.push(k1, k2);
    where.push(sort.cond(params.length - 1));
  }
  params.push(limit + 1);
  const rows = await apiQuery<SortRow>(
    `select ${STATE_COLUMNS}, s.name_sort from api.drug_state s where ${where.join(' and ')} order by ${sort.order} limit $${params.length}`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: page.map(finalizeRecord),
    page: { limit, has_more: hasMore, next_cursor: hasMore && last ? encodeCursor({ f: fingerprint, k: sort.key(last) }, secret) : null },
  };
}

/** Ranked search: web.search_drugs (real) or a normalised substring match inside the sample. */
async function searchDrugs(f: DrugFilters, cursor: string | null, limit: number, sample: boolean, secret: string, fingerprint: string): Promise<Page<Record<string, unknown>>> {
  let offset = 0;
  if (cursor) {
    const c = decodeCursor(cursor, fingerprint, secret);
    if (!c || typeof c.k[0] !== 'number') throw errors.invalidCursor();
    offset = c.k[0];
  }
  const params: unknown[] = [];
  const where = whereClauses(f, sample, params);
  let ids: string[];
  if (sample) {
    // Matching happens only inside the 50 sample records (a non-sample product can never appear):
    // normalised substring, or the same consonant skeleton (vowel letters dropped on both sides).
    params.push(f.q);
    const rows = await apiQuery<{ id: string }>(
      `select s.id from api.drug_state s
       where ${where.join(' and ')}
         and (s.search_text like '%' || web.search_normalize($${params.length}) || '%'
              or web.search_skeleton(s.search_text) like '%' || web.search_skeleton(web.search_normalize($${params.length})) || '%')
       order by s.name_sort, s.id`,
      params,
    );
    ids = rows.map((r) => r.id);
  } else {
    // web.search_drugs ranks across the whole catalogue in pages of 50 (its cap); the API page
    // is up to 100 rows, so up to two calls, then the filters are applied to the ranked ids.
    const want = Math.min(SEARCH_RESULTS_MAX, offset + limit + 1);
    const ranked: string[] = [];
    for (let off = 0; off < want; off += 50) {
      const rows = await apiQuery<{ slug: string }>('select slug from web.search_drugs($1, 50, $2)', [f.q, off]);
      ranked.push(...rows.map((r) => r.slug));
      if (rows.length < 50) break;
    }
    if (ranked.length === 0) ids = [];
    else {
      params.push(ranked);
      const rows = await apiQuery<{ id: string }>(`select s.id from api.drug_state s where ${where.join(' and ')} and s.id = any($${params.length}::text[])`, params);
      const keep = new Set(rows.map((r) => r.id));
      ids = ranked.filter((id) => keep.has(id));
    }
  }
  const slice = ids.slice(offset, offset + limit + 1);
  const hasMore = slice.length > limit;
  const pageIds = slice.slice(0, limit);
  const records = pageIds.length ? await apiQuery<StateRow>(`select ${STATE_COLUMNS} from api.drug_state s where s.id = any($1::text[])`, [pageIds]) : [];
  const byId = new Map(records.map((r) => [r.id, r]));
  return {
    data: pageIds.map((id) => byId.get(id)).filter((r): r is StateRow => !!r).map(finalizeRecord),
    page: { limit, has_more: hasMore && offset + limit < SEARCH_RESULTS_MAX, next_cursor: hasMore && offset + limit < SEARCH_RESULTS_MAX ? encodeCursor({ f: fingerprint, k: [offset + limit] }, secret) : null },
  };
}

// ---------------------------------------------------------------- drugs: by id, barcode

export type DrugLookup = { kind: 'found'; record: Record<string, unknown> } | { kind: 'moved'; newId: string } | { kind: 'missing' };

export async function getDrug(id: string, sample: boolean): Promise<DrugLookup> {
  const rows = await apiQuery<StateRow>(`select ${STATE_COLUMNS} from api.drug_state s where s.id = $1 ${sample ? SAMPLE : ''}`, [id]);
  const row = rows[0];
  if (row && row.is_current) return { kind: 'found', record: finalizeRecord(row) };
  if (row && row.superseded_by) return { kind: 'moved', newId: row.superseded_by };
  if (!sample) {
    // retired slugs not yet seen by the capture job
    const l = await apiQuery<{ current_slug: string }>(`select current_slug from web.slug_lookup where entity_type = 'drug' and slug = $1 and not is_current and current_slug is not null`, [id]);
    if (l[0]) return { kind: 'moved', newId: l[0].current_slug };
  }
  return { kind: 'missing' };
}

export async function getDrugsByBarcode(barcode: string, sample: boolean): Promise<Record<string, unknown>[]> {
  const rows = await apiQuery<StateRow>(
    `select ${STATE_COLUMNS} from api.drug_state s where s.barcode = $1 and s.is_current ${sample ? SAMPLE : ''}
     order by (s.status = 'listed') desc, s.effective_date desc nulls last, s.id`,
    [barcode],
  );
  return rows.map(finalizeRecord);
}

export async function drugExists(id: string, sample: boolean): Promise<boolean> {
  const rows = await apiQuery<{ ok: boolean }>(`select true as ok from api.drug_state s where s.id = $1 and s.is_current ${sample ? SAMPLE : ''}`, [id]);
  return rows.length > 0;
}

// ---------------------------------------------------------------- alternatives

export async function getAlternatives(id: string, strength: 'same' | 'any', limit: number, cursor: string | null, sample: boolean, secret: string): Promise<Page<Record<string, unknown>>> {
  const fingerprint = filterFingerprint(sample ? 'sample-alternatives' : 'alternatives', { id, strength });
  let offset = 0;
  if (cursor) {
    const c = decodeCursor(cursor, fingerprint, secret);
    if (!c || typeof c.k[0] !== 'number') throw errors.invalidCursor();
    offset = c.k[0];
  }
  const rows = await apiQuery<StateRow & { match_type: string; same_form: boolean; same_product: boolean; price_diff: string | null; unit_price_diff_pct: string | null }>(
    `select ${STATE_COLUMNS}, a.match_type, a.same_form, a.price_diff, a.unit_price_diff_pct,
            exists (select 1 from web.product_group_members g1 join web.product_group_members g2 on g2.group_key = g1.group_key
                    where g1.slug = a.slug and g2.slug = a.alt_slug) as same_product
     from web.drug_alternatives a
     join api.drug_state s on s.id = a.alt_slug and s.is_current
     where a.slug = $1 and ($2 or a.match_type = 'SAME_INGREDIENTS_SAME_STRENGTH') ${sample ? SAMPLE : ''}
     order by (a.match_type = 'SAME_INGREDIENTS_SAME_STRENGTH') desc, s.price asc nulls last, s.id
     limit $3 offset $4`,
    [id, strength === 'any', limit + 1, offset],
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    data: page.map((r) => ({
      ...finalizeRecord(r),
      match: r.match_type === 'SAME_INGREDIENTS_SAME_STRENGTH' ? 'same_strength' : 'other_strength',
      same_form: r.same_form,
      same_product: r.same_product,
      price_diff: r.price_diff === null ? null : Number(r.price_diff),
      unit_price_diff_pct: r.unit_price_diff_pct === null ? null : Number(r.unit_price_diff_pct),
    })),
    page: { limit, has_more: hasMore, next_cursor: hasMore ? encodeCursor({ f: fingerprint, k: [offset + limit] }, secret) : null },
  };
}

// ---------------------------------------------------------------- price history

export interface PricePoint {
  price: number;
  effective_date: string | null;
  recorded_at: string | null;
  source: 'catalog' | 'change_log';
}

export async function getPriceHistory(id: string): Promise<PricePoint[]> {
  const [catalog, events] = await Promise.all([
    apiQuery<{ price: string; effective_date: string | null }>(
      `select price, effective_date from (select price, effective_date, row_number() over () as n from web.drug_price_history where slug = $1) h
       order by effective_date asc nulls first, n`,
      [id],
    ),
    apiQuery<{ detected_at: Date; data: { new: number; effective_date: string | null } }>(
      `select detected_at, data from api.events where drug_id = $1 and type = 'price_changed' order by id`,
      [id],
    ),
  ]);
  const points: PricePoint[] = [];
  for (const c of catalog) {
    const price = Number(c.price);
    const last = points[points.length - 1];
    if (last && last.price === price && last.effective_date === c.effective_date) continue;
    points.push({ price, effective_date: c.effective_date, recorded_at: null, source: 'catalog' });
  }
  for (const e of events) {
    const price = Number(e.data.new);
    const last = points[points.length - 1];
    if (last && last.price === price) continue;
    points.push({ price, effective_date: e.data.effective_date ?? null, recorded_at: iso(e.detected_at), source: 'change_log' });
  }
  return points;
}

// ---------------------------------------------------------------- delta feed

export interface FeedPage {
  data: Record<string, unknown>[];
  page: { limit: number; has_more: boolean; next_cursor: string | null };
  latest_detected_at: string | null;
}

/**
 * Events with detected_at >= since (inclusive: every event of one capture run shares the
 * run's timestamp, so a client resuming from `latest_detected_at` must still see the rest of
 * that run; already-applied ids are skipped by the client), ordered by id. The cursor carries
 * the `since` of the first request, so the next pages need only the cursor.
 */
export async function getPriceChanges(sinceParam: string | null, types: EventType[] | null, limit: number, cursor: string | null, sample: boolean, secret: string, windowDays: number): Promise<FeedPage> {
  const fingerprint = filterFingerprint(sample ? 'sample-changes' : 'changes', { types });
  let afterId = 0;
  let since = sinceParam;
  if (cursor) {
    const c = decodeFeedCursor(cursor, fingerprint, secret);
    if (!c) throw errors.invalidCursor();
    afterId = c.afterId;
    since = c.since;
  } else if (!since) {
    throw errors.validation('since is required (or a cursor)', [{ param: 'since', issue: 'required' }]);
  }
  if (new Date(since!).getTime() < Date.now() - windowDays * 86_400_000) throw errors.sinceTooOld(windowDays);
  const params: unknown[] = [since, afterId, limit + 1];
  let typeSql = '';
  if (types) {
    params.push(types);
    typeSql = `and e.type = any($${params.length}::text[])`;
  }
  const rows = await apiQuery<{ id: string; type: string; detected_at: Date; drug_id: string; data: Record<string, unknown>; s_id: string | null; record: Record<string, unknown> | null; price: string | null; first_seen_at: Date; last_changed_at: Date; last_price_changed_at: Date | null; is_current: boolean }>(
    `select e.id, e.type, e.detected_at, e.drug_id, e.data,
            s.id as s_id, s.record, s.price, s.first_seen_at, s.last_changed_at, s.last_price_changed_at, s.is_current
     from api.events e
     left join api.drug_state s on s.id = e.drug_id
     where e.detected_at >= $1::timestamptz and e.id > $2 ${typeSql} ${sample ? 'and e.drug_id in (select id from api.sample_drugs)' : ''}
     order by e.id
     limit $3`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({
      id: Number(r.id),
      type: r.type,
      detected_at: iso(r.detected_at),
      drug_id: r.drug_id,
      data: r.data,
      drug: r.s_id && r.is_current && r.record ? finalizeRecord({ id: r.s_id, record: r.record, price: r.price, first_seen_at: r.first_seen_at, last_changed_at: r.last_changed_at, last_price_changed_at: r.last_price_changed_at }) : null,
    })),
    page: { limit, has_more: hasMore, next_cursor: hasMore && last ? encodeFeedCursor(fingerprint, Number(last.id), since!, secret) : null },
    latest_detected_at: last ? iso(last.detected_at) : null,
  };
}

// ---------------------------------------------------------------- companies, ingredients

export async function listCompanies(q: string | null, limit: number, cursor: string | null, sample: boolean, secret: string): Promise<Page<Record<string, unknown>>> {
  const fingerprint = filterFingerprint(sample ? 'sample-companies' : 'companies', { q });
  const params: unknown[] = [];
  const where: string[] = [];
  if (sample) where.push('c.slug in (select unnest(s.company_ids) from api.drug_state s join api.sample_drugs d on d.id = s.id)');
  else where.push('c.product_count > 0');
  if (q) {
    params.push(`${q.toLowerCase()}%`);
    where.push(`lower(c.name_en) like $${params.length}`);
  }
  if (cursor) {
    const c = decodeCursor(cursor, fingerprint, secret);
    if (!c) throw errors.invalidCursor();
    params.push(c.k[0], c.k[1]);
    where.push(`(lower(c.name_en), c.slug) > ($${params.length - 1}, $${params.length})`);
  }
  params.push(limit + 1);
  const rows = await apiQuery<{ slug: string; name_en: string; product_count: string }>(
    `select c.slug, c.name_en, c.product_count from web.companies c where ${where.join(' and ')} order by lower(c.name_en), c.slug limit $${params.length}`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({ id: r.slug, name: r.name_en, product_count: Number(r.product_count) })),
    page: { limit, has_more: hasMore, next_cursor: hasMore && last ? encodeCursor({ f: fingerprint, k: [last.name_en.toLowerCase(), last.slug] }, secret) : null },
  };
}

export async function listIngredients(q: string | null, limit: number, cursor: string | null, sample: boolean, secret: string): Promise<Page<Record<string, unknown>>> {
  const fingerprint = filterFingerprint(sample ? 'sample-ingredients' : 'ingredients', { q });
  const params: unknown[] = [];
  const where: string[] = ['i.product_count > 0'];
  if (sample) where.push('i.slug in (select unnest(s.ingredient_ids) from api.drug_state s join api.sample_drugs d on d.id = s.id)');
  if (q) {
    params.push(`${q.toLowerCase()}%`, `${q}%`);
    where.push(`(lower(i.name_en) like $${params.length - 1} or i.name_ar like $${params.length})`);
  }
  if (cursor) {
    const c = decodeCursor(cursor, fingerprint, secret);
    if (!c) throw errors.invalidCursor();
    params.push(c.k[0], c.k[1]);
    where.push(`(lower(coalesce(i.name_en, i.slug)), i.slug) > ($${params.length - 1}, $${params.length})`);
  }
  params.push(limit + 1);
  const rows = await apiQuery<{ slug: string; name_en: string | null; name_ar: string | null; product_count: string }>(
    `select i.slug, i.name_en, i.name_ar, i.product_count from web.ingredients i where ${where.join(' and ')}
     order by lower(coalesce(i.name_en, i.slug)), i.slug limit $${params.length}`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({ id: r.slug, name_en: r.name_en, name_ar: r.name_ar, product_count: Number(r.product_count) })),
    page: { limit, has_more: hasMore, next_cursor: hasMore && last ? encodeCursor({ f: fingerprint, k: [(last.name_en ?? last.slug).toLowerCase(), last.slug] }, secret) : null },
  };
}

export const LIMITS = { max: LIMIT_MAX };
