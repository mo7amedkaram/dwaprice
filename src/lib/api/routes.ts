// Endpoint definitions of /v1 (real and sample variants share the same code; the sample
// flag restricts every query to api.sample_drugs). Route files under src/app/api/v1 only
// re-export these.
import { apiQuery } from './db';
import { errors } from './errors';
import { apiHandler, type Ctx, type Mode } from './handler';
import { drugExists, getAlternatives, getDrug, getDrugsByBarcode, getPriceChanges, getPriceHistory, listCompanies, listDrugs, listIngredients } from './drugs';
import { parseBarcode, parseEventTypes, parseId, parseLimit, parseListParams, parseNamePrefix, parseTimestamp } from './params';

export const API_VERSION = '1.0.0';
export const DOCS_URL = 'https://dwaprice.com/api/docs';

const mode = (sample: boolean): Mode => (sample ? 'sample' : 'auth');
const label = (sample: boolean, name: string) => (sample ? `sample:${name}` : name);

/** Absolute URL of a sibling resource on the canonical API base (API_BASE_URL), else the request's host. */
function siblingUrl(ctx: Ctx, lastSegment: string): string {
  const base = process.env.API_BASE_URL?.replace(/\/$/, '');
  const u = new URL(ctx.url);
  const path = u.pathname.replace(/^\/api\/v1/, '').replace(/[^/]+$/, encodeURIComponent(lastSegment));
  return base ? `${base}${path}` : `${u.origin}/api/v1${path}`;
}

export const drugsList = (sample: boolean) =>
  apiHandler({
    mode: mode(sample),
    endpoint: label(sample, 'drugs:list'),
    scope: 'drugs:read',
    fn: async (ctx) => {
      const { filters, limit } = parseListParams(ctx.sp);
      const page = await listDrugs(filters, ctx.sp.get('cursor'), limit, sample, ctx.secret);
      const unfiltered = Object.entries(filters).every(([k, v]) => k === 'sort' || v === null);
      return { body: page, endpoint: unfiltered ? label(sample, 'drugs:list:all') : undefined };
    },
  });

export const drugGet = (sample: boolean) =>
  apiHandler<{ id: string }>({
    mode: mode(sample),
    endpoint: label(sample, 'drugs:get'),
    scope: 'drugs:read',
    fn: async (ctx, { id }) => {
      const pid = parseId(id);
      const r = await getDrug(pid, sample);
      if (r.kind === 'found') return { body: { data: r.record }, drugId: pid };
      if (r.kind === 'moved') throw errors.moved(r.newId, siblingUrl(ctx, r.newId));
      throw errors.notFound(`No drug with id "${pid}"`);
    },
  });

export const drugsByBarcode = (sample: boolean) =>
  apiHandler<{ barcode: string }>({
    mode: mode(sample),
    endpoint: label(sample, 'drugs:barcode'),
    scope: 'drugs:read',
    fn: async (_ctx, { barcode }) => ({ body: { data: await getDrugsByBarcode(parseBarcode(barcode), sample) } }),
  });

export const drugAlternatives = (sample: boolean) =>
  apiHandler<{ id: string }>({
    mode: mode(sample),
    endpoint: label(sample, 'drugs:alternatives'),
    scope: 'drugs:read',
    fn: async (ctx, { id }) => {
      const pid = parseId(id);
      const strengthRaw = ctx.sp.get('strength') ?? 'same';
      if (strengthRaw !== 'same' && strengthRaw !== 'any') throw errors.validation('strength: must be same or any', [{ param: 'strength', issue: 'invalid' }]);
      const limit = parseLimit(ctx.sp.get('limit'), 50);
      if (!(await drugExists(pid, sample))) throw errors.notFound(`No drug with id "${pid}"`);
      const page = await getAlternatives(pid, strengthRaw, limit, ctx.sp.get('cursor'), sample, ctx.secret);
      return { body: { data: page.data, drug_id: pid, page: page.page }, drugId: pid };
    },
  });

export const drugPriceHistory = (sample: boolean) =>
  apiHandler<{ id: string }>({
    mode: mode(sample),
    endpoint: label(sample, 'drugs:history'),
    scope: 'drugs:read',
    fn: async (_ctx, { id }) => {
      const pid = parseId(id);
      if (!(await drugExists(pid, sample))) throw errors.notFound(`No drug with id "${pid}"`);
      return { body: { data: await getPriceHistory(pid), drug_id: pid }, drugId: pid };
    },
  });

export const priceChanges = (sample: boolean) =>
  apiHandler({
    mode: mode(sample),
    endpoint: label(sample, 'changes'),
    scope: 'changes:read',
    fn: async (ctx) => {
      const since = parseTimestamp('since', ctx.sp.get('since'));
      const types = parseEventTypes(ctx.sp.get('type'));
      const limit = parseLimit(ctx.sp.get('limit'));
      const windowDays = ctx.auth?.plan.feed_window_days ?? 7;
      const feed = await getPriceChanges(since, types, limit, ctx.sp.get('cursor'), sample, ctx.secret, windowDays);
      return { body: { data: feed.data, page: feed.page, latest_detected_at: feed.latest_detected_at } };
    },
  });

export const companies = (sample: boolean) =>
  apiHandler({
    mode: mode(sample),
    endpoint: label(sample, 'companies'),
    scope: 'drugs:read',
    fn: async (ctx) => ({ body: await listCompanies(parseNamePrefix(ctx.sp.get('q')), parseLimit(ctx.sp.get('limit')), ctx.sp.get('cursor'), sample, ctx.secret) }),
  });

export const ingredients = (sample: boolean) =>
  apiHandler({
    mode: mode(sample),
    endpoint: label(sample, 'ingredients'),
    scope: 'drugs:read',
    fn: async (ctx) => ({ body: await listIngredients(parseNamePrefix(ctx.sp.get('q')), parseLimit(ctx.sp.get('limit')), ctx.sp.get('cursor'), sample, ctx.secret) }),
  });

async function sampleCounts(): Promise<Record<string, number>> {
  const rows = await apiQuery<Record<string, string>>(
    `select count(*) as drugs, count(*) filter (where s.price > 0) as priced, count(*) filter (where s.verified) as verified,
            count(*) filter (where s.barcode is not null) as with_barcode,
            (select count(distinct c) from api.drug_state x join api.sample_drugs d on d.id = x.id, unnest(x.company_ids) c) as companies,
            (select count(distinct i) from api.drug_state x join api.sample_drugs d on d.id = x.id, unnest(x.ingredient_ids) i) as ingredients,
            count(distinct s.record->'category'->>'id') as categories
     from api.drug_state s join api.sample_drugs d on d.id = s.id`,
  );
  return Object.fromEntries(Object.entries(rows[0] ?? {}).map(([k, v]) => [k, Number(v)]));
}

export const metaEndpoint = (sample: boolean) =>
  apiHandler({
    mode: mode(sample),
    endpoint: label(sample, 'meta'),
    fn: async (ctx) => ({
      body: {
        data: {
          dataset_version: ctx.dataset.version,
          updated_at: ctx.dataset.captured_at,
          last_price_change_at: ctx.dataset.last_price_change_at,
          last_price_list_date: ctx.dataset.last_price_list_date,
          counts: sample ? await sampleCounts() : ctx.dataset.counts,
          api_version: API_VERSION,
          docs_url: DOCS_URL,
        },
      },
    }),
  });
