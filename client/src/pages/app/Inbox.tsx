// Unified inbox: every review, comment and message with its sentiment, and the reply
// workflow (draft with AI, edit, approve and post, or reject). Items added by hand cannot
// be posted by Eqence, so approving one copies the reply for the merchant to paste.
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

export const sourceLabel: Record<string, string> = {
  judgeme: 'Judge.me', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', whatsapp: 'WhatsApp', manual: 'Other',
};
export const channelLabel: Record<string, string> = { review: 'review', comment: 'comment', dm: 'message' };

const channels = [
  { key: '', label: 'All channels' },
  { key: 'review', label: 'Reviews' },
  { key: 'comment', label: 'Comments' },
  { key: 'dm', label: 'Messages' },
];

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
  const [channel, setChannel] = useState('');
  const [rows, setRows] = useState<InteractionRow[] | null>(null);
  const [usage, setUsage] = useState<{ limit: number; used: number } | null>(null);

  const load = useCallback(async () => {
    const q = `?status=${filter}&channel=${channel}`;
    const [r, u] = await Promise.all([
      api<{ interactions: InteractionRow[] }>(`/api/v1/interactions${q}`),
      api<{ aiActions: { limit: number; used: number } }>('/api/v1/usage'),
    ]);
    setRows(r.interactions);
    setUsage(u.aiActions);
  }, [filter, channel]);

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
      <div role="group" aria-label="Channel" className="flex gap-1 flex-wrap">
        {channels.map((f) => (
          <button key={f.key} onClick={() => setChannel(f.key)} aria-pressed={channel === f.key}
            className={`px-3 py-1 rounded-full text-xs ${channel === f.key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {rows === null ? <p className="text-gray-500">Loading…</p>
        : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
            {filter || channel ? 'Nothing matches these filters.' : <>Nothing here yet. <Link href="/app/connections" className="text-[#C41E3A] hover:underline">Connect your Judge.me store</Link> to import reviews, or <Link href="/app/comments" className="text-[#C41E3A] hover:underline">add a comment by hand</Link>.</>}
          </div>
        ) : rows.map((r) => <ReviewCard key={r.id} row={r} onChange={load} canDraft={!!usage && (usage.limit === -1 || usage.used < usage.limit)} />)}
    </div>
  );
}

export function ReviewCard({ row, onChange, canDraft }: { row: InteractionRow; onChange: () => void; canDraft: boolean }) {
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
    // Added by hand: the merchant sends it on the platform, so put the text on the clipboard first.
    if (row.manual) await navigator.clipboard?.writeText(text.trim()).catch(() => {});
    if (text.trim() !== reply.body) await api(`/api/v1/responses/${reply.id}`, { method: 'PATCH', body: { body: text } });
    await api(`/api/v1/responses/${reply.id}/approve`, { method: 'POST', body: {} });
  });

  return (
    <article className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {row.rating != null && <span aria-label={`${row.rating} out of 5 stars`} className="text-amber-500">{'★'.repeat(row.rating)}<span className="text-gray-300">{'★'.repeat(5 - row.rating)}</span></span>}
        {row.sentiment && <span className={`px-2 py-0.5 rounded border text-xs ${sentimentStyle[row.sentiment]}`}>{row.sentiment}</span>}
        {row.leadScore != null && row.leadScore >= 40 && <span className={`px-2 py-0.5 rounded border text-xs ${row.leadScore >= 70 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-sky-50 text-sky-800 border-sky-200'}`} title="How strongly this customer shows intent to buy">buying intent {row.leadScore}</span>}
        <span className="text-gray-500">
          {row.authorName && (row.authorId ? <Link href={`/app/customers?c=${row.authorId}`} className="font-medium text-gray-800 hover:text-[#C41E3A]">{row.authorName}</Link> : <span className="font-medium text-gray-800">{row.authorName}</span>)}
          {row.authorName ? ' · ' : ''}{sourceLabel[row.source] ?? row.source} {channelLabel[row.channelType] ?? row.channelType}{row.manual ? ' · added by hand' : ''}
        </span>
        {row.subject && <span className="text-gray-500">on {row.subject}</span>}
        <span className="text-gray-400 ms-auto">{new Date(row.postedAt).toLocaleDateString()}</span>
      </div>
      {row.title && <h3 className="mt-2 font-semibold text-gray-900" dir="auto">{row.title}</h3>}
      <p className="mt-1 text-gray-800 whitespace-pre-line" dir="auto">{row.body || <i className="text-gray-400">No text, rating only.</i>}</p>

      {sent && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
          <div className="text-xs text-gray-500 mb-1">{sent.status === 'published' ? `${row.manual ? 'Marked as replied' : 'Replied'} ${sent.publishedAt ? new Date(sent.publishedAt).toLocaleString() : ''}` : 'Posting reply…'}</div>
          <p dir="auto" className="whitespace-pre-line">{sent.body}</p>
        </div>
      )}

      {error && <div role="alert" className="mt-3 p-2 rounded bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>}
      {open?.status === 'failed' && <div role="alert" className="mt-3 p-2 rounded bg-red-50 text-red-700 text-sm border border-red-200">Posting failed: {open.error}. Edit and try again.</div>}

      {!sent && (open ? (
        <div className="mt-4 space-y-2">
          <label className="text-xs font-medium text-gray-600" htmlFor={`reply-${row.id}`}>Your reply ({open.generatedBy === 'ai' ? 'AI draft' : 'edited'}; {row.manual ? `Eqence cannot post to ${sourceLabel[row.source] ?? 'this channel'} yet, so the reply is copied for you to paste there` : 'nothing is posted until you approve'})</label>
          <textarea id={`reply-${row.id}`} dir={rtl ? 'rtl' : 'auto'} rows={4} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-[#C41E3A] outline-none" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy || !text.trim()} onClick={() => approve(open)}>{row.manual ? 'Copy and mark as replied' : 'Approve and post'}</button>
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
          {row.manual && (
            <button className="ms-2 px-3 py-2 text-sm text-gray-500 hover:text-red-700 disabled:opacity-60" disabled={busy}
              onClick={() => confirm('Remove this entry?') && run(() => api(`/api/v1/comments/${row.id}`, { method: 'DELETE' }))}>Remove</button>
          )}
        </div>
      ))}
    </article>
  );
}
