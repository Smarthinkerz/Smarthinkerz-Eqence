#!/usr/bin/env node
/**
 * Answer engine optimization for the public site, run after `vite build`.
 *
 * The app is a client-rendered SPA, and most AI crawlers (GPTBot, ClaudeBot,
 * PerplexityBot and others) read HTML without running JavaScript. So for each public
 * route this writes an HTML file that already carries the page's title, description,
 * canonical URL, social tags, JSON-LD and its main content as plain semantic HTML. The
 * React app replaces that content when it starts, so people see the same site as before.
 *
 * Also writes robots.txt, sitemap.xml and llms.txt, and spa.html: the plain app shell
 * that vercel.json serves for every other path (the signed-in app, unknown URLs).
 *
 * All copy comes from the site's own sources (client/src/contexts/I18nContext.tsx,
 * client/src/content/faq.ts and seo.ts, packages/core/src/pricing.ts), loaded through
 * Vite so the browser and the crawlers read the same words. Published blog posts are
 * fetched from the API when it answers; if it does not, the build continues without them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const API_URL = (process.env.VITE_API_URL || 'https://api.eqence.com').replace(/\/+$/, '');

const vite = await createServer({
  root: path.join(ROOT, 'client'),
  configFile: path.join(ROOT, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  // Only modules are loaded here; no dependency pre-bundling for a browser.
  optimizeDeps: { noDiscovery: true, include: [] },
  logLevel: 'error',
});
let seo, faqMod, i18n;
try {
  seo = await vite.ssrLoadModule('/src/content/seo.ts');
  faqMod = await vite.ssrLoadModule('/src/content/faq.ts');
  i18n = await vite.ssrLoadModule('/src/contexts/I18nContext.tsx');
} finally {
  await vite.close();
}
const { SITE_URL, OG_IMAGE, CONTACT_EMAIL, PAGES, metaFor, structuredDataFor, organizationLd, websiteLd } = seo;
const { FAQ } = faqMod;
const en = i18n.translations.en;
const t = (key) => {
  const v = en[key];
  if (!v) throw new Error(`prerender: missing English copy for "${key}"`);
  return v;
};
const LADDER = seo.SITE_LADDER;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON-LD inside <script>: escape "<" so no value can close the tag.
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const n = (v) => v.toLocaleString('en-US');

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) throw new Error('prerender: dist/index.html has no empty #root; was it already prerendered?');

// The plain app shell for every path without its own file. Written first, from the untouched template.
fs.writeFileSync(path.join(DIST, 'spa.html'), template);

function page({ urlPath, title, description, jsonLd, body, type = 'website', extraHead = '' }) {
  const url = `${SITE_URL}${urlPath === '/' ? '/' : urlPath}`;
  const head = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="Eqence" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(OG_IMAGE)}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:locale:alternate" content="ar_AR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(OG_IMAGE)}" />`,
    `<link rel="alternate" type="text/plain" href="${SITE_URL}/llms.txt" title="llms.txt" />`,
    extraHead,
    ...jsonLd.map(ld),
    // Readable before the app starts; the app replaces #root entirely.
    `<style>[data-prerendered]{max-width:760px;margin:0 auto;padding:96px 20px 48px;font-family:Lato,Arial,sans-serif;line-height:1.6;color:#1f2937}[data-prerendered] h1{font-size:2rem;line-height:1.2;margin:0 0 12px}[data-prerendered] h2{font-size:1.25rem;margin:28px 0 8px}[data-prerendered] h3{font-size:1.05rem;margin:16px 0 4px}[data-prerendered] a{color:#C41E3A}[data-prerendered] nav a{margin-right:14px}[data-prerendered] table{border-collapse:collapse}[data-prerendered] td,[data-prerendered] th{border:1px solid #e5e7eb;padding:6px 10px;text-align:left}</style>`,
  ].filter(Boolean).join('\n    ');
  const nav = `<nav aria-label="Site"><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/faq">FAQ</a><a href="/blog">Blog</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/app/sign-in?mode=up">Get started</a></nav>`;
  const footer = `<footer><p>Eqence, a SmarThinkerz product. Questions: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p></footer>`;
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"><div data-prerendered>${nav}<main>${body}</main>${footer}</div></div>`);
  if (!html.includes(`<title>${esc(title)}</title>`)) throw new Error(`prerender: could not set the title for ${urlPath}`);
  const out = urlPath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, urlPath.replace(/^\//, ''), 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

/* ── shared sections ── */
const features = ['monitoring', 'sentiment', 'autoresponse', 'analytics', 'notifications', 'integrations']
  .map((k) => `<li><strong>${esc(t(`features.${k}`))}</strong>: ${esc(t(`features.${k}.desc`))}</li>`).join('');
