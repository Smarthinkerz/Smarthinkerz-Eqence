// Auto-DM sequence builder, carried over from Comment to Customer: a trigger (buying
// intent and keywords) and up to ten timed messages. Sequences are saved and ready;
// they start sending once a messaging channel (Instagram or Facebook) is connected.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { api } from '../../lib/api';
import AppShell from './AppShell';

interface Step { delayMinutes: number; body: string }
interface Sequence { id: string; name: string; triggerIntent: number; triggerKeywords: string; steps: Step[]; isActive: boolean; updatedAt: string }
interface Listing { sequences: Sequence[]; allowed: boolean; minPlan: string | null; maxSteps: number; maxSequences: number; sending: boolean }
type Draft = Omit<Sequence, 'id' | 'updatedAt'> & { id?: string };

const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none text-sm';
const btn = 'px-3 py-1.5 rounded-md border border-gray-200 text-sm hover:border-gray-300 disabled:opacity-50';
const blank = (): Draft => ({ name: '', triggerIntent: 70, triggerKeywords: '', steps: [{ delayMinutes: 0, body: '' }], isActive: true });

/** "90" → "1 h 30 min"; used next to each step's delay. */
export function delayLabel(minutes: number): string {
  if (!minutes) return 'immediately';
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ') + ' later';
}

export default function Sequences() {
  return <AppShell>{() => <Body />}</AppShell>;
}

function Body() {
  const [data, setData] = useState<Listing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api<Listing>('/api/v1/sequences').then(setData);
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true); setNote(null);
    try {
      const { id, ...body } = draft;
      await api(id ? `/api/v1/sequences/${id}` : '/api/v1/sequences', { method: id ? 'PUT' : 'POST', body });
      setDraft(null);
      setNote({ ok: true, text: 'Sequence saved.' });
      await load();
    } catch (err) { setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not save.' }); } finally { setBusy(false); }
  }

  async function remove(s: Sequence) {
    if (!confirm(`Delete the sequence "${s.name}"?`)) return;
    try { await api(`/api/v1/sequences/${s.id}`, { method: 'DELETE' }); await load(); }
    catch (err) { setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not delete.' }); }
  }

  const setStep = (i: number, patch: Partial<Step>) => draft && setDraft({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  if (!data) return <p className="text-gray-500">Loading…</p>;
  return (
    <div className="space-y-5 max-w-3xl">
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-gray-900">Auto-DM sequences</h1>
          {data.allowed && !draft && data.sequences.length < data.maxSequences && <button className="btn-primary text-sm px-4 py-2" onClick={() => { setDraft(blank()); setNote(null); }}>New sequence</button>}
        </div>
        <p className="text-sm text-gray-600 mt-1">Plan a series of private messages for customers who show buying intent: when it starts, and what is sent after each delay.</p>
        {!data.sending && (
          <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            <b>Not sending yet.</b> Sequences you build here are saved, but no message is sent until a messaging channel (Instagram or Facebook) is connected to Eqence. That connection is coming soon; today Eqence works with Judge.me product reviews.
          </p>
        )}
        {!data.allowed && (
          <p className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
            Auto-DM sequences are included from the <b>{data.minPlan ?? 'next'}</b> plan up. <Link href="/app/billing" className="text-[#C41E3A] underline">See plans</Link>
          </p>
        )}
        {note && <div role={note.ok ? 'status' : 'alert'} className={`mt-3 p-3 rounded-lg text-sm ${note.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{note.text}</div>}
      </section>

      {draft && (
        <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">{draft.id ? 'Edit sequence' : 'New sequence'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sq-name" className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input id="sq-name" className={input} required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sq-intent" className="block text-xs font-medium text-gray-700 mb-1">Start when buying intent is at least: {draft.triggerIntent} / 100</label>
              <input id="sq-intent" type="range" min={0} max={100} className="w-full" value={draft.triggerIntent} onChange={(e) => setDraft({ ...draft, triggerIntent: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label htmlFor="sq-kw" className="block text-xs font-medium text-gray-700 mb-1">Keywords that also start it (optional, comma separated)</label>
            <input id="sq-kw" className={input} maxLength={500} placeholder="price, how much, بكم" value={draft.triggerKeywords} onChange={(e) => setDraft({ ...draft, triggerKeywords: e.target.value })} />
          </div>
          <ol className="space-y-3">
            {draft.steps.map((s, i) => (
              <li key={i} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                  <span className="font-medium text-gray-900">Message {i + 1}</span>
                  <label className="flex items-center gap-2">Wait
                    <input type="number" min={0} max={43200} className="w-24 px-2 py-1 rounded border border-gray-200" value={s.delayMinutes}
                      onChange={(e) => setStep(i, { delayMinutes: Math.max(0, Math.min(43200, Math.floor(Number(e.target.value) || 0))) })} />
                    minutes <span className="text-gray-400">({delayLabel(s.delayMinutes)})</span>
                  </label>
                  {draft.steps.length > 1 && <button type="button" className="text-red-700 hover:underline" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>Remove</button>}
                </div>
                <textarea dir="auto" rows={3} required maxLength={1000} className={`${input} mt-2`} placeholder="What should this message say?" value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} />
                <div className="text-right text-[11px] text-gray-400">{s.body.length} / 1000</div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <button type="button" className={btn} disabled={draft.steps.length >= data.maxSteps} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { delayMinutes: 60, body: '' }] })}>Add message</button>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
            </div>
            <div className="flex gap-2">
              <button type="button" className={btn} onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : 'Save sequence'}</button>
            </div>
          </div>
        </form>
      )}

      <section className="bg-white rounded-xl border border-gray-200">
        <h2 className="px-5 pt-4 font-semibold text-gray-900">Your sequences <span className="text-sm font-normal text-gray-500">({data.sequences.length} of {data.maxSequences})</span></h2>
        {data.sequences.length === 0 ? <p className="px-5 py-4 text-sm text-gray-500">No sequences yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {data.sequences.map((s) => (
              <li key={s.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{s.name} {!s.isActive && <span className="ms-1 rounded bg-gray-100 px-1.5 text-xs text-gray-600">paused</span>}</div>
                  <div className="text-gray-500">{s.steps.length} message{s.steps.length === 1 ? '' : 's'} · starts at intent {s.triggerIntent}+{s.triggerKeywords ? ` or “${s.triggerKeywords}”` : ''}</div>
                </div>
                {data.allowed && (
                  <div className="flex gap-2">
                    <button className={btn} onClick={() => { setDraft({ id: s.id, name: s.name, triggerIntent: s.triggerIntent, triggerKeywords: s.triggerKeywords, steps: s.steps, isActive: s.isActive }); setNote(null); }}>Edit</button>
                    <button className={`${btn} text-red-700 border-red-200`} onClick={() => remove(s)}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
