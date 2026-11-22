// Keeps the head in step with client-side navigation: canonical URL, description, social
// tags and robots. The first load already carries these from the prerendered HTML.
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { PAGES, SITE_URL } from '../content/seo';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function usePageMeta() {
  const [location] = useLocation();
  useEffect(() => {
    const path = location.replace(/\/+$/, '') || '/';
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE_URL}${path === '/' ? '/' : path}`;
    setMeta('property', 'og:url', canonical.href);
    // The signed-in app is private to each merchant: never index it.
    setMeta('name', 'robots', path.startsWith('/app') ? 'noindex, nofollow' : 'index, follow');
    // Info pages and the blog set a title in the visitor's language themselves; the home
    // and pricing views have no title of their own, so theirs is set here.
    const page = PAGES.find((p) => p.path === path);
    if (page) {
      if (path === '/' || path === '/pricing') document.title = page.title;
      setMeta('name', 'description', page.description);
      setMeta('property', 'og:title', page.title);
      setMeta('property', 'og:description', page.description);
    }
  }, [location]);
}