const steps = [1, 2, 3].map((i) => `<li><strong>${esc(t(`howit.step${i}`))}</strong>: ${esc(t(`howit.step${i}.desc`))}</li>`).join('');
const pricingTable = `<table><thead><tr><th>Plan</th><th>Monthly</th><th>Annual</th><th>AI drafted replies a month</th><th>Connected sources</th></tr></thead><tbody>${LADDER.map((p) =>
  `<tr><td>${esc(p.name)}</td><td>${p.contactOnly ? `$${n(p.monthlyUsd)}, by contract` : `$${n(p.monthlyUsd)}`}</td><td>${p.contactOnly || p.yearlyUsd == null ? 'By contract' : `$${n(p.yearlyUsd)}`}</td><td>${p.aiActionsPerMonth === -1 ? 'Unlimited' : n(p.aiActionsPerMonth)}</td><td>${p.channels === -1 ? 'Unlimited' : p.channels}</td></tr>`).join('')}</tbody></table>`;
const faqList = (items, level = 'h2') => items.map((f) => `<section><${level}>${esc(f.q)}</${level}><p>${esc(f.a)}</p></section>`).join('');
const faqBy = (...qs) => qs.map((q) => FAQ.en.find((f) => f.q === q) ?? (() => { throw new Error(`prerender: FAQ "${q}" not found`); })());

const written = [];

/* ── home ── */
{
  const m = metaFor('/');
  written.push(page({
    urlPath: '/', title: m.title, description: m.description, jsonLd: structuredDataFor('/'),
    body: `<h1>${esc(t('hero.title'))}</h1><p>${esc(t('hero.subtitle'))}</p><p>${esc(t('hero.badge'))}.</p>`
      + `<h2>${esc(t('features.title'))}</h2><ul>${features}</ul>`
      + `<h2>${esc(t('howit.title'))}</h2><ol>${steps}</ol>`
      + `<h2>${esc(t('pricing.title'))}</h2><p>${esc(t('pricing.subtitle'))}</p>${pricingTable}`
      + `<h2>Common questions</h2>${faqList(faqBy('What is Eqence?', 'Does Eqence post replies automatically?', 'Which languages does Eqence support?', 'How much does Eqence cost?'), 'h3')}<p><a href="/faq">All questions and answers</a></p>`,
  }));
}

/* ── pricing ── */
{
  const m = metaFor('/pricing');
  written.push(page({
    urlPath: '/pricing', title: m.title, description: m.description, jsonLd: structuredDataFor('/pricing'),
    body: `<h1>Eqence pricing</h1><p>${esc(t('pricing.subtitle'))}</p>${pricingTable}<p>Every plan includes ${esc(t('pricing.f.included').toLowerCase())}. Prices are in US dollars.</p>`
      + faqList(faqBy('How much does Eqence cost?', 'What counts toward my monthly allowance?', 'How do I pay?', 'Can I try Eqence before choosing a plan?')),
  }));
}

