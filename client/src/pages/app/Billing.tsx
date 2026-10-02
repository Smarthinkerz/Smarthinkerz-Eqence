// Plan and billing. Checkout happens on the SmarThinkerz Hub; the plan activates when the
// Hub's signed webhook reaches the API, so the return page waits for that rather than
// trusting the redirect.
import { useEffect, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { api, type Me } from '../../lib/api';
import { storedRef } from '../../lib/ref';
import AppShell from './AppShell';

interface Plan { slug: string; name: string; monthlyUsd: number; yearlyUsd: number | null; channels: number; aiActionsPerMonth: number; contactOnly?: boolean }

const allowance = (n: number) => (n === -1 ? 'Unlimited' : n.toLocaleString());

export default function Billing() {
  return <AppShell>{(me) => <BillingBody me={me} />}</AppShell>;
}

function BillingBody({ me }: { me: Me }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [usage, setUsage] = useState<{ limit: number; used: number } | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ plans: Plan[] }>('/api/pricing').then((r) => setPlans(r.plans));
    api<{ aiActions: { limit: number; used: number } }>('/api/v1/usage').then((r) => setUsage(r.aiActions));
  }, []);

  const t = me.tenant;
  const active = t?.planStatus === 'active' && (!t.planExpiresAt || new Date(t.planExpiresAt) > new Date());
  const current = active ? plans?.find((p) => p.slug === t?.plan) : undefined;

  async function buy(plan: Plan) {
    setBusy(plan.slug); setError('');
    try {
      const ref = storedRef();
      const q = new URLSearchParams({ plan: plan.slug, cycle, ...(ref ? { ref } : {}) });
      const { url } = await api<{ url: string }>(`/api/v1/billing/checkout-url?${q}`);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h1 className="text-lg font-bold text-gray-900">Your plan</h1>
        <p className="text-sm text-gray-700 mt-1">
          {me.user.isSuperUser ? 'Super user: unlimited access, no plan needed.'
            : current ? <>You are on <b>{current.name}</b> ({t?.planCycle}). {t?.planExpiresAt && <>Renews or ends on {new Date(t.planExpiresAt).toLocaleDateString()}.</>}</>
            : t?.planStatus === 'cancelled' ? 'Your plan was cancelled. Choose a plan to continue drafting replies.'
            : 'No active plan. Reviews are imported and analysed for free; choose a plan to draft replies with AI.'}
        </p>
        {usage && <p className="text-sm text-gray-600 mt-1">AI replies this month: <b>{usage.used}</b>{usage.limit === -1 ? ' (unlimited)' : ` of ${usage.limit}`}</p>}
      </section>

      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h2 className="font-semibold text-gray-900">Plans</h2>
          <div role="group" aria-label="Billing period" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button key={c} onClick={() => setCycle(c)} aria-pressed={cycle === c}
                className={`px-3 py-1.5 rounded-md ${cycle === c ? 'bg-[#C41E3A] text-white' : 'text-gray-700'}`}>
                {c === 'monthly' ? 'Monthly' : 'Annual (2 months free)'}
              </button>
            ))}
          </div>
        </div>
        {error && <div role="alert" className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        {plans === null ? <p className="text-gray-500">Loading…</p> : plans.length === 0 ? <p className="text-gray-600">Plans are not available yet.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => {
              const price = cycle === 'yearly' && p.yearlyUsd != null ? p.yearlyUsd : p.monthlyUsd;
              const isCurrent = current?.slug === p.slug;
              return (
                <div key={p.slug} className={`bg-white rounded-xl border-2 p-5 ${isCurrent ? 'border-[#C41E3A]' : 'border-gray-100'}`}>
                  <h3 className="font-bold text-gray-900">{p.name}</h3>
                  <div className="mt-2"><span className="text-3xl font-black text-gray-900">${price.toLocaleString()}</span><span className="text-gray-500">/{cycle === 'yearly' ? 'year' : 'month'}</span></div>
                  <ul className="mt-3 space-y-1 text-sm text-gray-600">
                    <li>{allowance(p.aiActionsPerMonth)} AI-drafted replies a month</li>
                    <li>{p.channels === -1 ? 'Unlimited' : p.channels} connected {p.channels === 1 ? 'source' : 'sources'}</li>
                    <li>Review import, sentiment analysis and alerts included</li>
                  </ul>
                  {p.contactOnly ? (
                    <a href="mailto:reply@smarthinkerz.com?subject=Eqence%20Enterprise" className="mt-4 block text-center py-2.5 rounded-lg border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:border-[#C41E3A]">Contact us</a>
                  ) : (
                    <button onClick={() => buy(p)} disabled={!!busy || me.user.isSuperUser}
                      className="mt-4 w-full btn-primary text-sm py-2.5 disabled:opacity-60">
                      {busy === p.slug ? 'Opening checkout…' : isCurrent ? 'Renew' : 'Choose plan'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">Payment is taken by SmarThinkerz, Eqence's parent company, on a secure checkout page.</p>
      </section>
    </div>
  );
}

// Where the Hub sends the buyer back. The redirect's status is only a hint: the plan is
// active when our API says so, which happens when the Hub's webhook arrives.
export function BillingReturn() {
  return <AppShell>{() => <ReturnBody />}</AppShell>;
}

function ReturnBody() {
  const status = new URLSearchParams(useSearch()).get('status');
  const [state, setState] = useState<'waiting' | 'active' | 'timeout'>('waiting');

  useEffect(() => {
    if (status !== 'paid') return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      const me = await api<Me>('/api/v1/me').catch(() => null);
      const ok = me?.tenant?.planStatus === 'active' && (!me.tenant.planExpiresAt || new Date(me.tenant.planExpiresAt) > new Date());
      if (ok) { setState('active'); clearInterval(t); } else if (tries >= 20) { setState('timeout'); clearInterval(t); }
    }, 3000);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-xl">
      {status !== 'paid' ? (
        <><h1 className="text-lg font-bold text-gray-900">Payment not completed</h1>
          <p className="text-gray-700 mt-2">{status === 'cancelled' ? 'You cancelled the checkout.' : 'The payment did not go through.'} Nothing was charged to your plan.</p></>
      ) : state === 'active' ? (
        <><h1 className="text-lg font-bold text-gray-900">Your plan is active</h1>
          <p className="text-gray-700 mt-2">Thank you. You can now draft replies with AI.</p></>
      ) : state === 'timeout' ? (
        <><h1 className="text-lg font-bold text-gray-900">Payment received, activation pending</h1>
          <p className="text-gray-700 mt-2">Your payment went through but the plan has not activated yet. This usually resolves within a few minutes. If it does not, email reply@smarthinkerz.com.</p></>
      ) : (
        <><h1 className="text-lg font-bold text-gray-900">Confirming your payment…</h1>
          <p role="status" className="text-gray-700 mt-2">This takes a few seconds.</p></>
      )}
      <div className="mt-5 flex gap-4 text-sm">
        <Link href="/app" className="text-[#C41E3A] hover:underline">Go to inbox</Link>
        <Link href="/app/billing" className="text-[#C41E3A] hover:underline">Billing</Link>
      </div>
    </div>
  );
}
