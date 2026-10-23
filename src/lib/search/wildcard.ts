// Wildcard search for half-read prescription names: `*` = any number of characters, `?` = exactly
// one. "Au*in" → Augmentin, Autrin…; "أو*ين" → أوجمنتين…; "Br?fen" → Brufen. A query is a wildcard
// query only when it contains one of the symbols; every other query keeps the normal engine.
//
// The pattern is matched against ONE WORD of a name (the brand part): first against the first word
// of the English / Arabic trade name and the approved alias tokens (anchored), then — when that
// finds fewer than 3 products — against any word that is not a strength or pack word. Literals are
// normalised like everything else (lib/search/normalize.ts), so case, hamza forms, ة/ه, ى/ي and
// diacritics do not matter. Guards: at least 2 literal characters, at most 3 wildcards (runs of `*`
// collapse to one), and every other character is escaped — nothing the visitor types is ever used as
// a regex, neither here nor in SQL (lib/data/search.ts builds the SQL pattern from these tokens).
// Pure module: bundled into the search worker, shared with the server and the tests.
import { isWildcardQuery } from './constants';
import { normalizeSearch } from './normalize';

export { isWildcardQuery };

export const WILDCARD_LIMIT = 20;
export const WILDCARD_MIN_LITERALS = 2;
export const WILDCARD_MAX = 3;
/** The anchored tier must find at least this many products, or the any-word tier is tried too. */
export const WILDCARD_ANCHORED_MIN = 3;

export type WildcardToken = { t: 'lit'; v: string } | { t: '*' } | { t: '?' };
export type WildcardProblem = 'too-few-literals' | 'too-many-wildcards';

export interface WildcardPattern {
  tokens: WildcardToken[];
  /** Number of literal (normalised) characters — the part the visitor actually knows. */
  literalCount: number;
  wildcards: number;
  /** Anchored to a whole word, on normalised text. */
  regex: RegExp;
  /** Same pattern for DISPLAY text (case-insensitive, hamza/ta-marbuta/alef-maqsura variants, marks ignored),
   * with one capture group per literal so the typed letters can be highlighted. */
  display: RegExp;
  /** The leading literal, when the pattern starts with one (lets the server use a prefix index). */
  leading: string | null;
}

export type WildcardParse = { ok: true; pattern: WildcardPattern } | { ok: false; problem: WildcardProblem };

export const WILDCARD_MESSAGES: Record<WildcardProblem, string> = {
  'too-few-literals': `اكتب حرفين على الأقل من الاسم مع * أو ?، مثال: Au*in`,
  'too-many-wildcards': `أقصى عدد لرموز * و ? في البحث هو ${WILDCARD_MAX}، مثال: Au*in`,
};

const RE_ESCAPE = /[.*+?^${}()|[\]\\\/]/g;
const escapeRe = (s: string) => s.replace(RE_ESCAPE, '\\$&');

// Display-text equivalents of a normalised character (what normalizeSearch folds together).
const DISPLAY_CLASS: Record<string, string> = {
  ا: '[اأإآٱ]',
  ي: '[يىئی]',
  ه: '[هة]',
  و: '[وؤ]',
  ك: '[كک]',
};
const MARKS = '\\p{M}*';

function displayLiteral(lit: string): string {
  let out = '';
  for (const ch of lit) out += (DISPLAY_CLASS[ch] ?? escapeRe(ch)) + MARKS;
  return out;
}

/** Tokens of the raw query: literal chunks (normalised, spaces dropped — one word is matched) and wildcards. */
export function tokenizeWildcard(raw: string): WildcardToken[] {
  const tokens: WildcardToken[] = [];
  let lit = '';
  const flush = () => {
    const v = normalizeSearch(lit).replace(/ /g, '');
    if (v) tokens.push({ t: 'lit', v });
    lit = '';
  };
  for (const ch of raw.replace(/٭/g, '*')) {
    if (ch === '*' || ch === '?') {
      flush();
      const last = tokens[tokens.length - 1];
      if (ch === '*' && last?.t === '*') continue; // "**" = "*"
      tokens.push({ t: ch });
    } else {
      lit += ch;
    }
  }
  flush();
  return tokens;
}

