// Public site navigation, shared by the home page and the blog. On the home page the
// section links scroll in place; elsewhere they lead back to that section of the home page.
import { Link, useLocation } from 'wouter';
import { useI18n } from '../contexts/I18nContext';
import { LanguageToggle } from './LanguageToggle';

export default function SiteNav() {
  const { t } = useI18n();
  const [location] = useLocation();
  const onHome = location === '/';
  const section = (id: string) => (onHome ? `#${id}` : `/#${id}`);
  const link = 'text-sm text-gray-600 hover:text-gray-900 transition-colors';
  const blogActive = location === '/blog' || location.startsWith('/blog/');
  // Front page only: the way back to the parent site, in the middle of the bar.
  const back = 'items-center gap-1.5 whitespace-nowrap text-sm font-medium text-gray-700 hover:text-[#C41E3A] transition-colors';
  const arrow = <span aria-hidden className="rtl:rotate-180">←</span>;

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">
      <div className="container relative flex items-center justify-between h-16 gap-3">
        <div className="flex items-center gap-8 min-w-0">
          <Link href="/" className="text-2xl font-bold text-[#C41E3A]">Eqence</Link>
          <div className="hidden md:flex items-center gap-6">
            <a href={section('features')} className={link}>{t('nav.features')}</a>
            <a href={section('how-it-works')} className={link}>{t('howit.title')}</a>
            <a href={section('pricing')} className={link}>{t('nav.pricing')}</a>
            <Link href="/blog" className={blogActive ? 'text-sm font-semibold text-[#C41E3A]' : link}>{t('nav.blog')}</Link>
          </div>
        </div>
        {onHome && (
          <>
            {/* Wide screens: exactly centred in the bar, whatever sits left and right of it. */}
            <a href="https://smarthinkerz.com" className={`hidden xl:inline-flex absolute left-1/2 -translate-x-1/2 ${back}`}>
              {arrow}{t('nav.smarthinkerz')}
            </a>
            {/* Tablets and small laptops: between the two groups, shortened so nothing overlaps. */}
            <a href="https://smarthinkerz.com" aria-label={t('nav.smarthinkerz')} className={`hidden sm:inline-flex xl:hidden min-w-0 ${back}`}>
              {arrow}<span className="truncate">SmarThinkerz</span>
            </a>
          </>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/blog" className={`md:hidden ${blogActive ? 'text-sm font-semibold text-[#C41E3A]' : link} px-1`}>{t('nav.blog')}</Link>
          <LanguageToggle />
          <Link href="/app/sign-in" className="hidden sm:inline text-sm font-medium text-gray-700 hover:text-gray-900 px-2 py-2 transition-colors">
            {t('nav.login')}
          </Link>
          <Link href="/app/sign-in?mode=up" className="btn-primary text-sm px-3 sm:px-4 py-2 whitespace-nowrap">
            {t('nav.register')}
          </Link>
        </div>
      </div>
      {/* Phones: the bar has no room, so the link gets its own centred strip under it. */}
      {onHome && (
        <a href="https://smarthinkerz.com" className={`flex sm:hidden h-8 justify-center border-t border-gray-100 bg-white/95 !text-xs ${back}`}>
          {arrow}{t('nav.smarthinkerz')}
        </a>
      )}
    </nav>
  );
}
