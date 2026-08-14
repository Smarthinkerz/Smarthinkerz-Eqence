// Eqence interface visual system: Monza-red actions sit on clean enterprise-neutral surfaces, while the hero uses silent, text-free product motion.
import { Link } from 'wouter';
import { useI18n } from '../contexts/I18nContext';
import { LanguageToggle } from '../components/LanguageToggle';

const HERO_BACKGROUND_VIDEO_URL = 'https://raw.githubusercontent.com/Smarthinkerz/Smarthinkerz-Eqence/d12fce0/client/public/media/eqence-hero-background.mp4';

const pricingPlans = [
  { id: 'free', name: 'Free', price: 0, features: ['50 reviews/mo', 'Basic monitoring', 'Email alerts', '1 platform'], popular: false },
  { id: 'starter', name: 'Starter', price: 29, features: ['100 reviews/mo', 'Sentiment analysis', 'Email + SMS alerts', '3 platforms', 'Basic reports'], popular: false },
  { id: 'basic', name: 'Basic', price: 59, features: ['500 reviews/mo', 'Advanced sentiment', 'Auto-responses (50/mo)', '5 platforms', 'Priority support', 'Custom templates'], popular: true },
  { id: 'advance', name: 'Advance', price: 99, features: ['2,000 reviews/mo', 'Full AI analysis', 'Unlimited auto-responses', '10 platforms', 'API access', 'White-label reports'], popular: false },
  { id: 'premium', name: 'Premium', price: 199, features: ['10,000 reviews/mo', 'Enterprise AI', 'All platforms', 'Dedicated manager', 'Custom integrations', 'SLA guarantee'], popular: false },
  { id: 'enterprise', name: 'Enterprise', price: 499, features: ['Unlimited reviews', 'Custom AI models', 'All platforms', 'On-premise option', 'Custom SLA', '24/7 support'], popular: false },
];

const testimonials = [
  { name: 'Sarah Johnson', role: 'Owner, Luxe Boutique', text: 'Eqence transformed how we handle reviews. Our response rate went from 30% to 95% in just one month.', rating: 5 },
  { name: 'Michael Chen', role: 'CEO, TechGear Store', text: 'The AI auto-responses are incredibly natural. Customers can\'t tell the difference. Our rating went up 0.8 stars.', rating: 5 },
  { name: 'Emma Williams', role: 'Marketing Dir, FreshFood', text: 'Finally a tool that consolidates all our reviews in one place. The sentiment analytics are game-changing.', rating: 5 },
];

export default function Home() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold text-[#C41E3A]">Eqence</Link>
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{t('nav.features')}</a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">{t('nav.pricing')}</a>
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 transition-colors">
              {t('nav.login')}
            </Link>
            <Link href="/register" className="btn-primary text-sm px-4 py-2">
              {t('nav.register')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Silent, text-free hero product motion supplied by the user. */}
      <section
        aria-label="Eqence product motion visual"
        className="relative mt-16 min-h-[28rem] overflow-hidden bg-slate-950 sm:min-h-[calc(100svh-4rem)]"
      >
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src={HERO_BACKGROUND_VIDEO_URL} type="video/mp4" />
        </video>
      </section>

      {/* Features Section */}
      <section id="features" className="section-padding bg-gray-50">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{t('features.title')}</h2>
            <p className="text-lg text-gray-600">{t('features.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { key: 'monitoring', icon: '🔍', color: 'from-blue-500 to-blue-600' },
              { key: 'sentiment', icon: '🧠', color: 'from-purple-500 to-purple-600' },
              { key: 'autoresponse', icon: '🤖', color: 'from-green-500 to-green-600' },
              { key: 'analytics', icon: '📊', color: 'from-orange-500 to-orange-600' },
              { key: 'notifications', icon: '🔔', color: 'from-red-500 to-red-600' },
              { key: 'integrations', icon: '🛒', color: 'from-indigo-500 to-indigo-600' },
            ].map((feature, i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-xl mb-4 shadow-sm`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t(`features.${feature.key}`)}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{t(`features.${feature.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="section-padding">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{t('howit.title')}</h2>
            <p className="text-lg text-gray-600">{t('howit.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: '1', key: 'step1', icon: '🔗' },
              { step: '2', key: 'step2', icon: '📡' },
              { step: '3', key: 'step3', icon: '🚀' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center text-2xl">
                  {item.icon}
                </div>
                <div className="text-xs font-bold text-[#C41E3A] uppercase tracking-wider mb-2">Step {item.step}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t(`howit.${item.key}`)}</h3>
                <p className="text-sm text-gray-600">{t(`howit.${item.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="section-padding bg-gray-50">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{t('pricing.title')}</h2>
            <p className="text-lg text-gray-600">{t('pricing.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {pricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={`bg-white rounded-xl p-6 border-2 transition-all duration-300 hover:shadow-lg ${
                  plan.popular ? 'border-[#C41E3A] shadow-lg scale-[1.02]' : 'border-gray-100'
                }`}
              >
                {plan.popular && (
                  <div className="text-xs font-bold text-[#C41E3A] uppercase tracking-wider mb-2">Most Popular</div>
                )}
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-3 mb-5">
                  <span className="text-4xl font-black text-gray-900">${plan.price}</span>
                  <span className="text-gray-500">{t('pricing.mo')}</span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center py-3 rounded-lg font-semibold text-sm transition-all duration-150 ${
                    plan.popular
                      ? 'btn-primary'
                      : 'border-2 border-gray-200 text-gray-700 hover:border-[#C41E3A] hover:text-[#C41E3A]'
                  }`}
                >
                  {plan.price === 0 ? 'Start Free' : plan.id === 'enterprise' ? t('pricing.contact') : t('pricing.cta')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{t('testimonials.title')}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {testimonials.map((item, i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: item.rating }).map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">"{item.text}"</p>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{item.name}</div>
                  <div className="text-xs text-gray-400">{item.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust/Security Section */}
      <section className="section-padding bg-gray-900 text-white">
        <div className="container text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t('trust.title')}</h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-12">{t('trust.subtitle')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {[
              { label: 'SSL Encrypted', icon: '🔒' },
              { label: 'GDPR Compliant', icon: '🛡️' },
              { label: '99.9% Uptime', icon: '⚡' },
              { label: 'SOC 2 Ready', icon: '✅' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl mb-2">{item.icon}</div>
                <div className="text-sm font-medium text-gray-300">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-400 py-16">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="text-2xl font-bold text-white mb-3">Eqence</div>
              <p className="text-sm leading-relaxed">AI-powered reputation management for Shopify merchants. Protect and grow your online presence.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('footer.product')}</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('footer.company')}</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('footer.support')}</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                <li><Link href="/admin" className="hover:text-white transition-colors">{t('footer.admin')}</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm">&copy; 2026 Eqence. All rights reserved.</p>
            <div className="flex items-center gap-6 text-sm">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
