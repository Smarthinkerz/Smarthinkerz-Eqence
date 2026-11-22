// /about, /contact and /demo: short public pages in the visitor's language, laid out like the
// legal pages. They state only what the product does today. Contact and demo requests go by
// email to reply@smarthinkerz.com through the visitor's own mail app; nothing is stored here.
import { useEffect } from 'react';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import { useI18n } from '../contexts/I18nContext';
import { FAQ } from '../content/faq';

const MAIL = 'reply@smarthinkerz.com';
const mailto = (subject: string, body = '') =>
  `mailto:${MAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

function InfoLayout({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => { document.title = `${title} | Eqence`; }, [title]);
  return (
    <div className="min-h-screen bg-white">
      <SiteNav />
      <section className="mt-16 bg-gradient-to-br from-slate-900 via-slate-800 to-[#5a0f1c] text-white">
        <div className="container py-14 text-center"><h1 className="text-3xl sm:text-4xl font-black">{title}</h1></div>
      </section>
      <section className="section-padding">
        <div className="mx-auto max-w-[720px] px-4 space-y-5 text-gray-700 leading-relaxed">{children}</div>
      </section>
      <SiteFooter />
    </div>
  );
}

const button = 'inline-block btn-primary px-6 py-3 text-sm';

export function About() {
  const { t } = useI18n();
  return (
    <InfoLayout title={t('about.title')}>
      <p>{t('about.what')}</p>
      <p>{t('about.who')}</p>
      <p>{t('about.company')}</p>
      <p>{t('about.questions')} <a href={`mailto:${MAIL}`} className="font-semibold text-[#C41E3A] hover:underline">{MAIL}</a></p>
    </InfoLayout>
  );
}

export function Contact() {
  const { t } = useI18n();
  return (
    <InfoLayout title={t('contact.title')}>
      <p>{t('contact.body')}</p>
      <p><a href={mailto('Eqence')} className={button}>{t('contact.button')}</a></p>
      <p className="text-sm text-gray-500"><span dir="ltr">{MAIL}</span><br />{t('contact.address')}</p>
    </InfoLayout>
  );
}

export function Demo() {
  const { t } = useI18n();
  return (
    <InfoLayout title={t('demo.title')}>
      <p>{t('demo.body')}</p>
      <p><a href={mailto(t('demo.subject'), t('demo.template'))} className={button}>{t('demo.button')}</a></p>
      <p className="text-sm text-gray-500">{t('demo.fallback')} <span dir="ltr">{MAIL}</span></p>
      <p>{t('demo.try')} <a href="/#demo" className="font-semibold text-[#C41E3A] hover:underline">{t('demo.try.link')}</a></p>
    </InfoLayout>
  );
}

// /faq: the same questions and answers the FAQPage structured data and llms.txt carry.
// Arabic visitors read the Arabic answers; every other language reads the English ones.
export function Faq() {
  const { t, language } = useI18n();
  const lang = language === 'ar' ? 'ar' : 'en';
  return (
    <InfoLayout title={t('faq.title')}>
      <p>{t('faq.intro')}</p>
      <div lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
        {FAQ[lang].map((f) => (
          <section key={f.q}>
            <h2 className="text-lg font-bold text-gray-900">{f.q}</h2>
            <p className="mt-1">{f.a}</p>
          </section>
        ))}
      </div>
      <p>{t('faq.more')} <a href={`mailto:${MAIL}`} className="font-semibold text-[#C41E3A] hover:underline" dir="ltr">{MAIL}</a></p>
    </InfoLayout>
  );
}
