// Public site footer, shared by the home page and the blog.
import { Link } from 'wouter';
import { useI18n } from '../contexts/I18nContext';
import AdminLoginDialog from './AdminLoginDialog';

export default function SiteFooter() {
  const { t } = useI18n();
  return (
  <footer className="bg-gray-950 text-gray-400 py-16">
    <div className="container">
      <div className="grid md:grid-cols-3 gap-8 mb-12">
        <div>
          <div className="text-2xl font-bold text-white mb-3">Eqence</div>
          <p className="text-sm leading-relaxed">{t('hero.subtitle')}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-3">{t('footer.product')}</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="/#features" className="hover:text-white transition-colors">{t('nav.features')}</a></li>
            <li><a href="/#how-it-works" className="hover:text-white transition-colors">{t('howit.title')}</a></li>
            <li><a href="/#pricing" className="hover:text-white transition-colors">{t('nav.pricing')}</a></li>
            <li><Link href="/blog" className="hover:text-white transition-colors">{t('nav.blog')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-3">{t('footer.support')}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/app/sign-in" className="hover:text-white transition-colors">{t('nav.login')}</Link></li>
            <li><AdminLoginDialog label={t('footer.admin')} className="hover:text-white transition-colors" /></li>
            <li><a href="mailto:reply@smarthinkerz.com" className="hover:text-white transition-colors">reply@smarthinkerz.com</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-800 pt-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm">&copy; 2026 Eqence, a SmarThinkerz product.</p>
        </div>
      </div>
    </div>
  </footer>
  );
}
