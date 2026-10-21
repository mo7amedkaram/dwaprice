// The request pipeline shared by every /v1 endpoint: client address, authentication
// (or per-IP limits on the sample), rate limiting, the handler itself, the JSON envelope,
// ETag/304, cache headers, CORS on the sample, usage accounting after the response.
import { createHash, randomBytes } from 'node:crypto';
import { after, type NextRequest } from 'next/server';
import { authenticate, requireFeature, requireScope, sampleLimits, type AuthContext } from './auth';
import { getDataset, meta, type Dataset } from './dataset';
import { ApiError, errorBody, errors } from './errors';
import { clientIp, ipPrefix } from './net';
import { hit, type Hit } from './ratelimit';
import { recordUsage, sanitizeParams } from './usage';

export type Mode = 'auth' | 'sample' | 'open';

export interface Ctx {
  req: NextRequest;
  url: URL;
  sp: URLSearchParams;
  sample: boolean;
  auth: AuthContext | null;
  dataset: Dataset;
  ip: string;
  ipPrefix: string;
  requestId: string;
  secret: string;
}

export interface Result {
  status?: number;
  body: object;
  headers?: Record<string, string>;
  /** Drug id fetched by id (scraping detection). */
  drugId?: string | null;
  /** Skip the in-memory cache (exports, mutations). */
  noCache?: boolean;
  /** Usage label override (e.g. "drugs:list:all" for an unfiltered listing). */
  endpoint?: string;
}

export interface HandlerOptions<P> {
  mode: Mode;
  /** Usage endpoint label, e.g. "drugs:list". */
  endpoint: string;
  scope?: string;
  feature?: 'export' | 'webhooks';
  fn: (ctx: Ctx, params: P) => Promise<Result>;
}

const SAMPLE_CACHE = 'public, s-maxage=300, stale-while-revalidate=3600';
const AUTH_CACHE = 'private, max-age=60';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Sample, X-Request-Id',
  'Access-Control-Max-Age': '86400',
};

/**
 * Signing secret for cursors, export links and session cookies. Required in production (every
 * server instance must share it); a random per-process value only in development.
 */
let devSecret: string | null = null;
export function apiSecret(): string {
  const s = process.env.API_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('API_SECRET must be set (>= 32 characters) in production');
  devSecret ??= randomBytes(32).toString('hex');
  return devSecret;
}

// In-memory response cache (60 s, keyed by dataset version): identical bursts cost one query.
const responseCache = new Map<string, { body: string; etag: string; status: number; exp: number }>();
const CACHE_TTL = 60_000;
export function clearResponseCache(): void {
  responseCache.clear();
}

