// Copy-ready request snippets for the sample explorer and the docs (pure module).
export type Lang = 'curl' | 'javascript' | 'python' | 'php' | 'dart';

export const LANGS: Array<{ id: Lang; label: string }> = [
  { id: 'curl', label: 'curl' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
  { id: 'dart', label: 'Dart' },
];

/** Snippets for a GET request; `key` null = the keyless sample. */
export function snippet(lang: Lang, url: string, key: string | null): string {
  const auth = key ? `Authorization: Bearer ${key}` : null;
  switch (lang) {
    case 'curl':
      return auth ? `curl "${url}" \\\n  -H "${auth}"` : `curl "${url}"`;
    case 'javascript':
      return [
        `const res = await fetch("${url}"${auth ? `, {\n  headers: { Authorization: "Bearer ${key}" },\n}` : ''});`,
        'const body = await res.json();',
        'console.log(res.status, body.data);',
      ].join('\n');
    case 'python':
      return [
        'import requests',
        '',
        `res = requests.get("${url}"${auth ? `, headers={"Authorization": "Bearer ${key}"}` : ''})`,
        'res.raise_for_status()',
        'print(res.json()["data"])',
      ].join('\n');
    case 'php':
      return [
        '<?php',
        `$ch = curl_init("${url}");`,
        'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);',
        ...(auth ? [`curl_setopt($ch, CURLOPT_HTTPHEADER, ["${auth}"]);`] : []),
        '$body = json_decode(curl_exec($ch), true);',
        'curl_close($ch);',
        'print_r($body["data"]);',
      ].join('\n');
    case 'dart':
      return [
        "import 'dart:convert';",
        "import 'package:http/http.dart' as http;",
        '',
        'Future<void> main() async {',
        `  final res = await http.get(Uri.parse('${url}')${auth ? `,\n      headers: {'Authorization': 'Bearer ${key}'}` : ''});`,
        '  final body = jsonDecode(utf8.decode(res.bodyBytes));',
        "  print(body['data']);",
        '}',
      ].join('\n');
  }
}

export interface ExplorerEndpoint {
  id: string;
  method: 'GET';
  /** Path template under /sample, e.g. "/drugs/{id}". */
  path: string;
  title: string;
  titleAr: string;
  params: Array<{ name: string; in: 'path' | 'query'; label: string; placeholder?: string; options?: string[]; default?: string }>;
}

/** The endpoints offered by /api/sample (all keyless, all inside the 50-drug sample). */
export const EXPLORER_ENDPOINTS: ExplorerEndpoint[] = [
  { id: 'drugs', method: 'GET', path: '/drugs', title: 'List / search drugs', titleAr: 'قائمة الأدوية والبحث', params: [
    { name: 'q', in: 'query', label: 'q (search)', placeholder: 'اوجمنتن' },
    { name: 'dosage_form', in: 'query', label: 'dosage_form', options: ['', 'tablet', 'capsule', 'syrup', 'suspension', 'drops', 'injection', 'cream', 'ointment', 'gel', 'sachet', 'suppository'] },
    { name: 'sort', in: 'query', label: 'sort', options: ['name', 'price', '-price', 'updated_at', '-updated_at'] },
    { name: 'limit', in: 'query', label: 'limit', default: '5' },
  ] },
  { id: 'drug', method: 'GET', path: '/drugs/{id}', title: 'One drug by id', titleAr: 'دواء واحد بالمعرّف', params: [{ name: 'id', in: 'path', label: 'id', default: 'augmentin-1gm-14-tablets' }] },
  { id: 'barcode', method: 'GET', path: '/drugs/by-barcode/{barcode}', title: 'Drugs by barcode', titleAr: 'بحث بالباركود', params: [{ name: 'barcode', in: 'path', label: 'barcode', default: '' }] },
  { id: 'alternatives', method: 'GET', path: '/drugs/{id}/alternatives', title: 'Alternatives', titleAr: 'البدائل', params: [
    { name: 'id', in: 'path', label: 'id', default: 'augmentin-1gm-14-tablets' },
    { name: 'strength', in: 'query', label: 'strength', options: ['same', 'any'] },
  ] },
  { id: 'history', method: 'GET', path: '/drugs/{id}/price-history', title: 'Price history', titleAr: 'تاريخ السعر', params: [{ name: 'id', in: 'path', label: 'id', default: 'glucophage-1000mg-30-f-c-tab' }] },
  { id: 'changes', method: 'GET', path: '/price-changes', title: 'Delta feed (price changes)', titleAr: 'تغذية التغييرات', params: [
    { name: 'since', in: 'query', label: 'since (ISO)', default: '' },
    { name: 'limit', in: 'query', label: 'limit', default: '20' },
  ] },
  { id: 'companies', method: 'GET', path: '/companies', title: 'Companies', titleAr: 'الشركات', params: [{ name: 'limit', in: 'query', label: 'limit', default: '20' }] },
  { id: 'ingredients', method: 'GET', path: '/ingredients', title: 'Ingredients', titleAr: 'المواد الفعالة', params: [{ name: 'limit', in: 'query', label: 'limit', default: '20' }] },
  { id: 'meta', method: 'GET', path: '/meta', title: 'Dataset meta', titleAr: 'بيانات المجموعة', params: [] },
];

/** Builds the request URL of an explorer endpoint from its parameter values. */
export function explorerUrl(base: string, endpoint: ExplorerEndpoint, values: Record<string, string>): string {
  let path = endpoint.path;
  const qs = new URLSearchParams();
  for (const p of endpoint.params) {
    const v = (values[p.name] ?? p.default ?? '').trim();
    if (p.in === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(v || '-'));
    else if (v) qs.set(p.name, v);
  }
  const q = qs.toString();
  return `${base}/sample${path}${q ? `?${q}` : ''}`;
}
