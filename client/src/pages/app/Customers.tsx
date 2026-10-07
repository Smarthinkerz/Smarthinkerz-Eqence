// Customers (CRM): one record per person per platform, built from their real reviews,
// comments and messages. The merchant adds what only they know: stage, notes, tags and
// contact details. Opening a customer shows their whole history with the replies sent.
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { api } from '../../lib/api';
import AppShell from './AppShell';
import { channelLabel, sourceLabel } from './Inbox';
import { ago, intentLabel, ScoreBadge, stageLabel, StageSelect, type CustomerRow } from './Leads';

interface TimelineItem {
  id: string; source: string; channelType: string; subject: string | null; title: string | null; body: string; rating: number | null;
  sentiment: string | null; intent: string | null; leadScore: number | null; status: string; postedAt: string;
  reply: { body: string; publishedAt: string | null } | null;
}
const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none text-sm';
const sentimentDot: Record<string, string> = { positive: 'bg-green-500', neutral: 'bg-gray-400', negative: 'bg-red-500', mixed: 'bg-amber-500' };

export default function Customers() {
  return <AppShell>{() => <Body />}</AppShell>;
}

function Body() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const openId = new URLSearchParams(search).get('c');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [data, setData] = useState<{ customers: CustomerRow[]; total: number; stages: string[] } | null>(null);

  const load = useCallback(() => api<{ customers: CustomerRow[]; total: number; stages: string[] }>(`/api/v1/customers?q=${encodeURIComponent(q)}&stage=${stage}`).then(setData), [q, stage]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  if (openId) return <Detail id={openId} stages={data?.stages ?? ['new', 'contacted', 'qualified', 'won', 'lost']} onBack={() => { navigate('/app/customers'); load(); }} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">Customers <span className="text-sm font-normal text-gray-500">({data?.total ?? 0})</span></h1>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="">All stages</option>
            {(data?.stages ?? []).map((s) => <option key={s} value={s}>{stageLabel[s] ?? s}</option>)}
          </select>
          <input type="search" placeholder="Search name, email, phone or tag" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} sm:w-72`} />
        </div>
      </div>
      {!data ? <p className="text-gray-500">Loading…</p> : data.customers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
          {data.total ? 'Nobody matches this search.' : 'No customers yet. Each person who leaves a review, comment or message gets a record here automatically.'}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">History</th><th className="px-4 py-2">Rating</th><th className="px-4 py-2">Buying score</th><th className="px-4 py-2">Stage</th><th className="px-4 py-2">Last seen</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.customers.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/app/customers?c=${c.id}`)}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className={`h-2 w-2 rounded-full ${sentimentDot[c.lastSentiment ?? ''] ?? 'bg-gray-200'}`} title={c.lastSentiment ? `Last message: ${c.lastSentiment}` : ''} />
                      <button className="font-medium text-gray-900 hover:text-[#C41E3A] text-start" dir="auto" onClick={(e) => { e.stopPropagation(); navigate(`/app/customers?c=${c.id}`); }}>{c.displayName ?? 'Unnamed'}</button>
                    </div>
                    {(c.email || c.tags.length > 0) && <div className="ms-4 text-xs text-gray-500">{[c.email, c.tags.join(', ')].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs">{c.source ? sourceLabel[c.source] ?? c.source : '-'}</td>
                  <td className="px-4 py-2 text-xs">{c.interactions} total{c.open ? `, ${c.open} open` : ''}</td>
                  <td className="px-4 py-2 text-xs">{c.avgRating != null ? `${c.avgRating} ★` : '-'}</td>
                  <td className="px-4 py-2"><ScoreBadge score={c.leadScore} /></td>
                  <td className="px-4 py-2 text-xs">{stageLabel[c.stage] ?? c.stage}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{ago(c.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Detail({ id, stages, onBack }: { id: string; stages: string[]; onBack: () => void }) {
  const [data, setData] = useState<{ customer: CustomerRow; timeline: TimelineItem[] } | null>(null);
  const [form, setForm] = useState({ notes: '', tags: '', email: '', phone: '' });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => api<{ customer: CustomerRow; timeline: TimelineItem[] }>(`/api/v1/customers/${id}`).then((d) => {
    setData(d);
    setForm({ notes: d.customer.notes ?? '', tags: d.customer.tags.join(', '), email: d.customer.email ?? '', phone: d.customer.phone ?? '' });
  }).catch(() => setMissing(true)), [id]);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      await api(`/api/v1/customers/${id}`, { method: 'PATCH', body: form });
      setNote({ ok: true, text: 'Saved.' });
      await load();
    } catch (err) { setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not save.' }); } finally { setBusy(false); }
  }

  const back = <button className="text-sm text-[#C41E3A] hover:underline" onClick={onBack}>← All customers</button>;
  if (missing) return <div className="space-y-4">{back}<p className="bg-white rounded-xl border border-gray-200 p-6 text-gray-600">This customer was not found.</p></div>;
  if (!data) return <p className="text-gray-500">Loading…</p>;
  const c = data.customer;
  return (
    <div className="space-y-5">
      {back}
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-gray-900" dir="auto">{c.displayName ?? 'Unnamed'}</h1>
              <StageSelect id={c.id} stage={c.stage} stages={stages} onSaved={load} />
            </div>
            <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><dt className="text-xs text-gray-500">Source</dt><dd>{c.source ? sourceLabel[c.source] ?? c.source : '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Interactions</dt><dd>{c.interactions}{c.open ? ` (${c.open} open)` : ''}</dd></div>
              <div><dt className="text-xs text-gray-500">Average rating</dt><dd>{c.avgRating != null ? `${c.avgRating} of 5` : '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Buying score</dt><dd><ScoreBadge score={c.leadScore} /></dd></div>
              <div><dt className="text-xs text-gray-500">First seen</dt><dd>{new Date(c.firstSeenAt).toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-gray-500">Last activity</dt><dd>{ago(c.lastActivity)}</dd></div>
            </dl>
          </section>

          <section className="bg-white rounded-xl border border-gray-200">
            <h2 className="px-5 pt-4 font-semibold text-gray-900">History</h2>
            {data.timeline.length === 0 ? <p className="px-5 py-4 text-sm text-gray-500">Nothing from this customer yet.</p> : (
              <ol className="divide-y divide-gray-100">
                {data.timeline.map((t) => (
                  <li key={t.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span aria-hidden className={`h-2 w-2 rounded-full ${sentimentDot[t.sentiment ?? ''] ?? 'bg-gray-200'}`} />
                      <span className="font-medium text-gray-700">{sourceLabel[t.source] ?? t.source} {channelLabel[t.channelType] ?? t.channelType}</span>
                      {t.rating != null && <span className="text-amber-500">{'★'.repeat(t.rating)}<span className="text-gray-300">{'★'.repeat(5 - t.rating)}</span></span>}
                      {t.intent && <span>{intentLabel[t.intent] ?? t.intent}</span>}
                      {t.leadScore != null && t.leadScore >= 40 && <span>buying intent {t.leadScore}</span>}
                      <span className="ms-auto">{new Date(t.postedAt).toLocaleString()}</span>
                    </div>
                    {t.title && <div className="mt-1 font-medium text-gray-900" dir="auto">{t.title}</div>}
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-line" dir="auto">{t.body}</p>
                    {t.reply ? (
                      <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
                        <div className="text-xs text-gray-500 mb-1">Your reply{t.reply.publishedAt ? ` · ${new Date(t.reply.publishedAt).toLocaleString()}` : ''}</div>
                        <p dir="auto" className="whitespace-pre-line">{t.reply.body}</p>
                      </div>
                    ) : <div className="mt-2 text-xs text-amber-700">No reply yet</div>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 h-fit">
          <h2 className="font-semibold text-gray-900">Your notes</h2>
          <p className="text-xs text-gray-500">Only you see these. They are never sent to the customer or to the AI.</p>
          <label className="block text-xs font-medium text-gray-700">Notes
            <textarea dir="auto" rows={5} maxLength={4000} className={`${input} mt-1`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <label className="block text-xs font-medium text-gray-700">Tags (comma separated)
            <input className={`${input} mt-1`} placeholder="wholesale, vip" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </label>
          <label className="block text-xs font-medium text-gray-700">Email
            <input type="email" className={`${input} mt-1`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block text-xs font-medium text-gray-700">Phone
            <input className={`${input} mt-1`} placeholder="+968 9123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <div className="flex items-center gap-3">
            <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            {note && <span role={note.ok ? 'status' : 'alert'} className={`text-sm ${note.ok ? 'text-green-700' : 'text-red-700'}`}>{note.text}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