/** Parse + guard a wildcard query. */
export function parseWildcard(raw: string): WildcardParse {
  const tokens = tokenizeWildcard(raw);
  const literalCount = tokens.reduce((n, t) => n + (t.t === 'lit' ? t.v.length : 0), 0);
  const wildcards = tokens.filter((t) => t.t !== 'lit').length;
  if (literalCount < WILDCARD_MIN_LITERALS) return { ok: false, problem: 'too-few-literals' };
  if (wildcards > WILDCARD_MAX) return { ok: false, problem: 'too-many-wildcards' };
  const core = tokens.map((t) => (t.t === 'lit' ? escapeRe(t.v) : t.t === '*' ? '.*' : '.')).join('');
  const display = tokens.map((t) => (t.t === 'lit' ? `(${displayLiteral(t.v)})` : t.t === '*' ? '[\\p{L}\\p{N}\\p{M}]*' : '[\\p{L}\\p{N}]\\p{M}*')).join('');
  const first = tokens[0];
  return {
    ok: true,
    pattern: {
      tokens,
      literalCount,
      wildcards,
      regex: new RegExp(`^${core}$`, 'u'),
      display: new RegExp(`^${display}$`, 'iu'),
      leading: first?.t === 'lit' ? first.v : null,
    },
  };
}

/** Friendly message for a wildcard query the engine refuses, or null when it is acceptable. */
export function wildcardProblem(raw: string): string | null {
  if (!isWildcardQuery(raw)) return null;
  const p = parseWildcard(raw);
  return p.ok ? null : WILDCARD_MESSAGES[p.problem];
}

/** Characters a wildcard covered in a matched word (fewer = closer to what was typed). */
export function coveredChars(pattern: WildcardPattern, word: string): number {
  return Math.max(0, word.length - pattern.literalCount);
}

// ---------------------------------------------------------------- SQL (server fallback)

// Postgres ARE regex, built only from these tokens: literals escaped, normalisation-equivalent Arabic
// letters as classes (the server matches RAW name_ar and the lower-cased English sort_name, not the
// slow SQL normaliser), wildcards that never cross a word boundary.
const SQL_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const SQL_CLASS: Record<string, string> = { ا: '[اأإآٱ]', ي: '[يىئ]', ه: '[هة]', و: '[وؤ]', ك: '[كک]' };
const SQL_WORD = '[[:alnum:]]';

function sqlLiteral(lit: string): string {
  let out = '';
  for (const ch of lit) out += SQL_CLASS[ch] ?? ch.replace(SQL_ESCAPE, '\\$&');
  return out;
}

export interface SqlWildcard {
  /** The word pattern, with the whole word as capture group 1 (for `substring(col from …)`). */
  anchored: string;
  anyWord: string;
  /** Pattern on NORMALISED text (web.search_index.normalized_alias): first word / any word. */
  normalizedAnchored: string;
  normalizedAnyWord: string;
  /** `LIKE` prefix for an index-assisted pre-filter, or null when the pattern starts with a wildcard. */
  likePrefix: string | null;
}

export function toSqlWildcard(pattern: WildcardPattern): SqlWildcard {
  const core = pattern.tokens.map((t) => (t.t === 'lit' ? sqlLiteral(t.v) : t.t === '*' ? `${SQL_WORD}*` : SQL_WORD)).join('');
  const plain = pattern.tokens.map((t) => (t.t === 'lit' ? t.v.replace(SQL_ESCAPE, '\\$&') : t.t === '*' ? '[^ ]*' : '[^ ]')).join('');
  return {
    anchored: `^(${core})(?:[^[:alnum:]]|$)`,
    anyWord: `(?:^|[^[:alnum:]])(${core})(?:[^[:alnum:]]|$)`,
    normalizedAnchored: `^${plain}$`,
    normalizedAnyWord: `(?:^| )${plain}(?: |$)`,
    likePrefix: pattern.leading ? `${pattern.leading.replace(/[%_\\]/g, '\\$&')}%` : null,
  };
}

// ---------------------------------------------------------------- highlighting

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Display text split into segments, the visitor's literal letters marked inside each word the
 * pattern matches (whole words when the display form cannot be aligned).
 */
export function wildcardSegments(text: string, pattern: WildcardPattern): Segment[] {
  const out: Segment[] = [];
  for (const part of text.split(/(\s+)/)) {
    if (!part || /^\s+$/.test(part)) {
      if (part) out.push({ text: part, hit: false });
      continue;
    }
    const m = pattern.display.exec(part);
    if (!m) {
      out.push({ text: part, hit: false });
      continue;
    }
    // walk the capture groups (one per literal) in order; wildcard spans are the gaps between them
    let pos = 0;
    let found = false;
    for (let g = 1; g < m.length; g++) {
      const lit = m[g];
      if (lit === undefined) continue;
      const at = part.indexOf(lit, pos);
      if (at < 0) break;
      if (at > pos) out.push({ text: part.slice(pos, at), hit: false });
      out.push({ text: lit, hit: true });
      pos = at + lit.length;
      found = true;
    }
    if (!found) out.push({ text: part, hit: true });
    else if (pos < part.length) out.push({ text: part.slice(pos), hit: false });
  }
  return out;
}