/* ── FAQ, English then Arabic ── */
{
  const m = metaFor('/faq');
  written.push(page({
    urlPath: '/faq', title: m.title, description: m.description, jsonLd: structuredDataFor('/faq'),
    body: `<h1>${esc(t('faq.title'))}</h1><p>${esc(t('faq.intro'))}</p>${faqList(FAQ.en)}`
      + `<div lang="ar" dir="rtl"><h2>${esc(i18n.translations.ar['faq.title'])}</h2>${faqList(FAQ.ar, 'h3')}</div>`,
  }));
}

/* ── about, contact, demo ── */
{
  const about = metaFor('/about');
  written.push(page({
    urlPath: '/about', title: about.title, description: about.description, jsonLd: structuredDataFor('/about'),
    body: `<h1>${esc(t('about.title'))}</h1><p>${esc(t('about.what'))}</p><p>${esc(t('about.who'))}</p><p>${esc(t('about.company'))}</p><p>${esc(t('about.questions'))} <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>`,
  }));
  const contact = metaFor('/contact');
  written.push(page({
    urlPath: '/contact', title: contact.title, description: contact.description, jsonLd: structuredDataFor('/contact'),
    body: `<h1>${esc(t('contact.title'))}</h1><p>${esc(t('contact.body'))}</p><p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p>${esc(t('contact.address'))}</p>`,
  }));
  const demo = metaFor('/demo');
  written.push(page({
    urlPath: '/demo', title: demo.title, description: demo.description, jsonLd: structuredDataFor('/demo'),
    body: `<h1>${esc(t('demo.title'))}</h1><p>${esc(t('demo.body'))}</p><p><a href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('demo.subject'))}">${esc(t('demo.button'))}</a></p><p>${esc(t('demo.try'))} <a href="/#demo">${esc(t('demo.try.link'))}</a></p>`,
  }));
}

/* ── blog, from the API when it answers ── */
async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Markdown from the blog editor, as plain semantic HTML: headings, lists and paragraphs.
function markdownToHtml(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const block of String(md || '').split(/\n{2,}/)) {
    for (const line of block.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      const h = s.match(/^(#{2,4})\s+(.*)$/);
      const ul = s.match(/^[-*]\s+(.*)$/);
      const ol = s.match(/^\d+[.)]\s+(.*)$/);
      if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
      else if (ul || ol) {
        const tag = ul ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
        list.items.push((ul || ol)[1]);
      } else { flush(); out.push(`<p>${inline(s)}</p>`); }
    }
    flush();
  }
  return out.join('');
}

