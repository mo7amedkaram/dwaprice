// Admin settings: parsing/validation, favicon generation, and the analytics privacy helper.
import { describe, expect, it } from 'vitest';
import { GA4_RE, parseGa4Id, parseVerificationToken, parseWhatsapp, SEO_LIMITS } from '@/lib/settings/config';
import { pageViewParams } from '@/lib/analytics';
import sharp from 'sharp';
import { generateIcons, ICON_ASSET_NAMES, packIco, PNG_ICONS, validateUpload } from '@/lib/settings/favicon';

describe('verification token parsing', () => {
  it('accepts a bare token', () => {
    expect(parseVerificationToken('abc123_DEF-456', 'google-site-verification')).toBe('abc123_DEF-456');
  });
  it('extracts the token from a pasted <meta> tag (either attribute order)', () => {
    expect(parseVerificationToken('<meta name="google-site-verification" content="XYZ-token_123" />', 'google-site-verification')).toBe('XYZ-token_123');
    expect(parseVerificationToken('<meta content="BING_tok_0099" name="msvalidate.01">', 'msvalidate.01')).toBe('BING_tok_0099');
  });
  it('ignores the wrong tag and rejects junk', () => {
    expect(parseVerificationToken('<meta name="msvalidate.01" content="bing">', 'google-site-verification')).toBe('');
    expect(parseVerificationToken('<script>alert(1)</script>', 'google-site-verification')).toBe('');
    expect(parseVerificationToken('', 'google-site-verification')).toBe('');
  });
});

describe('GA4 id and whatsapp', () => {
  it('validates G-XXXXXXXXXX only', () => {
    expect(parseGa4Id('G-ABCDE12345')).toBe('G-ABCDE12345');
    expect(parseGa4Id(' g-abcde12345 ')).toBe('G-ABCDE12345');
    expect(parseGa4Id('UA-12345-1')).toBe('');
    expect(parseGa4Id('')).toBe('');
    expect(GA4_RE.test('G-ABCDEFGH')).toBe(true);
  });
  it('keeps digits only, max 15', () => {
    expect(parseWhatsapp('+20 100 123 4567')).toBe('201001234567');
    expect(parseWhatsapp('0123456789012345678')).toBe('012345678901234');
  });
});

describe('analytics never sends the query string to GA', () => {
  it('builds page_view params from the path only', () => {
    expect(pageViewParams('https://dwaprice.com', '/search')).toEqual({ page_location: 'https://dwaprice.com/search', page_path: '/search' });
    // even if a query somehow arrives, it is dropped
    expect(pageViewParams('https://dwaprice.com/', '/search?q=بنادول')).toEqual({ page_location: 'https://dwaprice.com/search', page_path: '/search' });
    expect(pageViewParams('https://dwaprice.com', '/dawa/panadol#x')).toEqual({ page_location: 'https://dwaprice.com/dawa/panadol', page_path: '/dawa/panadol' });
  });
});

describe('SEO limits', () => {
  it('matches Google guidance', () => {
    expect(SEO_LIMITS.homeTitle).toBe(60);
    expect(SEO_LIMITS.homeDescription).toBe(160);
  });
});

async function pngSquare(size: number): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 13, g: 124, b: 102, alpha: 1 } } }).png().toBuffer();
}

describe('favicon upload validation (server-side, sharp)', () => {
  it('rejects SVG, non-square, too small, too large; accepts a 512 square PNG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512"/></svg>');
    expect((await validateUpload(svg)).ok).toBe(false); // SVG is read by sharp as 'svg' -> rejected

    const nonSquare = await sharp({ create: { width: 512, height: 256, channels: 4, background: '#fff' } }).png().toBuffer();
    expect((await validateUpload(nonSquare)).ok).toBe(false);

    const small = await pngSquare(256);
    expect((await validateUpload(small)).ok).toBe(false);

    const ok = await pngSquare(512);
    expect((await validateUpload(ok)).ok).toBe(true);

    const notImage = Buffer.from('not an image');
    expect((await validateUpload(notImage)).ok).toBe(false);
  });
});

describe('icon generation', () => {
  it('produces favicon.ico + every PNG size + apple-touch-icon', async () => {
    const assets = await generateIcons(await pngSquare(512));
    expect(assets.map((a) => a.name).sort()).toEqual([...ICON_ASSET_NAMES].sort());
    for (const a of assets) expect(a.bytes.length).toBeGreaterThan(0);

    const ico = assets.find((a) => a.name === 'favicon.ico')!;
    expect(ico.contentType).toBe('image/x-icon');
    // ICONDIR header: reserved 0, type 1, count 3
    expect(ico.bytes.readUInt16LE(0)).toBe(0);
    expect(ico.bytes.readUInt16LE(2)).toBe(1);
    expect(ico.bytes.readUInt16LE(4)).toBe(3);

    for (const size of PNG_ICONS) {
      const png = assets.find((a) => a.name === `icon-${size}.png`)!;
      const meta = await sharp(png.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([size, size]);
    }
    const apple = assets.find((a) => a.name === 'apple-touch-icon.png')!;
    const am = await sharp(apple.bytes).metadata();
    expect(am.width).toBe(180);
    // apple icon is flattened: no alpha channel
    expect(am.hasAlpha).toBe(false);
  });

  it('builds a valid .ico container from png payloads', () => {
    const ico = packIco([{ size: 16, data: Buffer.from([1, 2, 3]) }, { size: 32, data: Buffer.from([4, 5]) }]);
    expect(ico.readUInt16LE(4)).toBe(2); // count
    // first entry size byte and byte length
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt32LE(6 + 8)).toBe(3);
  });
});

describe('builtin fallback', () => {
  it('generates all icon assets from the built-in brand mark', async () => {
    const assets = await generateIcons('builtin');
    expect(assets.map((a) => a.name).sort()).toEqual([...ICON_ASSET_NAMES].sort());
    for (const a of assets) expect(a.bytes.length).toBeGreaterThan(0);
  });
});
