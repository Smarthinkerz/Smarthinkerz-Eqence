// /privacy and /terms. The text is written in the admin (Front page → Legal pages) and
// shown in the visitor's language, falling back to English. Until a text exists the page
// says so plainly instead of showing an empty policy.
import { useEffect } from 'react';
import { useRoute } from 'wouter';
import Markdown from '../components/Markdown';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import { useI18n } from '../contexts/I18nContext';

export type LegalDoc = 'privacy' | 'terms';

/** True when the admin has saved this document (t() returns the key when nothing exists). */
export function hasLegal(t: (k: string) => string, doc: LegalDoc) {
  const key = `legal.${doc}.body`;
  return t(key) !== key && t(key).trim().length > 0;
}

export default function Legal() {
  const [isPrivacy] = useRoute('/privacy');
  const doc: LegalDoc = isPrivacy ? 'privacy' : 'terms';
  const { t, language } = useI18n();
  const title = t(`legal.${doc}.title`);
  useEffect(() => { document.title = `${title} | Eqence`; }, [title]);

  return (
    <div className="min-h-screen bg-white">
      <SiteNav />
      <section className="mt-16 bg-gradient-to-br from-slate-900 via-slate-800 to-[#5a0f1c] text-white">
        <div className="container py-14 text-center"><h1 className="text-3xl sm:text-4xl font-black">{title}</h1></div>
      </section>
      <section className="section-padding">
        <div className="mx-auto max-w-[800px] px-4">
          {hasLegal(t, doc)
            ? <Markdown source={t(`legal.${doc}.body`)} dir={language === 'ar' ? 'rtl' : 'auto'} />
            : <p className="text-gray-600">{t('legal.pending')}</p>}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