let posts = [];
try {
  const list = await getJson(`${API_URL}/api/blog`);
  posts = Array.isArray(list.posts) ? list.posts.filter((p) => typeof p.slug === 'string' && /^[a-z0-9-]{1,200}$/.test(p.slug)) : [];
} catch (err) {
  console.warn(`prerender: blog posts not included (${API_URL}/api/blog: ${err.message})`);
}
{
  const m = metaFor('/blog');
  written.push(page({
    urlPath: '/blog', title: m.title, description: m.description, jsonLd: structuredDataFor('/blog'),
    body: `<h1>${esc(t('blog.hero.title'))}</h1><p>${esc(t('blog.hero.subtitle'))}</p>`
      + (posts.length ? `<ul>${posts.map((p) => `<li><a href="/blog/${p.slug}">${esc(p.titleEn)}</a>${p.excerptEn ? `: ${esc(p.excerptEn)}` : ''}</li>`).join('')}</ul>` : ''),
  }));
}
const postUrls = [];
for (const summary of posts) {
  try {
    const { post } = await getJson(`${API_URL}/api/blog/${summary.slug}`);
    const urlPath = `/blog/${post.slug}`;
    const title = `${post.metaTitle || post.titleEn} | Eqence`;
    const description = post.metaDescription || post.excerptEn || metaFor('/blog').description;
    const article = {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.titleEn, description,
      mainEntityOfPage: `${SITE_URL}${urlPath}`, url: `${SITE_URL}${urlPath}`, inLanguage: 'en',
      ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
      ...(post.authorName ? { author: { '@type': 'Person', name: post.authorName } } : { author: { '@id': `${SITE_URL}/#organization` } }),
      ...(post.coverUrl && /^https:\/\//.test(post.coverUrl) ? { image: post.coverUrl } : {}),
      publisher: { '@id': `${SITE_URL}/#organization` },
    };
    page({
      urlPath, title, description, type: 'article', jsonLd: [organizationLd(), websiteLd(), article],
      body: `<article><h1>${esc(post.titleEn)}</h1>${post.publishedAt ? `<p><time datetime="${esc(post.publishedAt)}">${esc(String(post.publishedAt).slice(0, 10))}</time></p>` : ''}${markdownToHtml(post.bodyEn)}`
        + (post.titleAr && post.bodyAr ? `<div lang="ar" dir="rtl"><h2>${esc(post.titleAr)}</h2>${markdownToHtml(post.bodyAr)}</div>` : '') + '</article>',
    });
    postUrls.push({ loc: `${SITE_URL}${urlPath}`, lastmod: post.publishedAt ? String(post.publishedAt).slice(0, 10) : null });
  } catch (err) {
    console.warn(`prerender: blog post ${summary.slug} skipped (${err.message})`);
  }
}

/* ── robots.txt, sitemap.xml, llms.txt ── */
const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot', 'Googlebot'];
fs.writeFileSync(path.join(DIST, 'robots.txt'), [
  '# Eqence public site. The signed-in app under /app is private to each merchant.',
  'User-agent: *',
  'Allow: /',
  'Disallow: /app/',
  '',
  '# Answer engines and AI assistants are welcome to read and cite the public pages.',
  ...AI_AGENTS.flatMap((a) => [`User-agent: ${a}`, 'Allow: /', 'Disallow: /app/', '']),
  `Sitemap: ${SITE_URL}/sitemap.xml`,
  '',
].join('\n'));

const staticUrls = PAGES.map((p) => ({ loc: `${SITE_URL}${p.path === '/' ? '/' : p.path}`, lastmod: null }));
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...postUrls]
  .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);

const llms = [
  '# Eqence',
  '',
  `> ${metaFor('/').description}`,
  '',
  'Eqence is a web app made by SmarThinkerz (Muscat, Sultanate of Oman). It works with Shopify stores that collect product reviews with Judge.me. It reads reviews in Arabic and English, labels each one positive, neutral, negative or mixed, emails the store owner about strongly negative reviews, and drafts a reply with AI in the customer\'s language. The merchant edits, approves or rejects every draft; only approved replies are posted, as the store\'s reply on Judge.me.',
  '',
  '## Pages',
  '',
  ...PAGES.map((p) => `- [${p.title.replace(/ \| Eqence$/, '')}](${SITE_URL}${p.path === '/' ? '/' : p.path}): ${p.description}`),
  '',
  '## Plans (US dollars)',
  '',
  ...LADDER.map((p) => p.contactOnly
    ? `- ${p.name}: $${n(p.monthlyUsd)} a month by contract; unlimited AI drafted replies and connected sources`
    : `- ${p.name}: $${n(p.monthlyUsd)} a month or $${n(p.yearlyUsd)} a year; ${n(p.aiActionsPerMonth)} AI drafted replies a month; ${p.channels} connected ${p.channels === 1 ? 'source' : 'sources'}`),
  '- Importing and analyzing reviews is free without a plan.',
  '',
  '## Questions and answers',
  '',
  ...FAQ.en.flatMap((f) => [`### ${f.q}`, '', f.a, '']),
  '## Contact',
  '',
  `- Email: ${CONTACT_EMAIL}`,
  '',
].join('\n');
fs.writeFileSync(path.join(DIST, 'llms.txt'), llms);

console.log(`prerender: ${written.length} pages, ${postUrls.length} blog posts, robots.txt, sitemap.xml, llms.txt, spa.html`);
