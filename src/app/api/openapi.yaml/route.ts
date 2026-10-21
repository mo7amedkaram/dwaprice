import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The OpenAPI 3.1 description as a file (tools, code generators, Postman).
export const dynamic = 'force-static';

export function GET() {
  const text = readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf8');
  return new Response(text, {
    headers: { 'Content-Type': 'application/yaml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}
