import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // microphone=(self): voice search (SearchBox) asks for the microphone; it stays off for embedded frames.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
];

/**
 * File name of the browser suggestion index written by scripts/build-search-index.mts
 * (npm run build runs it first). Inlined into the bundles as NEXT_PUBLIC_SEARCH_INDEX so
 * every page points at the current hashed file; '' (no index built) = server suggestions only.
 */
function searchIndexFile(): string {
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'data', 'search-index', 'manifest.json'), 'utf8')) as { file?: string };
    return typeof manifest.file === 'string' ? manifest.file : '';
  } catch {
    return '';
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server (.next/standalone/server.js) for the VPS deploy (DEPLOY.md).
  // .next/static and openapi.yaml are copied next to it by .github/workflows/deploy.yml.
  output: 'standalone',
  // Commit of this build, inlined at build time and reported by /api/health so the
  // deploy script can tell the new release from the one it replaces.
  env: { COMMIT_SHA: process.env.GITHUB_SHA ?? '', NEXT_PUBLIC_SEARCH_INDEX: searchIndexFile() },
  // pg is a server-only dependency; keep it out of the bundler.
  serverExternalPackages: ['pg'],
  // Build workers each hold a small pg pool (lib/db/pool.ts, max 3). The database
  // is a small shared-CPU instance and web_reader allows 20 connections. 2 parallel
  // workers (2 x 3 = 6 connections) keep the heaviest aggregates (the hub indexes
  // over web.ingredients/companies) under the 5 s statement timeout while prerendering;
  // statement timeouts during the build are also retried (WEB_DB_BUILD_RETRY, pool.ts).
  experimental: { cpus: 2 },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
