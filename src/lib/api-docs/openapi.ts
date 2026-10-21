// Reads openapi.yaml (project root) and shapes it for the documentation page: operations
// grouped by tag with their parameters and responses, and schemas as field tables.
// $ref pointers inside #/components are resolved; types are summarised as text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

type Any = Record<string, unknown>;

export interface DocParam {
  name: string;
  in: string;
  required: boolean;
  type: string;
  description: string;
  example: string | null;
}

export interface DocResponse {
  status: string;
  description: string;
  schema: string | null;
  example: string | null;
}

export interface DocOperation {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tag: string;
  auth: boolean;
  params: DocParam[];
  responses: DocResponse[];
}

export interface DocField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example: string | null;
}

export interface DocSchema {
  name: string;
  description: string;
  fields: DocField[];
  example: string | null;
  /** Enum values when the schema is a plain enum. */
  values: string[] | null;
}

export interface ApiDocs {
  title: string;
  version: string;
  description: string;
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string; operations: DocOperation[] }>;
  schemas: DocSchema[];
}

let cached: { spec: Any; docs: ApiDocs } | null = null;

export function loadSpec(text?: string): Any {
  if (text !== undefined) return yaml.load(text) as Any;
  if (cached) return cached.spec;
  return yaml.load(readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf8')) as Any;
}

export function resolveRef(spec: Any, ref: string): Any {
  if (!ref.startsWith('#/')) throw new Error(`external $ref not supported: ${ref}`);
  let node: unknown = spec;
  for (const part of ref.slice(2).split('/')) node = (node as Any)?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  if (!node) throw new Error(`unresolved $ref ${ref}`);
  return node as Any;
}

function deref(spec: Any, node: unknown): Any {
  if (node && typeof node === 'object' && typeof (node as Any).$ref === 'string') return deref(spec, resolveRef(spec, (node as Any).$ref as string));
  return (node ?? {}) as Any;
}

const refName = (node: unknown): string | null => (node && typeof node === 'object' && typeof (node as Any).$ref === 'string' ? ((node as Any).$ref as string).split('/').pop()! : null);

/** Human type of a schema: "string | null", "integer", "Drug[]", "one of: a, b". */
export function typeOf(spec: Any, node: unknown): string {
  const name = refName(node);
  if (name) return name;
  const s = deref(spec, node);
  if (Array.isArray(s.oneOf)) return (s.oneOf as unknown[]).map((o) => typeOf(spec, o)).join(' | ');
  if (Array.isArray(s.allOf)) return (s.allOf as unknown[]).map((o) => typeOf(spec, o)).join(' & ');
  if (Array.isArray(s.enum)) return (s.enum as string[]).join(' | ');
  if (s.const !== undefined) return JSON.stringify(s.const);
  const t = Array.isArray(s.type) ? (s.type as string[]) : s.type ? [s.type as string] : [];
  if (t.includes('array')) {
    const inner = typeOf(spec, s.items);
    return `${inner}[]`.replace(/^(.+ \| .+)\[\]$/, '($1)[]') + (t.includes('null') ? ' | null' : '');
  }
  if (t.length === 0) return 'object';
  return t.map((x) => (x === 'string' && s.format ? `string (${s.format})` : x)).join(' | ');
}

const exampleOf = (s: Any): string | null => {
  const ex = Array.isArray(s.examples) ? s.examples[0] : s.example;
  return ex === undefined ? null : typeof ex === 'string' ? ex : JSON.stringify(ex);
};

function fieldsOf(spec: Any, node: unknown, prefix = '', depth = 0): DocField[] {
  const s = deref(spec, node);
  const out: DocField[] = [];
  const props = (s.allOf ? (s.allOf as unknown[]).map((o) => deref(spec, o).properties ?? {}) : [s.properties ?? {}]) as Any[];
  const required = new Set<string>([...(s.required as string[] | undefined) ?? [], ...((s.allOf as unknown[] | undefined) ?? []).flatMap((o) => (deref(spec, o).required as string[] | undefined) ?? [])]);
  for (const p of props) {
    for (const [name, schemaNode] of Object.entries(p)) {
      const sub = deref(spec, schemaNode);
      const full = prefix ? `${prefix}.${name}` : name;
      out.push({ name: full, type: typeOf(spec, schemaNode), required: required.has(name), description: String(sub.description ?? ''), example: exampleOf(sub) });
      // expand nested objects one level (price.current, company.id …)
      if (sub.type === 'object' && sub.properties && depth < 1) out.push(...fieldsOf(spec, sub, full, depth + 1));
    }
  }
  return out;
}

export function buildDocs(spec: Any): ApiDocs {
  const info = (spec.info ?? {}) as Any;
  const tags = ((spec.tags as Any[]) ?? []).map((t) => ({ name: String(t.name), description: String(t.description ?? ''), operations: [] as DocOperation[] }));
  const globalAuth = Array.isArray(spec.security) && (spec.security as unknown[]).length > 0;
  for (const [path, item] of Object.entries((spec.paths as Any) ?? {})) {
    for (const [method, op] of Object.entries(item as Any)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const o = op as Any;
      const params: DocParam[] = ((o.parameters as unknown[]) ?? []).map((p) => {
        const pr = deref(spec, p);
        const sch = deref(spec, pr.schema);
        return { name: String(pr.name), in: String(pr.in), required: Boolean(pr.required), type: typeOf(spec, pr.schema), description: String(pr.description ?? ''), example: exampleOf(sch) ?? (sch.default !== undefined ? `default ${JSON.stringify(sch.default)}` : null) };
      });
      const responses: DocResponse[] = Object.entries((o.responses as Any) ?? {}).map(([status, r]) => {
        const rr = deref(spec, r);
        const content = ((rr.content as Any)?.['application/json'] ?? {}) as Any;
        const examples = (content.examples as Any) ?? {};
        const first = Object.values(examples)[0] as Any | undefined;
        return { status, description: String(rr.description ?? ''), schema: refName(content.schema) ?? (content.schema ? typeOf(spec, content.schema) : null), example: first?.value !== undefined ? JSON.stringify(first.value, null, 2) : null };
      });
      const tagName = String(((o.tags as string[]) ?? ['Other'])[0]);
      let tag = tags.find((t) => t.name === tagName);
      if (!tag) {
        tag = { name: tagName, description: '', operations: [] };
        tags.push(tag);
      }
      tag.operations.push({
        id: String(o.operationId ?? `${method}-${path}`),
        method: method.toUpperCase(),
        path,
        summary: String(o.summary ?? ''),
        description: String(o.description ?? ''),
        tag: tagName,
        auth: Array.isArray(o.security) ? (o.security as unknown[]).length > 0 : globalAuth,
        params,
        responses,
      });
    }
  }
  const schemas: DocSchema[] = Object.entries(((spec.components as Any)?.schemas as Any) ?? {})
    .filter(([name]) => !name.startsWith('Sample') && !name.endsWith('Response') && !name.endsWith('List'))
    .map(([name, s]) => {
      const sch = s as Any;
      return { name, description: String(sch.description ?? ''), fields: fieldsOf(spec, sch), example: Array.isArray(sch.examples) && sch.examples[0] ? JSON.stringify(sch.examples[0], null, 2) : null, values: Array.isArray(sch.enum) ? (sch.enum as string[]) : null };
    });
  return {
    title: String(info.title ?? ''),
    version: String(info.version ?? ''),
    description: String(info.description ?? ''),
    servers: ((spec.servers as Any[]) ?? []).map((s) => ({ url: String(s.url), description: String(s.description ?? '') })),
    tags: tags.filter((t) => t.operations.length),
    schemas,
  };
}

export function getApiDocs(): ApiDocs {
  if (cached) return cached.docs;
  const spec = loadSpec();
  cached = { spec, docs: buildDocs(spec) };
  return cached.docs;
}
