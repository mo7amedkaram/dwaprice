// Search-text normalisation shared by the browser (suggestion index), the build-time index
// generator and the tests. It is a port of the database's public.medicine_search_normalize
// (migrations 0001 + 0025), which normalises both the stored aliases and the /api/search
// query, so the local index and the server agree on what matches what.
// tests/search-normalize.test.ts compares it with values produced by web.search_normalize.
//
// Steps (same order as the SQL):
//   1. letter variants: ا/أ/إ/آ/ٱ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي, Persian ک → ك and ی → ي
//   2. Arabic-Indic (٠-٩) and Persian (۰-۹) digits → 0-9
//   3. remove tashkeel (U+064B–U+0652), tatweel (U+0640) and the superscript alef (U+0670)
//   4. unaccent + lower-case (Latin only: Arabic letters are left as they are)
//   5. collapse whitespace
//   6. a space between a digit and a Latin letter in either order ("1g" → "1 g", "b12" → "b 12")
//   7. everything that is not a letter or a digit becomes a space; collapse, trim
// No file in this folder may import server-only code: it is bundled into the search worker.

const TRANSLATE = new Map<string, string>();
for (const [from, to] of [
  ['أإآٱ', 'ا'],
  ['ة', 'ه'],
  ['ىیئ', 'ي'],
  ['ؤ', 'و'],
  ['ک', 'ك'],
]) {
  for (const ch of from) TRANSLATE.set(ch, to);
}
for (let i = 0; i < 10; i++) {
  TRANSLATE.set(String.fromCharCode(0x0660 + i), String(i)); // ٠-٩
  TRANSLATE.set(String.fromCharCode(0x06f0 + i), String(i)); // ۰-۹
}

// unaccent's rules for characters that have no decomposition (letters, and the few symbols
// its rules file spells out: ® © and the vulgar fractions). Other symbols (™ …) are not
// letters and end up as spaces in step 7, like in the database.
const UNACCENT_SPECIAL: Record<string, string> = {
  ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', ð: 'd', Ð: 'D', þ: 'th', Þ: 'TH',
  ı: 'i', ħ: 'h', Ħ: 'H', ŧ: 't', Ŧ: 'T', ĸ: 'k', ŋ: 'n', Ŋ: 'N',
  '®': '(R)', '©': '(C)', '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4',
};

const ARABIC_BLOCKS = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const DECOMPOSABLE = /[\p{L}\p{Nl}]/u;
const MARKS = /\p{M}/gu;

/**
 * unaccent for one non-Arabic character: special rule, else (letters and letter-like numerals
 * such as Ⅷ or full-width Ａ) the compatibility decomposition minus combining marks. Digits and
 * symbols such as ² or ™ are left alone, as unaccent leaves them.
 */
function unaccentChar(ch: string): string {
  const special = UNACCENT_SPECIAL[ch];
  if (special) return special;
  if (ch.charCodeAt(0) < 0x80 || !DECOMPOSABLE.test(ch)) return ch;
  return ch.normalize('NFKD').replace(MARKS, '');
}

/** The database's normalisation of a search string ("" where the SQL returns null). */
export function normalizeSearch(input: string | null | undefined): string {
  if (!input) return '';
  let out = '';
  for (const ch of input) {
    const translated = TRANSLATE.get(ch);
    if (translated !== undefined) {
      out += translated;
      continue;
    }
    const code = ch.charCodeAt(0);
    if ((code >= 0x064b && code <= 0x0652) || code === 0x0640 || code === 0x0670) continue; // tashkeel, tatweel, superscript alef
    out += ARABIC_BLOCKS.test(ch) ? ch : unaccentChar(ch);
  }
  return out
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalised words of a string (empty array for nothing usable). */
export function searchTokens(input: string | null | undefined): string[] {
  const n = normalizeSearch(input);
  return n ? n.split(' ') : [];
}
