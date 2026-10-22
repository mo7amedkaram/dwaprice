import 'server-only';
// Favicon / icon generation. An uploaded square PNG or JPG (>= 512 px, <= 2 MB) is turned with
// sharp into every size Google and mobile browsers want, plus a real favicon.ico (16/32/48 packed
// by hand — sharp cannot write ICO). When nothing is uploaded, the same sizes are rendered from the
// built-in brand mark, so the icon routes always return something.
import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MIN_SIZE = 512;

// The built-in brand mark (src/app/icon.svg), embedded so it is available in the standalone build.
const BUILTIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0D7C66"/><g transform="rotate(-45 16 16)"><rect x="7" y="12" width="18" height="8" rx="4" fill="#FFFFFF"/><rect x="16" y="12" width="9" height="8" rx="4" fill="#E6F4F0"/><rect x="16" y="12" width="4" height="8" fill="#E6F4F0"/></g></svg>';

/** Opaque background behind apple-touch-icon (iOS shows no transparency). */
const APPLE_BG = '#0D7C66';

export interface GeneratedAsset {
  name: string;
  bytes: Buffer;
  contentType: string;
}

/** The PNG sizes we generate and the ICO sub-images. */
export const PNG_ICONS = [48, 96, 192, 512] as const;
const ICO_SIZES = [16, 32, 48] as const;
const APPLE_SIZE = 180;

export const ICON_ASSET_NAMES = ['favicon.ico', ...PNG_ICONS.map((s) => `icon-${s}.png`), 'apple-touch-icon.png'];

/** Validates an uploaded icon server-side (format sniffed by sharp, not the extension). */
export async function validateUpload(buf: Buffer): Promise<{ ok: true; format: string } | { ok: false; error: string }> {
  if (buf.length > MAX_UPLOAD_BYTES) return { ok: false, error: `حجم الملف أكبر من ${MAX_UPLOAD_BYTES / 1024 / 1024} ميجابايت.` };
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    return { ok: false, error: 'تعذّر قراءة الصورة. ارفع صورة PNG أو JPG صالحة.' };
  }
  if (meta.format !== 'png' && meta.format !== 'jpeg') return { ok: false, error: 'الصيغة يجب أن تكون PNG أو JPG فقط (لا يُقبل SVG).' };
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w !== h) return { ok: false, error: 'الصورة يجب أن تكون مربعة (العرض = الارتفاع).' };
  if (w < MIN_SIZE) return { ok: false, error: `الصورة يجب أن تكون ${MIN_SIZE}×${MIN_SIZE} بكسل على الأقل.` };
  return { ok: true, format: meta.format };
}

function source(input: Buffer | 'builtin') {
  // A high density rasterises the small built-in SVG crisply at 512 px.
  return input === 'builtin' ? sharp(Buffer.from(BUILTIN_SVG), { density: 512 }) : sharp(input);
}

async function pngAt(input: Buffer | 'builtin', size: number, background?: string): Promise<Buffer> {
  let img = source(input).resize(size, size, { fit: 'cover', position: 'centre' });
  if (background) img = img.flatten({ background });
  return img.png({ compressionLevel: 9 }).toBuffer();
}

/** Packs 16/32/48 PNGs into an .ico container (PNG payloads, which modern browsers accept). */
export function packIco(images: Array<{ size: number; data: Buffer }>): Buffer {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((img, i) => {
    const e = i * 16;
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0); // width (0 = 256)
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1); // height
    entries.writeUInt8(0, e + 2); // colour count
    entries.writeUInt8(0, e + 3); // reserved
    entries.writeUInt16LE(1, e + 4); // colour planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(img.data.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.data)]);
}

/** Every generated asset (favicon.ico + icon-*.png + apple-touch-icon.png) from one source. */
export async function generateIcons(input: Buffer | 'builtin'): Promise<GeneratedAsset[]> {
  const icoParts = await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await pngAt(input, size) })));
  const ico = packIco(icoParts);
  const pngs = await Promise.all(PNG_ICONS.map(async (size) => ({ name: `icon-${size}.png`, bytes: await pngAt(input, size), contentType: 'image/png' })));
  const apple = { name: 'apple-touch-icon.png', bytes: await pngAt(input, APPLE_SIZE, APPLE_BG), contentType: 'image/png' };
  return [{ name: 'favicon.ico', bytes: ico, contentType: 'image/x-icon' }, ...pngs, apple];
}

// Built-in fallbacks are generated once per process (sharp is not free) and reused.
const builtinCache = new Map<string, GeneratedAsset>();
let builtinPromise: Promise<void> | null = null;

export async function builtinAsset(name: string): Promise<GeneratedAsset | null> {
  if (!builtinCache.size) {
    builtinPromise ??= generateIcons('builtin').then((assets) => {
      for (const a of assets) builtinCache.set(a.name, a);
    });
    await builtinPromise;
  }
  return builtinCache.get(name) ?? null;
}
