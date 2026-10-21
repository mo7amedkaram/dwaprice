// Postgres pool for the read-only role web_reader (part 1). No `server-only`
// import here because proxy.ts (Node runtime, outside React) also uses it;
// application code imports it through ./index.ts, which is server-only.
import { Pool, types, type QueryResultRow } from 'pg';

// DATE columns stay "YYYY-MM-DD" strings: pg would otherwise build a Date at
// local midnight, which shifts the day when serialised to UTC (Cairo is UTC+2/+3).
types.setTypeParser(types.builtins.DATE, (value: string) => value);

declare global {
  var __webPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.WEB_DATABASE_URL;
  if (!connectionString) {
    throw new Error('WEB_DATABASE_URL is not set (see .env.example)');
  }
  const ca = process.env.WEB_DATABASE_CA?.trim();
  return new Pool({
    connectionString,
    // Supavisor terminates TLS with Supabase's own CA. Verify it when the CA is
    // provided; otherwise the link is encrypted but the certificate unchecked.
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    // Per process. 3 for builds (3 workers, next.config.ts); a single `next start`
    // may use more (WEB_DB_POOL_MAX), within the role's connection limit (20).
    max: Math.min(15, Number(process.env.WEB_DB_POOL_MAX) || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'dwaprice-web',
  });
}

export function pool(): Pool {
  // Reuse one pool per process (also across dev hot reloads).
  globalThis.__webPool ??= createPool();
  return globalThis.__webPool;
}

/** Network-level failures worth retrying (DNS, connect timeout, dropped socket) — never query errors. */
function isTransient(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(e.code ?? '') ||
    /timeout exceeded when trying to connect|Connection terminated (unexpectedly|due to connection timeout)/.test(e.message ?? '')
  );
}

/** Runs a parameterised query against the web.* views (2 retries on transient network errors). */
export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await pool().query<T>(text, params);
      return result.rows;
    } catch (error) {
      if (attempt >= 2 || !isTransient(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 3 ** attempt));
    }
  }
}
