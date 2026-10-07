// Comments and messages from channels that are not connected directly yet. The merchant
// pastes what a customer wrote on Instagram, Facebook, TikTok or WhatsApp; Eqence reads
// it (sentiment, intent, buying score), drafts a reply, and the merchant sends that reply
// on the platform. Everything shown here is the workspace's own data.
import { useCallback, useEffect, useState } from 'react';
import { api, type InteractionRow } from '../../lib/api';
import AppShell from './AppShell';
import { ReviewCard, sourceLabel } from './Inbox';

const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none text-sm';
const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'manual'];
interface Stats { total: number; replied: number; pending: number; hot: number }

export default function Comments() {
  return <AppShell>{() => <Body />}</AppShell>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-4"><div className="text-2xl font-bold text-gray-900">{value}</div><div className="text-xs text-gray-500">{label}</div></div>;
}

function Body() {
  const [rows, setRows] = useState<InteractionRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<{ limit: number; used: number } | null>(null);
  const [platform, setPlatform] = useState('');
  const [form, setForm] = useState({ platform: 'instagram', channelType: 'comment', authorName: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [r, s, u] = await Promise.all([
      api<{ interactions: InteractionRow[] }>('/api/v1/interactions?channel=social'),
      api<Stats>('/api/v1/comments/stats'),
      api<{ aiActions: { limit: number; used: number } }>('/api/v1/usage'),
    ]);
    setRows(r.interactions); setStats(s); setUsage(u.aiActions);
  }, []);
  useEffect(() => { load(); }, [load]);
  // A new entry is read by the AI in the background; refresh until its labels arrive.
  useEffect(() => {
    if (!rows?.some((r) => r.status === 'new')) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [rows, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      await api('/api/v1/comments', { method: 'POST', body: form });
      setForm({ ...form, authorName: '', body: '' });
      setNote({ ok: true, text: 'Added. Eqence is reading it now.' });
      await load();
    } catch (err) { setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not add it.' }); } finally { setBusy(false); }
  }

  const shown = (rows ?? []).filter((r) => !platform || r.source === platform);
  const canDraft = !!usage && (usage.limit === -1 || usage.used < usage.limit);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Comments and messages" value={stats?.total ?? 0} />
        <Stat label="Replied" value={stats?.replied ?? 0} />
        <Stat label="Waiting for a reply" value={stats?.pending ?? 0} />
        <Stat label="Strong buying intent" value={stats?.hot ?? 0} />
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h1 className="text-lg font-bold text-gray-900">Add a comment or message</h1>
        <p className="text-sm text-gray-600 mt-1">
          Paste what a customer wrote on Instagram, Facebook, TikTok or WhatsApp. Eqence reads it, scores the buying intent and drafts a reply for you to send there.
          Direct connection to Instagram and Facebook is coming soon; until then entries are added by hand.
        </p>
        <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[10rem_9rem_1fr]">
          <label className="text-xs font-medium text-gray-700">Where
            <select className={`${input} mt-1`} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{sourceLabel[p]}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-700">Type
            <select className={`${input} mt-1`} value={form.channelType} onChange={(e) => setForm({ ...form, channelType: e.target.value })}>
              <option value="comment">Public comment</option>
              <option value="dm">Private message</option>
            </select>
          </label>
          <label className="text-xs font-medium text-gray-700">Customer name or handle
            <input className={`${input} mt-1`} required maxLength={80} placeholder="@sarah_m" value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-gray-700 sm:col-span-3">What they wrote
            <textarea dir="auto" className={`${input} mt-1`} rows={3} required maxLength={2000} placeholder="How much is this? Can you deliver to Sohar?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
            {note && <span role={note.ok ? 'status' : 'alert'} className={`text-sm ${note.ok ? 'text-green-700' : 'text-red-700'}`}>{note.text}</span>}
          </div>
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-1">
        {['', ...PLATFORMS].map((p) => (
          <button key={p} onClick={() => setPlatform(p)} aria-pressed={platform === p}
            className={`px-3 py-1 rounded-full text-xs ${platform === p ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>{p ? sourceLabel[p] : 'All platforms'}</button>
        ))}
      </div>

      {rows === null ? <p className="text-gray-500">Loading…</p>
        : shown.length === 0 ? <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">No comments or messages yet. Add the first one above.</div>
          : shown.map((r) => <ReviewCard key={r.id} row={r} onChange={load} canDraft={canDraft} />)}
    </div>
  );
}
