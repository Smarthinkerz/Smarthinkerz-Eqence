// Page titles, descriptions and structured data for the public site. Used in the browser
// (head updates on navigation) and at build time by scripts/prerender.ts, which writes a
// crawler readable HTML file per public route so answer engines that do not run
// JavaScript still read the product facts.
import { SITE_LADDER } from '../../../packages/core/src/pricing';
import { FAQ } from './faq';

export { SITE_LADDER };

export const SITE_URL = 'https://www.eqence.com';
export const OG_IMAGE = `${SITE_URL}/media/eqence-hero-poster.jpg`;
export const CONTACT_EMAIL = 'reply@smarthinkerz.com';

export interface PageMeta { path: string; title: string; description: string }

const DEFAULT_DESCRIPTION = "Eqence imports your Shopify store's Judge.me reviews, flags the negative ones, and drafts replies in Arabic or English that you approve before they are posted.";

export const PAGES: PageMeta[] = [
  { path: '/', title: 'Eqence: Review replies for Shopify stores, in Arabic and English', description: DEFAULT_DESCRIPTION },
  { path: '/pricing', title: 'Pricing | Eqence', description: 'Eqence pricing: importing and analyzing your Judge.me reviews is free; plans for AI drafted replies in Arabic and English start at $29 a month, with two months free on annual billing.' },
  { path: '/faq', title: 'Questions and answers | Eqence', description: 'How Eqence connects to Judge.me, drafts Arabic and English replies to Shopify product reviews, waits for your approval, flags negative reviews, and what the plans cost.' },
  { path: '/about', title: 'About Eqence', description: 'Eqence is a web app for Shopify stores that use Judge.me: it imports product reviews, labels their sentiment and drafts replies in Arabic or English for you to approve. Made by SmarThinkerz.' },
  { path: '/contact', title: 'Contact | Eqence', description: 'Contact the Eqence team at reply@smarthinkerz.com with questions about Eqence, your account or the plans.' },
  { path: '/demo', title: 'Book a free demo | Eqence', description: 'Book a free demo of Eqence, or type a sample review on the home page and see the drafted reply right away with no account.' },
  { path: '/blog', title: 'Blog | Eqence', description: 'Guides and news on managing product reviews for Shopify stores, in Arabic and English.' },
];

export function metaFor(path: string): PageMeta {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return PAGES.find((p) => p.path === clean) ?? { path: clean, title: PAGES[0].title, description: DEFAULT_DESCRIPTION };
}

export const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'SmarThinkerz',
  url: 'https://smarthinkerz.com',
  email: CONTACT_EMAIL,
  address: { '@type': 'PostalAddress', addressLocality: 'Muscat', addressCountry: 'OM', postOfficeBoxNumber: '116' },
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: CONTACT_EMAIL, availableLanguage: ['English', 'Arabic'] },
});

export const websiteLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: 'Eqence',
  url: SITE_URL,
  inLanguage: ['en', 'ar'],
  publisher: { '@id': `${SITE_URL}/#organization` },
});

export const softwareLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${SITE_URL}/#software`,
  name: 'Eqence',
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Review management',
  operatingSystem: 'Web',
  inLanguage: ['en', 'ar'],
  image: OG_IMAGE,
  publisher: { '@id': `${SITE_URL}/#organization` },
  featureList: [
    'Imports Shopify product reviews from Judge.me',
    'Sentiment analysis of every review in Arabic and English',
    'Email alert for strongly negative reviews',
    'AI drafted replies in the customer\'s language, Arabic or English',
    'Every reply waits for the merchant\'s approval before it is posted to Judge.me',
    'Brand voice: tone, phrases to avoid and a signature',
  ],
  offers: SITE_LADDER.map((p) => ({
    '@type': 'Offer',
    name: `Eqence ${p.name}`,
    price: p.monthlyUsd.toFixed(2),
    priceCurrency: 'USD',
    url: `${SITE_URL}/pricing`,
    description: p.contactOnly
      ? 'Unlimited AI drafted replies and connected sources, sold by contract.'
      : `${p.aiActionsPerMonth.toLocaleString('en-US')} AI drafted replies a month, ${p.channels} connected ${p.channels === 1 ? 'source' : 'sources'}. Billed monthly; annual billing is ten times the monthly price.`,
  })),
});

export const faqLd = (lang: 'en' | 'ar' = 'en') => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${SITE_URL}/faq#faq`,
  inLanguage: lang,
  mainEntity: FAQ[lang].map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

export const breadcrumbLd = (page: PageMeta) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Eqence', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: page.title.replace(/ \| Eqence$/, ''), item: `${SITE_URL}${page.path}` },
  ],
});

/** Structured data for one public route. */
export function structuredDataFor(path: string): object[] {
  const page = metaFor(path);
  const base: object[] = [organizationLd(), websiteLd()];
  if (page.path === '/' || page.path === '/pricing') base.push(softwareLd());
  if (page.path === '/faq') base.push(faqLd('en'));
  if (page.path !== '/') base.push(breadcrumbLd(page));
  return base;
}
