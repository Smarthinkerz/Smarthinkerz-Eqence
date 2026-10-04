// Site content overrides and blog posts. Pure validation helpers live here so they can
// be unit-tested; routes in apps/api/src/cms.ts do the I/O.

export const CONTENT_LANGS = ['en', 'ar', 'ja'] as const;
export type ContentLang = (typeof CONTENT_LANGS)[number];

// Only i18n-style keys can be overridden; values are plain text, rendered as text.
export const CONTENT_KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,4}$/;
export const CONTENT_MAX = 5000;
// Legal pages (privacy policy, terms) are long documents.
export const LEGAL_MAX = 60000;
export function contentMax(key: string) {
  return key.startsWith('legal.') ? LEGAL_MAX : CONTENT_MAX;
}

export function validContentKey(key: string) {
  return CONTENT_KEY_RE.test(key) && key.length <= 80;
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ASCII slug from an English title; Arabic-only titles yield '' (caller falls back). */
export function slugify(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/, '');
}

/** Picks the first free slug: base, base-2, base-3, ... */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  throw new Error('no free slug');
}

export interface BlogInput {
  slug?: string; status?: 'draft' | 'published';
  titleEn?: string; titleAr?: string | null; excerptEn?: string | null; excerptAr?: string | null;
  bodyEn?: string; bodyAr?: string | null; coverUrl?: string | null;
  metaTitle?: string | null; metaDescription?: string | null; authorName?: string | null;
}

const LIMITS: Record<string, number> = {
  titleEn: 300, titleAr: 300, excerptEn: 600, excerptAr: 600, bodyEn: 60000, bodyAr: 60000,
  coverUrl: 500, metaTitle: 70, metaDescription: 170, authorName: 100, slug: 120,
};

/** Validates and normalises an admin blog payload. Throws Error(message) on bad input. */
export function cleanBlogInput(raw: unknown, opts: { coverOrigins: string[]; partial: boolean }): BlogInput {
  const b = (raw ?? {}) as Record<string, unknown>;
  const out: BlogInput = {};
  const str = (k: keyof BlogInput, nullable: boolean) => {
    if (!(k in b)) return;
    const v = b[k];
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      if (!nullable) throw new Error(`${k} is required`);
      (out as Record<string, unknown>)[k] = null;
      return;
    }
    if (typeof v !== 'string') throw new Error(`${k} must be text`);
    const t = v.replace(/\r\n/g, '\n').trim();
    if (t.length > LIMITS[k]) throw new Error(`${k} is longer than ${LIMITS[k]} characters`);
    (out as Record<string, unknown>)[k] = t;
  };
  str('titleEn', false); str('titleAr', true); str('excerptEn', true); str('excerptAr', true);
  str('bodyEn', false); str('bodyAr', true); str('coverUrl', true);
  str('metaTitle', true); str('metaDescription', true); str('authorName', true); str('slug', false);
  if (!opts.partial && !out.titleEn) throw new Error('titleEn is required');
  if ('bodyEn' in b && out.bodyEn === undefined) out.bodyEn = '';
  if (out.slug !== undefined && !SLUG_RE.test(out.slug)) throw new Error('slug may contain only a-z, 0-9 and single hyphens');
  if ('status' in b) {
    if (b.status !== 'draft' && b.status !== 'published') throw new Error('status must be draft or published');
    out.status = b.status;
  }
  // Covers must be images we host (our upload store) or an https image on an allowed origin.
  if (out.coverUrl) {
    let u: URL;
    try { u = new URL(out.coverUrl); } catch { throw new Error('coverUrl is not a valid URL'); }
    if (u.protocol !== 'https:' || !opts.coverOrigins.includes(u.origin)) throw new Error('coverUrl must be an image uploaded to Eqence');
  }
  return out;
}

/** Image type from magic bytes; the client-supplied type and name are never trusted. */
export function sniffImage(buf: Uint8Array): { ext: string; mime: string } | null {
  const b = buf;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
