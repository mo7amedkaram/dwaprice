// Bulk export (Enterprise): POST /exports registers an export of the current dataset
// version and returns a signed download link valid one hour; the download streams the
// catalogue (plus the client's canary records) as CSV (UTF-8 BOM, flattened columns) or JSON.
// No object storage: the link is an HMAC-signed URL served by this app.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { clientCanaries } from './canaries';
import { apiQuery } from './db';
import { errors } from './errors';
import { apiHandler, apiSecret, jsonResponse, type Ctx } from './handler';
import { csvEscape, finalizeRecord, flattenForCsv, iso, type StateRow } from './records';

function baseUrl(ctx: Ctx): string {
  const env = process.env.API_BASE_URL?.replace(/\/$/, '');
  if (env) return env;
  const u = new URL(ctx.url);
  return `${u.origin}/api/v1`;
}

function signature(id: string, exp: number, clientId: string): string {
  return createHmac('sha256', apiSecret()).update(`${id}:${exp}:${clientId}`).digest('hex').slice(0, 32);
}

interface ExportRow {
  id: string;
  client_id: string;
  format: 'csv' | 'json';
  dataset_version: string | null;
  status: string;
  rows: number | null;
  created_at: Date;
  expires_at: Date;
}

function present(row: ExportRow, ctx: Ctx) {
  const exp = Math.floor(new Date(row.expires_at).getTime() / 1000);
  const live = row.status === 'ready' && exp * 1000 > Date.now();
  return {
    id: row.id,
    format: row.format,
    status: live ? 'ready' : row.status === 'ready' ? 'failed' : row.status,
    dataset_version: row.dataset_version,
    url: live ? `${baseUrl(ctx)}/exports/${row.id}/download?exp=${exp}&sig=${signature(row.id, exp, row.client_id)}` : null,
    expires_at: live ? iso(row.expires_at) : null,
    rows: row.rows,
  };
}

export const createExport = apiHandler({
  mode: 'auth',
  endpoint: 'exports:create',
  scope: 'export',
  feature: 'export',
  fn: async (ctx) => {
    let body: { format?: unknown } = {};
    try {
      body = await ctx.req.json();
    } catch {
      throw errors.validation('body must be JSON', [{ param: 'body', issue: 'invalid_json' }]);
    }
    if (body.format !== 'csv' && body.format !== 'json') throw errors.validation('format: must be csv or json', [{ param: 'format', issue: 'invalid' }]);
    const rows = Number(ctx.dataset.counts.drugs ?? 0) + 3;
    const inserted = await apiQuery<ExportRow>(
      `insert into api.exports (client_id, format, dataset_version, status, rows, expires_at)
       values ($1, $2, $3, 'ready', $4, now() + interval '1 hour') returning *`,
      [ctx.auth!.clientId, body.format, ctx.dataset.version, rows],
    );
    return { status: 202, body: { data: present(inserted[0], ctx) }, noCache: true };
  },
});

export const getExport = apiHandler<{ id: string }>({
  mode: 'auth',
  endpoint: 'exports:get',
  scope: 'export',
  feature: 'export',
  fn: async (ctx, { id }) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw errors.notFound('No export with that id');
    const rows = await apiQuery<ExportRow>('select * from api.exports where id = $1 and client_id = $2', [id, ctx.auth!.clientId]);
    if (!rows[0]) throw errors.notFound('No export with that id');
    return { body: { data: present(rows[0], ctx) }, noCache: true };
  },
});

/** Streams the dataset (signed URL; no key needed). */
export async function downloadExport(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  const deny = (why: string) => jsonResponse(403, { error: { code: 'forbidden', message: why, details: null } }, { 'Cache-Control': 'no-store' });
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isFinite(exp)) return deny('Invalid export link');
  const rows = await apiQuery<ExportRow>('select * from api.exports where id = $1', [id]);
  const row = rows[0];
  if (!row || row.status !== 'ready') return deny('Export not found or not ready');
  const expected = signature(id, exp, row.client_id);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return deny('Invalid export link');
  if (exp * 1000 < Date.now() || new Date(row.expires_at).getTime() < Date.now()) return deny('This export link has expired; request a new export');

  const canaries = await clientCanaries(row.client_id);
  const format = row.format;
  const version = row.dataset_version ?? 'current';
  const encoder = new TextEncoder();
  let headerColumns: string[] | null = null;
  let first = true;
  let lastId = '';
  let done = false;
  let canaryIndex = 0;
  const canaryAt = new Set([5, 1000, 9000].map((n) => n));
  let emitted = 0;

  const encodeRecord = (record: Record<string, unknown>): string => {
    if (format === 'json') {
      const s = (first ? '' : ',\n') + JSON.stringify(record);
      first = false;
      return s;
    }
    const flat = flattenForCsv(record);
    let out = '';
    if (!headerColumns) {
      headerColumns = Object.keys(flat);
      out += headerColumns.join(',') + '\r\n';
    }
    return out + headerColumns.map((c) => csvEscape(flat[c] ?? '')).join(',') + '\r\n';
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (format === 'json') controller.enqueue(encoder.encode(`{"dataset_version":${JSON.stringify(version)},"generated_at":${JSON.stringify(new Date().toISOString())},"data":[\n`));
      else controller.enqueue(encoder.encode('﻿'));
    },
    async pull(controller) {
      if (done) {
        controller.close();
        return;
      }
      const batch = await apiQuery<StateRow>(
        `select s.id, s.record, s.price, s.first_seen_at, s.last_changed_at, s.last_price_changed_at
         from api.drug_state s where s.is_current and s.id > $1 order by s.id limit 1000`,
        [lastId],
      );
      let chunk = '';
      for (const r of batch) {
        chunk += encodeRecord(finalizeRecord(r));
        emitted++;
        if (canaryAt.has(emitted) && canaryIndex < canaries.length) chunk += encodeRecord(canaries[canaryIndex++]);
      }
      if (batch.length < 1000) {
        while (canaryIndex < canaries.length) chunk += encodeRecord(canaries[canaryIndex++]);
        if (format === 'json') chunk += '\n]}\n';
        done = true;
        apiQuery('update api.exports set downloaded_at = now() where id = $1', [id]).catch(() => {});
      } else lastId = batch[batch.length - 1].id;
      controller.enqueue(encoder.encode(chunk));
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dwaprice-drugs-${version}.${format}"`,
      'Cache-Control': 'private, no-store',
      'X-Dataset-Version': version,
    },
  });
}
