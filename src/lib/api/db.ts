// Postgres pool for role api_app (API_DATABASE_URL): the web.* views plus the api schema.
// Kept apart from the website's web_reader pool (src/lib/db/pool.ts): different role,
// writes allowed (keys, usage), different limits.
import { Pool, types, type QueryResultRow } from 'pg';

types.setTypeParser(types.builtins.DATE, (value: string) => value);

declare global {
  var __apiPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.API_DATABASE_URL;
  if (!connectionString) throw new Error('API_DATABASE_URL is not set (see .env.example)');
  const ca = process.env.WEB_DATABASE_CA?.trim();
  return new Pool({
    connectionString,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: Math.min(15, Number(process.env.API_DB_POOL_MAX) || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'dwaprice-api',
  });
}

export function apiPool(): Pool {
  globalThis.__apiPool ??= createPool();
  return globalThis.__apiPool;
}

function isTransient(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return (
    ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(e.code ?? '') ||
    /timeout exceeded when trying to connect|Connection terminated (unexpectedly|due to connection timeout)/.test(e.message ?? '')
  );
}

export async function apiQuery<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await apiPool().query<T>(text, params)).rows;
    } catch (error) {
      if (attempt >= 2 || !isTransient(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 3 ** attempt));
    }
  }
}
