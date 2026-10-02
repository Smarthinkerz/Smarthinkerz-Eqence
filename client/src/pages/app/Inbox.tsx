// Review inbox: every ingested review with its sentiment, and the reply workflow
// (draft with AI, edit, approve and post, or reject).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { api, ApiError, type InteractionRow, type ReplyRow } from '../../lib/api';
import AppShell from './AppShell';

const sentimentStyle: Record<string, string> = {
  negative: 'bg-red-50 text-red-700 border-red-200',
  mixed: 'bg-amber-50 text-amber-800 border-amber-200',
  neutral: 'bg-gray-50 text-gray-700 border-gray-200',
  positive: 'bg-green-50 text-green-700 border-green-200',
};

const filters = [
  { key: '', label: 'All' },
  { key: 'triaged', label: 'Needs reply' },
  { key: 'responded', label: 'Replied' },
  { key: 'new', label: 'Not analysed yet' },
];

export default function Inbox() {
  return <AppShell>{() => <InboxBody />}</AppShell>;
}

function InboxBody() {
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<InteractionRow[] | null>(null);
  const [usage, setUsage] = useState<{ limit: number; used: number } | null>(null);

  const load = useCallback(async () => {
    const q = filter ? `?status=${filter}` : '';
    const [r, u] = await Promise.all([
      api<{ interactions: InteractionRow[] }>(`/api/v1/interactions${q}`),
      api<{ aiActions: { limit: number; used: number } }>('/api/v1/usage'),
    ]);
    setRows(r.interactions);
    setUsage(u.aiActions);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  // Replies are posted by the worker; refresh while any is on its way.
  useEffect(() => {
    if (!rows?.some((r) => r.responses.some((x) => x.status === 'approved'))) return;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [rows, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 flex-wrap">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm ${filter === f.key ? 'bg-[#C41E3A] text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {usage && (
          <div className="text-sm text-gray-600">
            AI replies this month: <b>{usage.used}</b>{usage.limit === -1 ? ' (unlimited)' : ` of ${usage.limit}`}
          </div>
        )}
      </div>

      {rows === null ? <p className="text-gray-500">Loading…</p>
        : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
            No reviews yet. <Link href="/app/connections" className="text-[#C41E3A] hover:underline">Connect your Judge.me store</Link> to import them.
          </div>
        ) : rows.map((r) => <ReviewCard key={r.id} row={r} onChange={load} canDraft={!!usage && (usage.limit === -1 || usage.used < usage.limit)} />)}
    </div>
  );
}

function ReviewCard({ row, onChange, canDraft }: { row: InteractionRow; onChange: () => void; canDraft: boolean }) {
  const open = row.responses.find((x) => ['draft', 'pending_approval', 'failed'].includes(x.status));
  const sent = row.responses.find((x) => x.status === 'published' || x.status === 'approved');
  const [text, setText] = useState(open?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rtl = row.language === 'ar';

  useEffect(() => { setText(open?.body ?? ''); }, [open?.id, open?.body]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); onChange(); }
    catch (err) { setError(err instanceof ApiError && err.status === 402 ? err.message : err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  const approve = (reply: ReplyRow) => run(async () => {
    if (text.trim() !== reply.body) await api(`/api/v1/responses/${reply.id}`, { method: 'PATCH', body: { body: text } });
    await api(`/api/v1/responses/${reply.id}/approve`, { method: 'POST', body: {} });
  });

  return (
    <article className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {row.rating != null && <span aria-label={`${row.rating} out of 5 stars`} className="text-amber-500">{'★'.repeat(row.rating)}<span className="text-gray-300">{'★'.repeat(5 - row.rating)}</span></span>}
        {row.sentiment && <span className={`px-2 py-0.5 rounded border text-xs ${sentimentStyle[row.sentiment]}`}>{row.sentiment}</span>}
        {row.subject && <span className="text-gray-500">on {row.subject}</span>}
        <span className="text-gray-400 ms-auto">{new Date(row.postedAt).toLocaleDateString()}</span>
      </div>
      {row.title && <h3 className="mt-2 font-semibold text-gray-900" dir="auto">{row.title}</h3>}
      <p className="mt-1 text-gray-800 whitespace-pre-line" dir="auto">{row.body || <i className="text-gray-400">No text, rating only.</i>}</p>

      {sent && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
          <div className="text-xs text-gray-500 mb-1">{sent.status === 'published' ? `Replied ${sent.publishedAt ? new Date(sent.publishedAt).toLocaleString() : ''}` : 'Posting reply…'}</div>
          <p dir="auto" className="whitespace-pre-line">{sent.body}</p>
        </div>
      )}

      {error && <div role="alert" className="mt-3 p-2 rounded bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>}
      {open?.status === 'failed' && <div role="alert" className="mt-3 p-2 rounded bg-red-50 text-red-700 text-sm border border-red-200">Posting failed: {open.error}. Edit and try again.</div>}

      {!sent && (open ? (
        <div className="mt-4 space-y-2">
          <label className="text-xs font-medium text-gray-600" htmlFor={`reply-${row.id}`}>Your reply ({open.generatedBy === 'ai' ? 'AI draft' : 'edited'}; nothing is posted until you approve)</label>
          <textarea id={`reply-${row.id}`} dir={rtl ? 'rtl' : 'auto'} rows={4} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-[#C41E3A] outline-none" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy || !text.trim()} onClick={() => approve(open)}>Approve and post</button>
            <button className="px-4 py-2 text-sm rounded-lg border border-gray-200 disabled:opacity-60" disabled={busy}
              onClick={() => run(() => api(`/api/v1/responses/${open.id}/reject`, { method: 'POST', body: {} }))}>Discard</button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button className="px-4 py-2 text-sm rounded-lg border border-[#C41E3A] text-[#C41E3A] hover:bg-red-50 disabled:opacity-60"
            disabled={busy || !canDraft} title={canDraft ? '' : 'No AI replies available: choose or upgrade a plan under Billing'}
            onClick={() => run(() => api(`/api/v1/interactions/${row.id}/draft`, { method: 'POST', body: {} }))}>
            {busy ? 'Drafting…' : 'Draft a reply'}
          </button>
        </div>
      ))}
    </article>
  );
}