function etagOf(body: string): string {
  return `"${createHash('sha1').update(body).digest('base64url').slice(0, 27)}"`;
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export function apiHandler<P = Record<string, never>>(opts: HandlerOptions<P>) {
  return async (req: NextRequest, context?: { params: Promise<P> }): Promise<Response> => {
    const started = performance.now();
    const requestId = `req_${randomBytes(6).toString('base64url')}`;
    const url = new URL(req.url);
    const ip = clientIp(req.headers);
    const prefix = ipPrefix(ip);
    const sample = opts.mode === 'sample';
    const rl: Record<string, string> = {};
    let auth: AuthContext | null = null;
    let status = 500;
    let drugId: string | null | undefined;
    let endpoint = opts.endpoint;

    const finish = (res: Response) => {
      status = res.status;
      after(() =>
        recordUsage({
          keyId: auth?.keyId ?? null,
          clientId: auth?.clientId ?? null,
          endpoint,
          method: req.method,
          path: url.pathname,
          params: sanitizeParams(url.searchParams),
          status,
          durationMs: Math.round(performance.now() - started),
          ipPrefix: prefix,
          userAgent: req.headers.get('user-agent'),
          requestId,
          drugId,
        }),
      );
      return res;
    };
    const fail = (e: ApiError) =>
      finish(jsonResponse(e.status, errorBody(e), { ...rl, ...e.headers, ...(sample ? CORS : {}), 'Cache-Control': 'no-store', 'X-Request-Id': requestId }));

    try {
      // 1. identity and limits
      if (opts.mode === 'auth') {
        auth = await authenticate(req.headers, ip);
        if (opts.scope) requireScope(auth, opts.scope);
        if (opts.feature) requireFeature(auth, opts.feature, opts.feature === 'export' ? 'Bulk export' : 'Webhooks');
        const hits: Hit[] = [{ scope: `key:${auth.keyId}:m`, window: 'minute' }];
        if (auth.plan.monthly_quota !== null) hits.push({ scope: `key:${auth.keyId}:q`, window: 'month' });
        const [minute, month] = await hit(hits);
        rl['X-RateLimit-Limit'] = String(auth.plan.rpm);
        rl['X-RateLimit-Remaining'] = String(Math.max(0, auth.plan.rpm - minute.count));
        rl['X-RateLimit-Reset'] = String(minute.reset);
        if (month) {
          rl['X-Quota-Limit'] = String(auth.plan.monthly_quota);
          rl['X-Quota-Remaining'] = String(Math.max(0, auth.plan.monthly_quota! - month.count));
          rl['X-Quota-Reset'] = String(month.reset);
        }
        if (minute.count > auth.plan.rpm) throw errors.rateLimited(auth.plan.rpm, Math.max(1, minute.reset - Math.floor(Date.now() / 1000)));
        if (month && auth.plan.monthly_quota !== null && month.count > auth.plan.monthly_quota && auth.plan.id !== 'enterprise') {
          throw errors.quotaExceeded(auth.plan.monthly_quota, new Date(month.reset * 1000));
        }
      } else if (sample) {
        const limits = await sampleLimits();
        const [minute, day] = await hit([
          { scope: `ip:${prefix}:m`, window: 'minute' },
          { scope: `ip:${prefix}:d`, window: 'day' },
        ]);
        rl['X-RateLimit-Limit'] = String(limits.rpm);
        rl['X-RateLimit-Remaining'] = String(Math.max(0, limits.rpm - minute.count));
        rl['X-RateLimit-Reset'] = String(minute.reset);
        rl['X-Sample'] = 'true';
        if (minute.count > limits.rpm) throw errors.rateLimited(limits.rpm, Math.max(1, minute.reset - Math.floor(Date.now() / 1000)));
        if (day.count > limits.daily) throw new ApiError(429, 'rate_limited', `Sample limit of ${limits.daily} requests per day exceeded`, { retry_after: day.reset - Math.floor(Date.now() / 1000) }, { 'Retry-After': String(day.reset - Math.floor(Date.now() / 1000)) });
      }

      // 2. the handler (with the response cache for GETs)
      const dataset = await getDataset();
      const params = context ? await context.params : ({} as P);
      const cacheKey = req.method === 'GET' ? `${dataset.version}|${opts.mode}|${auth?.plan.id ?? ''}|${url.pathname}?${url.searchParams.toString()}` : null;
      let out = cacheKey ? responseCache.get(cacheKey) : undefined;
      if (out && out.exp < Date.now()) out = undefined;
      let extraHeaders: Record<string, string> = {};
      if (!out) {
        const ctx: Ctx = { req, url, sp: url.searchParams, sample, auth, dataset, ip, ipPrefix: prefix, requestId, secret: apiSecret() };
        const result = await opts.fn(ctx, params);
        drugId = result.drugId;
        if (result.endpoint) endpoint = result.endpoint;
        const body = JSON.stringify({ ...result.body, ...(sample ? { sample: true } : {}), meta: meta(dataset) });
        out = { body, etag: etagOf(body), status: result.status ?? 200, exp: Date.now() + CACHE_TTL };
        extraHeaders = result.headers ?? {};
        if (cacheKey && out.status === 200 && !result.noCache) {
          if (responseCache.size > 2000) responseCache.clear();
          responseCache.set(cacheKey, out);
        }
      }

      // 3. the response
      const headers: Record<string, string> = {
        ...rl,
        ...extraHeaders,
        ...(sample ? CORS : {}),
        ETag: out.etag,
        'Cache-Control': sample ? SAMPLE_CACHE : opts.mode === 'auth' ? AUTH_CACHE : 'no-store',
        Vary: 'Authorization, Accept-Encoding',
        'X-Request-Id': requestId,
      };
      if (out.status === 200 && req.headers.get('if-none-match') === out.etag) return finish(new Response(null, { status: 304, headers }));
      if (out.status === 204) return finish(new Response(null, { status: 204, headers }));
      return finish(new Response(out.body, { status: out.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } }));
    } catch (error) {
      if (error instanceof ApiError) return fail(error);
      console.error(`[api ${requestId}] ${req.method} ${url.pathname}`, error);
      const e = error as { code?: string; message?: string };
      const dbDown = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', '57P01', '53300'].includes(e.code ?? '') || /timeout exceeded when trying to connect/.test(e.message ?? '');
      return fail(dbDown ? errors.unavailable(requestId) : errors.internal(requestId));
    }
  };
}
