// Eqence is not open yet: this is the only sign-up path, and it only records interest.
import { useState } from 'react';
import { Link } from 'wouter';
import { useI18n } from '../contexts/I18nContext';

const plannedPlans = [
  { id: 'starter', name: 'Starter', price: 29 },
  { id: 'basic', name: 'Basic', price: 59 },
  { id: 'advance', name: 'Advance', price: 99 },
  { id: 'premium', name: 'Premium', price: 199 },
  { id: 'enterprise', name: 'Enterprise', price: 499 },
];

const inputClass = `w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A]
                    focus:ring-2 focus:ring-[#C41E3A]/20 outline-none transition-all duration-150`;

export default function Waitlist() {
  const { t } = useI18n();
  const initialPlan = new URLSearchParams(window.location.search).get('plan') || '';
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [email, setEmail] = useState('');
  const [store, setStore] = useState('');
  const [plan, setPlan] = useState(plannedPlans.some(p => p.id === initialPlan) ? initialPlan : '');
  const [website, setWebsite] = useState(''); // honeypot, hidden from people
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, business, email, store, plan, website }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-12 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Link href="/" className="text-[#C41E3A] font-bold text-2xl">Eqence</Link>
        </div>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-[#C41E3A]">
          <span className="h-2 w-2 rounded-full bg-[#C41E3A]" />
          {t('waitlist.badge')}
        </div>

        {status === 'done' ? (
          <div role="status">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('waitlist.done.title')}</h1>
            <p className="text-gray-600 mb-6">{t('waitlist.done.body')}</p>
            <Link href="/" className="text-[#C41E3A] hover:underline font-medium">{t('waitlist.back')}</Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('waitlist.title')}</h1>
            <p className="text-gray-500 mb-6">{t('waitlist.subtitle')}</p>

            {status === 'error' && (
              <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {t('waitlist.error')}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="wl-name" className="block text-sm font-medium text-gray-700 mb-1">{t('waitlist.name')}</label>
                <input id="wl-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className={inputClass} maxLength={100} autoComplete="name" required />
              </div>
              <div>
                <label htmlFor="wl-business" className="block text-sm font-medium text-gray-700 mb-1">{t('waitlist.business')}</label>
                <input id="wl-business" type="text" value={business} onChange={(e) => setBusiness(e.target.value)}
                  className={inputClass} maxLength={150} autoComplete="organization" required />
              </div>
              <div>
                <label htmlFor="wl-email" className="block text-sm font-medium text-gray-700 mb-1">{t('waitlist.email')}</label>
                <input id="wl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className={inputClass} maxLength={254} autoComplete="email" required />
              </div>
              <div>
                <label htmlFor="wl-store" className="block text-sm font-medium text-gray-700 mb-1">{t('waitlist.store')}</label>
                <input id="wl-store" type="text" value={store} onChange={(e) => setStore(e.target.value)}
                  className={inputClass} maxLength={200} placeholder="mystore.myshopify.com" required />
              </div>
              <div>
                <label htmlFor="wl-plan" className="block text-sm font-medium text-gray-700 mb-1">{t('waitlist.plan')}</label>
                <select id="wl-plan" value={plan} onChange={(e) => setPlan(e.target.value)} className={inputClass}>
                  <option value="">{t('waitlist.plan.none')}</option>
                  {plannedPlans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (planned ${p.price}/mo)</option>
                  ))}
                </select>
              </div>
              <div className="hidden" aria-hidden="true">
                <label htmlFor="wl-website">Website</label>
                <input id="wl-website" type="text" tabIndex={-1} autoComplete="off"
                  value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <button type="submit" disabled={status === 'sending'}
                className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed mt-2">
                {status === 'sending' ? t('waitlist.sending') : t('waitlist.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
