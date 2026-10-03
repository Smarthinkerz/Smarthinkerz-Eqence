import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanBlogInput, slugify, sniffImage, uniqueSlug, validContentKey } from '../src/cms';

const opts = { coverOrigins: ['https://api.eqence.com'], partial: false };

test('content keys: i18n-style only', () => {
  assert.equal(validContentKey('hero.title'), true);
  assert.equal(validContentKey('features.monitoring.desc'), true);
  assert.equal(validContentKey('hero'), false);
  assert.equal(validContentKey('Hero.Title'), false);
  assert.equal(validContentKey('hero.title<script>'), false);
  assert.equal(validContentKey('a.' + 'b'.repeat(90)), false);
});

test('slugs: ASCII from English titles, empty for Arabic-only, collisions numbered', () => {
  assert.equal(slugify('Reply to Every Review: Arabic & English!'), 'reply-to-every-review-arabic-and-english');
  assert.equal(slugify('ردّ على كل تقييم'), '');
  assert.equal(uniqueSlug('post', new Set(['post', 'post-2'])), 'post-3');
  assert.equal(uniqueSlug('fresh', new Set(['post'])), 'fresh');
});

test('blog input: required fields, limits, slug and status rules', () => {
  assert.throws(() => cleanBlogInput({}, opts), /titleEn is required/);
  assert.throws(() => cleanBlogInput({ titleEn: 'x'.repeat(301) }, opts), /longer than 300/);
  assert.throws(() => cleanBlogInput({ titleEn: 'A', slug: 'Bad Slug' }, opts), /slug/);
  assert.throws(() => cleanBlogInput({ titleEn: 'A', status: 'live' }, opts), /status/);
  assert.throws(() => cleanBlogInput({ titleEn: 'A', bodyEn: 7 }, opts), /must be text/);
  const ok = cleanBlogInput({ titleEn: '  Hello  ', titleAr: '', bodyEn: 'a\r\nb', status: 'published' }, opts);
  assert.deepEqual(ok, { titleEn: 'Hello', titleAr: null, bodyEn: 'a\nb', status: 'published' });
  assert.deepEqual(cleanBlogInput({ excerptEn: 'x' }, { ...opts, partial: true }), { excerptEn: 'x' });
});

test('cover URL must be an image hosted by Eqence over https', () => {
  assert.equal(cleanBlogInput({ titleEn: 'A', coverUrl: 'https://api.eqence.com/files/blog/x.png' }, opts).coverUrl, 'https://api.eqence.com/files/blog/x.png');
  assert.throws(() => cleanBlogInput({ titleEn: 'A', coverUrl: 'https://evil.example/x.png' }, opts), /uploaded to Eqence/);
  assert.throws(() => cleanBlogInput({ titleEn: 'A', coverUrl: 'javascript:alert(1)' }, opts), /uploaded to Eqence|valid URL/);
  assert.throws(() => cleanBlogInput({ titleEn: 'A', coverUrl: 'http://api.eqence.com/x.png' }, opts), /uploaded to Eqence/);
});

test('images identified by magic bytes, not by name or claimed type', () => {
  assert.deepEqual(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { ext: 'png', mime: 'image/png' });
  assert.deepEqual(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), { ext: 'jpg', mime: 'image/jpeg' });
  assert.deepEqual(sniffImage(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), { ext: 'webp', mime: 'image/webp' });
  assert.equal(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>')), null);
  assert.equal(sniffImage(new TextEncoder().encode('<html><script>')), null);
});
