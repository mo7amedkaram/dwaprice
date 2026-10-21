import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pg is a server-only dependency; keep it out of the bundler.
  serverExternalPackages: ['pg'],
  // Build workers each hold a small pg pool (lib/db/pool.ts, max 3). The database
  // is a small shared-CPU instance and web_reader allows 20 connections, so
  // prerendering is kept to 3 parallel workers (3 x 3 = 9 connections).
  experimental: { cpus: 3 },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
