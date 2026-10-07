// Leads: customers whose reviews, comments or messages show intent to buy. The score is
// the AI's reading of their strongest message (0 to 100); the stage is set by the merchant.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { api, API_URL } from '../../lib/api';
import AppShell from './AppShell';
import { sourceLabel } from './Inbox';

export interface CustomerRow {
  id: string; displayName: string | null; stage: string; tags: string[]; email: string | null; phone: string | null; notes: string | null;
  firstSeenAt: string; lastSeenAt: string; interactions: number; open: number; avgRating: number | null; leadScore: number | null;
  lastActivity: string | null; lastSentiment: string | null; topIntent: string | null; source: string | null;
}
interface Listing { leads: CustomerRow[]; stats: { total: number; hot: number; contacted: number; won: number }; stages: string[]; hotScore: number; minScore?: number }

export const stageLabel: Record<string, string> = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', won: 'Won', lost: 'Lost' };
export const intentLabel: Record<string, string> = { purchase_intent: 'Wants to buy', question: 'Question', praise: 'Praise', complaint: 'Complaint', spam: 'Spam', other: 'Other' };
export const ago = (iso: string | null) => {
  if (!iso) return '-';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 43200 ? `${Math.round(m / 1440)} d ago` : new Date(iso).toLocaleDateString();
};

export function ScoreBadge({ score, hot = 70 }: { score: number | null; hot?: number }) {
  if (score == null) return <span className="text-gray-400">-</span>;
  const cls = score >= hot ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : score >= 40 ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-gray-50 text-gray-600 border-gray-200';
  return <span className={`inline-block min-w-[2.25rem] text-center px-2 py-0.5 rounded border text-xs font-semibold ${cls}`}>{score}</span>;
}

export function StageSelect({ id, stage, stages, onSaved }: { id: string; stage: string; stages: string[]; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <select aria-label="Stage" disabled={busy} value={stage}
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-[#C41E3A] outline-none"
      onChange={async (e) => {
        setBusy(true);
        try { await api(`/api/v1/customers/${id}`, { method: 'PATCH', body: { stage: e.target.value } }); onSaved(); }
        finally { setBusy(false); }
      }}>
      {stages.map((s) => <option key={s} value={s}>{stageLabel[s] ?? s}</option>)}
    </select>
  );
}

export default function Leads() {
  return <AppShell>{() => <Body />}</AppShell>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-4"><div className="text-2xl font-bold text-gray-900">{value}</div><div className="text-xs text-gray-500">{label}</div></div>;
}

function Body() {
  const [stage, setStage] = useState('');
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api<Listing>(`/api/v1/leads?stage=${stage}`).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load')), [stage]);
  useEffect(() => { load(); }, [load]);

  async function exportCsv() {
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/leads/export`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `eqence-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed'); }
  }

  if (!data) return <p className="text-gray-500">{error || 'Loading…'}</p>;
  const s = data.stats;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads" value={s.total} />
        <Stat label={`Hot leads (score ${data.hotScore}+)`} value={s.hot} />
        <Stat label="Contacted or further" value={s.contacted} />
        <Stat label="Won" value={s.total ? `${s.won} (${Math.round((s.won / s.total) * 100)}%)` : 0} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {['', ...data.stages].map((st) => (
            <button key={st} onClick={() => setStage(st)} aria-pressed={stage === st}
              className={`px-3 py-1.5 rounded-md text-sm ${stage === st ? 'bg-[#C41E3A] text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>{st ? stageLabel[st] : 'All stages'}</button>
          ))}
        </div>
        <button className="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm hover:border-gray-300 disabled:opacity-50" disabled={!s.total} onClick={exportCsv}>Export CSV</button>
      </div>
      {error && <div role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {data.leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
          {s.total ? 'No leads at this stage.' : <>No leads yet. A customer becomes a lead when a review, comment or message of theirs shows intent to buy (score {data.minScore ?? 40} or more). <Link href="/app/comments" className="text-[#C41E3A] hover:underline">Add a comment</Link> to see it work.</>}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-2">Lead</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Score</th><th className="px-4 py-2">Intent</th><th className="px-4 py-2">Stage</th><th className="px-4 py-2">Last activity</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.leads.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2">
                    <Link href={`/app/customers?c=${l.id}`} className="font-medium text-gray-900 hover:text-[#C41E3A]" dir="auto">{l.displayName ?? 'Unnamed'}</Link>
                    <div className="text-xs text-gray-500">{l.interactions} interaction{l.interactions === 1 ? '' : 's'}{l.tags.length ? ` · ${l.tags.join(', ')}` : ''}</div>
                  </td>
                  <td className="px-4 py-2 text-xs">{l.source ? sourceLabel[l.source] ?? l.source : '-'}</td>
                  <td className="px-4 py-2"><ScoreBadge score={l.leadScore} hot={data.hotScore} /></td>
                  <td className="px-4 py-2 text-xs">{l.topIntent ? intentLabel[l.topIntent] ?? l.topIntent : '-'}</td>
                  <td className="px-4 py-2"><StageSelect id={l.id} stage={l.stage} stages={data.stages} onSaved={load} /></td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{ago(l.lastActivity)}</td>
                  <td className="px-4 py-2 text-right"><Link href={`/app/customers?c=${l.id}`} className="text-xs text-[#C41E3A] hover:underline">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-500">The score is the AI's reading of each customer's strongest message, from 0 to 100. It is a guide for who to contact first, not a guarantee of a sale.</p>
    </div>
  );
}
