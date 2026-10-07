// Eqence interface visual system: Monza-red actions sit on clean enterprise-neutral surfaces, while hero content remains legible over silent product motion.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useI18n } from '../contexts/I18nContext';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import DemoChat from '../components/DemoChat';

const HERO_BACKGROUND_VIDEO_URL = '/media/eqence-hero-mobile.mp4';
const HOW_IT_WORKS_BACKGROUND_VIDEO_URL = '/media/eqence-how-it-works.mp4';
type BackgroundVideoId = 'hero' | 'how-it-works';

const pricingPlans = [
  { id: 'starter', name: 'Starter', price: 29, replies: 100, sources: 1, popular: false },
  { id: 'basic', name: 'Basic', price: 59, replies: 500, sources: 3, popular: false },
  { id: 'advance', name: 'Advance', price: 99, replies: 2000, sources: 5, popular: false },
  { id: 'premium', name: 'Premium', price: 199, replies: 10000, sources: 10, popular: false },
  { id: 'enterprise', name: 'Enterprise', price: 499, replies: -1, sources: -1, popular: false },
];

export default function Home() {
  const { t } = useI18n();
  const planFeatures = (plan: (typeof pricingPlans)[number]) => [
    `${plan.replies === -1 ? t('pricing.unlimited') : plan.replies.toLocaleString()} ${t('pricing.f.replies')}`,
    `${plan.sources === -1 ? t('pricing.unlimited') : plan.sources} ${t(plan.sources === 1 ? 'pricing.f.source' : 'pricing.f.sources')}`,
    t('pricing.f.included'),
  ];
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const howItWorksVideoRef = useRef<HTMLVideoElement>(null);
  const manuallyPausedVideos = useRef(new Set<BackgroundVideoId>());
  const [isHeroVideoPlaying, setIsHeroVideoPlaying] = useState(true);
  const [isHowItWorksVideoPlaying, setIsHowItWorksVideoPlaying] = useState(true);

  const toggleBackgroundVideo = (
    id: BackgroundVideoId,
    video: HTMLVideoElement | null,
    setPlaying: (playing: boolean) => void,
  ) => {
    if (!video) return;

    if (video.paused) {
      manuallyPausedVideos.current.delete(id);
      video.muted = true;
      video.defaultMuted = true;
      void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      return;
    }

    manuallyPausedVideos.current.add(id);
    video.pause();
    setPlaying(false);
  };

  useEffect(() => {
    const heroVideo = heroVideoRef.current;
    const howItWorksVideo = howItWorksVideoRef.current;
    const backgroundVideos = [
      { id: 'hero' as const, video: heroVideo, setPlaying: setIsHeroVideoPlaying },
      { id: 'how-it-works' as const, video: howItWorksVideo, setPlaying: setIsHowItWorksVideoPlaying },
    ].filter((item): item is { id: BackgroundVideoId; video: HTMLVideoElement; setPlaying: (playing: boolean) => void } => item.video !== null);
    if (!backgroundVideos.length) return;

    const startMutedPlayback = ({ id, video, setPlaying }: (typeof backgroundVideos)[number]) => {
      if (manuallyPausedVideos.current.has(id)) return;
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', 'true');
      void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    const startBackgroundVideos = () => backgroundVideos.forEach(startMutedPlayback);
    const syncPlaybackStates = () => {
      setIsHeroVideoPlaying(Boolean(heroVideo && !heroVideo.paused));
      setIsHowItWorksVideoPlaying(Boolean(howItWorksVideo && !howItWorksVideo.paused));
    };

    const resumeWhenVisible = () => {
      if (document.visibilityState === 'visible') startBackgroundVideos();
    };

    startBackgroundVideos();
    backgroundVideos.forEach(({ video }) => {
      video.addEventListener('loadeddata', startBackgroundVideos);
      video.addEventListener('canplay', startBackgroundVideos);
      video.addEventListener('play', syncPlaybackStates);
      video.addEventListener('pause', syncPlaybackStates);
    });
    document.addEventListener('visibilitychange', resumeWhenVisible);
    window.addEventListener('touchstart', startBackgroundVideos, { once: true, passive: true });
    window.addEventListener('pointerdown', startBackgroundVideos, { once: true, passive: true });

    return () => {
      backgroundVideos.forEach(({ video }) => {
        video.removeEventListener('loadeddata', startBackgroundVideos);
        video.removeEventListener('canplay', startBackgroundVideos);
        video.removeEventListener('play', syncPlaybackStates);
        video.removeEventListener('pause', syncPlaybackStates);
      });
      document.removeEventListener('visibilitychange', resumeWhenVisible);
      window.removeEventListener('touchstart', startBackgroundVideos);
      window.removeEventListener('pointerdown', startBackgroundVideos);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <SiteNav />

      {/* Silent hero product motion supplied by the user, with foreground content retained above it. */}
      <section
        aria-label="Eqence product experience"
        className="relative mt-16 min-h-[28rem] overflow-hidden bg-slate-700 sm:min-h-[calc(100svh-4rem)]"
      >
        <video
          ref={heroVideoRef}
          id="hero-background-video"
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster="/media/eqence-hero-poster.jpg"
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src={HERO_BACKGROUND_VIDEO_URL} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-100/26 via-slate-200/12 to-slate-100/18" />
        <button
          type="button"
          onClick={() => toggleBackgroundVideo('hero', heroVideoRef.current, setIsHeroVideoPlaying)}
          aria-label={isHeroVideoPlaying ? 'Pause hero background video' : 'Play hero background video'}
          title={isHeroVideoPlaying ? 'Pause background video' : 'Play background video'}
          className="absolute bottom-5 left-5 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-slate-950/65 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-950/85 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-700"
        >
          <span aria-hidden="true">{isHeroVideoPlaying ? 'Ⅱ' : '▶'}</span>
          <span className="sr-only">{isHeroVideoPlaying ? 'Pause' : 'Play'} hero background video</span>
        </button>
        <div className="container relative z-10 flex min-h-[28rem] items-center justify-center py-20 sm:min-h-[calc(100svh-4rem)] sm:py-28">
          <div className="max-w-4xl text-center text-white">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm animate-fade-in">
              <span className="h-2 w-2 rounded-full bg-[#ff7289] animate-pulse" />
              {t('hero.badge')}
            </div>
            <h1 className="mb-6 text-4xl leading-tight font-black text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.7)] sm:text-5xl lg:text-6xl animate-fade-in-up">
              {t('hero.title')}
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] sm:text-xl animate-fade-in-up animate-delay-100">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in-up animate-delay-200">
              <Link href="/app/sign-in?mode=up" className="btn-primary text-lg px-8 py-4 shadow-lg shadow-black/35">
                {t('hero.cta')}
              </Link>
            </div>
          </div>
        </div>
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
              { key: 'analytics', icon: '✍️', color: 'from-orange-500 to-orange-600' },
              { key: 'notifications', icon: '🔔', color: 'from-red-500 to-red-600' },
              { key: 'integrations', icon: '🌍', color: 'from-indigo-500 to-indigo-600' },
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
      <section id="how-it-works" className="relative isolate overflow-hidden bg-slate-100 py-20 sm:py-24 lg:py-28">
        <video
          ref={howItWorksVideoRef}
          id="how-it-works-background-video"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster="/media/eqence-how-it-works-poster.jpg"
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src={HOW_IT_WORKS_BACKGROUND_VIDEO_URL} type="video/mp4" />
        </video>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/42 via-white/20 to-white/46" />
        <button
          type="button"
          onClick={() => toggleBackgroundVideo('how-it-works', howItWorksVideoRef.current, setIsHowItWorksVideoPlaying)}
          aria-label={isHowItWorksVideoPlaying ? 'Pause How It Works background video' : 'Play How It Works background video'}
          title={isHowItWorksVideoPlaying ? 'Pause background video' : 'Play background video'}
          className="absolute right-5 bottom-5 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#C41E3A]/25 bg-white/85 text-sm text-[#C41E3A] shadow-lg backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#C41E3A] focus:ring-offset-2 focus:ring-offset-white"
        >
          <span aria-hidden="true">{isHowItWorksVideoPlaying ? 'Ⅱ' : '▶'}</span>
          <span className="sr-only">{isHowItWorksVideoPlaying ? 'Pause' : 'Play'} How It Works background video</span>
        </button>
        <div className="container relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#C41E3A] mb-4">{t('howit.title')}</h2>
            <p className="text-lg text-slate-700">{t('howit.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: '1', key: 'step1', icon: '🔗' },
              { step: '2', key: 'step2', icon: '📡' },
              { step: '3', key: 'step3', icon: '🚀' },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border border-white/80 bg-white/76 p-6 text-center shadow-lg backdrop-blur-sm transition-shadow hover:bg-white/90 hover:shadow-xl">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl border border-red-100 bg-white/90 flex items-center justify-center text-2xl shadow-sm">
                  {item.icon}
                </div>
                <div className="text-xs font-bold text-[#C41E3A] uppercase tracking-wider mb-2">Step {item.step}</div>
                <h3 className="text-lg font-semibold text-[#C41E3A] mb-2">{t(`howit.${item.key}`)}</h3>
                <p className="text-sm text-gray-600">{t(`howit.${item.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <DemoChat />

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
                  {planFeatures(plan).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.id === 'enterprise' ? (
                  <a href="mailto:reply@smarthinkerz.com?subject=Eqence%20Enterprise"
                    className="block text-center py-3 rounded-lg font-semibold text-sm border-2 border-gray-200 text-gray-700 hover:border-[#C41E3A] hover:text-[#C41E3A] transition-all duration-150">
                    {t('pricing.contact')}
                  </a>
                ) : (
                  <Link href="/app/sign-in?mode=up"
                    className="block text-center py-3 rounded-lg font-semibold text-sm border-2 border-gray-200 text-gray-700 hover:border-[#C41E3A] hover:text-[#C41E3A] transition-all duration-150">
                    {t('pricing.cta')}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
