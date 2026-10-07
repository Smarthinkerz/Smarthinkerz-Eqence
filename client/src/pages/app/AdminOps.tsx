// Admin operations carried over from Comment to Customer's admin console:
// Audit log (search and CSV export), Security (active sessions, IP bans, API keys)
// and System (health monitor and failed-job replay).
import { useCallback, useEffect, useState } from 'react';
import { api, API_URL } from '../../lib/api';
import { deviceName } from './Account';
import { AdminTabs } from './AdminBlog';
import AppShell from './AppShell';

const input = 'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C41E3A] outline-none';
const btn = 'px-2.5 py-1 rounded-md border border-gray-200 text-xs hover:border-gray-300 disabled:opacity-50';
const card = 'bg-white rounded-xl border border-gray-200';
const th = 'px-4 py-2 text-left text-xs uppercase text-gray-500';
const td = 'px-4 py-2 align-top';
type Note = { ok: boolean; text: string } | null;
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : '-');
const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function Notice({ note }: { note: Note }) {
  if (!note) return null;
  return <div role={note.ok ? 'status' : 'alert'} className={`p-3 rounded-lg text-sm ${note.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{note.text}</div>;
}

/* ───────────── Audit log ───────────── */

interface AuditEntry { id: number; createdAt: string; action: string; actorEmail: string | null; actorUserId: string | null; target: string | null; detail: unknown }

export function AdminAudit() {
  return <AppShell admin>{() => <AuditBody />}</AppShell>;
}

function AuditBody() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ entries: AuditEntry[]; total: number } | null>(null);
  const [note, setNote] = useState<Note>(null);
  const load = useCallback(() => api<{ entries: AuditEntry[]; total: number }>(`/api/v1/admin/audit?q=${encodeURIComponent(q)}&page=${page}`).then(setData), [q, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function exportCsv() {
    setNote(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/audit/export?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `eqence-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setNote({ ok: false, text: errText(e, 'Export failed') }); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  return (
    <div className="space-y-5">
      <AdminTabs active="audit" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">Audit log <span className="text-sm font-normal text-gray-500">({data?.total ?? 0})</span></h1>
        <div className="flex flex-wrap gap-2">
          <input type="search" placeholder="Search action, account or target" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className={`${input} w-full sm:w-72`} />
          <button className="btn-primary text-sm px-4 py-2" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>
      <Notice note={note} />
      {!data ? <p className="text-gray-500">Loading…</p> : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className={th}>Time</th><th className={th}>Action</th><th className={th}>By</th><th className={th}>Target</th><th className={th}>Detail</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} whitespace-nowrap text-xs text-gray-500`}>{when(e.createdAt)}</td>
                  <td className={`${td} font-medium text-gray-900`}>{e.action}</td>
                  <td className={`${td} text-xs`}>{e.actorEmail ?? (e.actorUserId ? 'deleted account' : 'system')}</td>
                  <td className={`${td} text-xs break-all max-w-[14rem]`}>{e.target ?? '-'}</td>
                  <td className={`${td} text-xs text-gray-600 break-all max-w-[22rem]`}>{e.detail ? JSON.stringify(e.detail) : ''}</td>
                </tr>
              ))}
              {data.entries.length === 0 && <tr><td className={`${td} text-gray-500`} colSpan={5}>Nothing matches.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-gray-600">Page {page} of {pages}</span>
          <button className={btn} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

/* ───────────── Security: sessions, IP bans, API keys ───────────── */

interface AdminSession { id: string; userId: string; email: string; role: string; ipAddress: string | null; userAgent: string | null; createdAt: string; current: boolean }
interface Ban { ip: string; reason: string | null; bannedUntil: string; createdAt: string; bannedByEmail: string | null }
interface ApiKeyRow { id: string; keyId: string; label: string | null; scopes: string[]; ipAllowlist: string[]; ratePerMin: number; revoked: boolean; lastUsedAt: string | null; createdAt: string; ownerEmail: string }

export function AdminSecurity() {
  return <AppShell admin>{() => <SecurityBody />}</AppShell>;
}

function SecurityBody() {
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);
  const [bans, setBans] = useState<{ bans: Ban[]; yourIp: string } | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [ban, setBan] = useState({ ip: '', reason: '', hours: 24 });
  const [key, setKey] = useState({ label: '', scopes: '', ipAllowlist: '', ratePerMin: 60 });
  const [issued, setIssued] = useState<string | null>(null);

  const load = useCallback(() => Promise.all([
    api<{ sessions: AdminSession[] }>('/api/v1/admin/sessions').then((r) => setSessions(r.sessions)),
    api<{ bans: Ban[]; yourIp: string }>('/api/v1/admin/bans').then(setBans),
    api<{ keys: ApiKeyRow[] }>('/api/v1/admin/api-keys').then((r) => setKeys(r.keys)),
  ]), []);
  useEffect(() => { load(); }, [load]);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setNote(null);
    try { await fn(); setNote({ ok: true, text: what }); await load(); }
    catch (e) { setNote({ ok: false, text: errText(e, 'That did not work') }); }
  };

  return (
    <div className="space-y-5">
      <AdminTabs active="security" />
      <Notice note={note} />

      <section className={card}>
        <h2 className="px-5 pt-4 font-semibold text-gray-900">Active sessions <span className="text-sm font-normal text-gray-500">({sessions?.length ?? 0})</span></h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mt-2">
            <thead className="bg-gray-50"><tr><th className={th}>Account</th><th className={th}>Device</th><th className={th}>Address</th><th className={th}>Since</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(sessions ?? []).map((s) => (
                <tr key={s.id}>
                  <td className={td}>{s.email}{s.role === 'admin' && <span className="ms-1 rounded bg-gray-100 px-1.5 text-xs text-gray-600">admin</span>}</td>
                  <td className={`${td} text-xs`}>{deviceName(s.userAgent)}</td>
                  <td className={`${td} text-xs`}>{s.ipAddress ?? '-'}</td>
                  <td className={`${td} text-xs whitespace-nowrap`}>{when(s.createdAt)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {s.current ? <span className="text-xs text-gray-400">this session</span> : (
                      <div className="flex justify-end gap-2">
                        <button className={btn} onClick={() => confirm(`End this session of ${s.email}?`) && run('Session ended.', () => api('/api/v1/admin/sessions/revoke', { method: 'POST', body: { sessionId: s.id } }))}>End</button>
                        <button className={btn} onClick={() => confirm(`Sign ${s.email} out everywhere?`) && run(`${s.email} signed out everywhere.`, () => api('/api/v1/admin/sessions/revoke', { method: 'POST', body: { userId: s.userId } }))}>End all</button>
                        {s.ipAddress && <button className={`${btn} text-red-700 border-red-200`} onClick={() => setBan({ ...ban, ip: s.ipAddress! })}>Ban address…</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} p-5`}>
        <h2 className="font-semibold text-gray-900">Banned addresses <span className="text-sm font-normal text-gray-500">({bans?.bans.length ?? 0})</span></h2>
        <p className="text-sm text-gray-600 mt-1">A banned address cannot open the app or sign in until the ban ends. Your address is {bans?.yourIp ?? '…'} and cannot be banned.</p>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(`${ban.ip} banned for ${ban.hours} hours.`, async () => { await api('/api/v1/admin/bans', { method: 'POST', body: ban }); setBan({ ip: '', reason: '', hours: 24 }); }); }}>
          <label className="text-xs text-gray-700">IP address<input required className={`${input} block mt-1 w-48`} placeholder="203.0.113.9" value={ban.ip} onChange={(e) => setBan({ ...ban, ip: e.target.value })} /></label>
          <label className="text-xs text-gray-700">Reason<input className={`${input} block mt-1 w-56`} maxLength={200} value={ban.reason} onChange={(e) => setBan({ ...ban, reason: e.target.value })} /></label>
          <label className="text-xs text-gray-700">Hours<input type="number" min={1} max={8760} className={`${input} block mt-1 w-24`} value={ban.hours} onChange={(e) => setBan({ ...ban, hours: Number(e.target.value) || 24 })} /></label>
          <button className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm">Ban</button>
        </form>
        {!!bans?.bans.length && (
          <ul className="mt-4 divide-y divide-gray-100 text-sm">
            {bans.bans.map((b) => (
              <li key={b.ip} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span><b className="font-mono">{b.ip}</b>{b.reason ? ` · ${b.reason}` : ''}<span className="text-gray-500"> · until {when(b.bannedUntil)}{b.bannedByEmail ? ` · by ${b.bannedByEmail}` : ''}</span></span>
                <button className={btn} onClick={() => run(`${b.ip} unbanned.`, () => api(`/api/v1/admin/bans/${encodeURIComponent(b.ip)}`, { method: 'DELETE' }))}>Remove ban</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} p-5`}>
        <h2 className="font-semibold text-gray-900">API keys</h2>
        <p className="text-sm text-gray-600 mt-1">For connecting another system to Eqence. A key is shown once when created; only a fingerprint is stored. Today a key can call <code>GET /api/v1/ping</code> to prove it works.</p>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault(); setIssued(null);
          run('Key created. Copy it now: it will not be shown again.', async () => {
            const r = await api<{ key: { apiKey: string } }>('/api/v1/admin/api-keys', { method: 'POST', body: key });
            setIssued(r.key.apiKey); setKey({ label: '', scopes: '', ipAllowlist: '', ratePerMin: 60 });
          });
        }}>
          <label className="text-xs text-gray-700">Label<input className={`${input} block mt-1 w-44`} maxLength={80} value={key.label} onChange={(e) => setKey({ ...key, label: e.target.value })} /></label>
          <label className="text-xs text-gray-700">Scopes (comma separated)<input className={`${input} block mt-1 w-44`} value={key.scopes} onChange={(e) => setKey({ ...key, scopes: e.target.value })} /></label>
          <label className="text-xs text-gray-700">Allowed IPs (optional)<input className={`${input} block mt-1 w-52`} value={key.ipAllowlist} onChange={(e) => setKey({ ...key, ipAllowlist: e.target.value })} /></label>
          <label className="text-xs text-gray-700">Calls per minute<input type="number" min={1} max={600} className={`${input} block mt-1 w-28`} value={key.ratePerMin} onChange={(e) => setKey({ ...key, ratePerMin: Number(e.target.value) || 60 })} /></label>
          <button className="btn-primary text-sm px-4 py-2">Create key</button>
        </form>
        {issued && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
            <div className="text-amber-900 font-medium">Copy this key now. It cannot be shown again.</div>
            <code className="mt-1 block break-all font-mono text-xs">{issued}</code>
            <button className={`${btn} mt-2`} onClick={() => navigator.clipboard?.writeText(issued)}>Copy</button>
            <button className={`${btn} mt-2 ms-2`} onClick={() => setIssued(null)}>I have saved it</button>
          </div>
        )}
        {!!keys?.length && (
          <ul className="mt-4 divide-y divide-gray-100 text-sm">
            {keys.map((k) => (
              <li key={k.id} className={`py-2 flex flex-wrap items-center justify-between gap-2 ${k.revoked ? 'text-gray-400' : ''}`}>
                <span><b className="font-mono">eqk_{k.keyId}_…</b>{k.label ? ` · ${k.label}` : ''}
                  <span className="text-gray-500"> · {k.ratePerMin}/min{k.scopes.length ? ` · ${k.scopes.join(', ')}` : ''}{k.ipAllowlist.length ? ` · only from ${k.ipAllowlist.join(', ')}` : ''} · last used {when(k.lastUsedAt)} · by {k.ownerEmail}</span></span>
                {k.revoked ? <span className="text-xs">revoked</span>
                  : <button className={`${btn} text-red-700 border-red-200`} onClick={() => confirm('Revoke this key? Anything using it stops working.') && run('Key revoked.', () => api(`/api/v1/admin/api-keys/${k.id}`, { method: 'DELETE' }))}>Revoke</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ───────────── System monitor and failed jobs ───────────── */

interface System {
  api: { uptimeSeconds: number; node: string; memoryMb: number; release: string | null };
  database: { ok: boolean; latencyMs: number; sizeMb: number; version: string };
  worker: { ok: boolean; lastTickAt?: string | null; lastError?: string | null };
  jobs: { pending: number; dead: number; done_24h: number; oldest_due_seconds: number };
  counts: Record<string, number>;
  config: { ai: boolean; email: boolean; hub: boolean; pricing: string | null };
}
interface Job { id: number; topic: string; attempts: number; lastError: string | null; createdAt: string }

export function AdminSystem() {
  return <AppShell admin>{() => <SystemBody />}</AppShell>;
}

function Light({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />{label}
        <span className={`ms-auto text-xs font-normal ${ok ? 'text-green-700' : 'text-red-700'}`}>{ok ? 'OK' : 'Problem'}</span>
      </div>
      <div className="mt-1 text-xs text-gray-600">{detail}</div>
    </div>
  );
}

function SystemBody() {
  const [sys, setSys] = useState<System | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [note, setNote] = useState<Note>(null);
  const load = useCallback(() => Promise.all([
    api<System>('/api/v1/admin/system').then(setSys),
    api<{ jobs: Job[] }>('/api/v1/admin/jobs').then((r) => setJobs(r.jobs)),
  ]).catch((e) => setNote({ ok: false, text: errText(e, 'Could not load') })), []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  async function replay(body: { ids?: number[]; all?: boolean }) {
    setNote(null);
    try {
      const r = await api<{ replayed: number }>('/api/v1/admin/jobs/replay', { method: 'POST', body });
      setNote({ ok: true, text: `${r.replayed} job${r.replayed === 1 ? '' : 's'} put back in the queue.` });
      await load();
    } catch (e) { setNote({ ok: false, text: errText(e, 'Replay failed') }); }
  }

  const up = (s: number) => (s >= 86400 ? `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h` : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);
  const labels: Record<string, string> = {
    users: 'Accounts', sessions: 'Active sessions', connections: 'Connected stores', interactions_24h: 'Reviews in, last 24 h',
    ai_actions_24h: 'AI actions, last 24 h', active_bans: 'Banned addresses', hub_events_30d: 'Payment events, 30 days',
  };
  return (
    <div className="space-y-5">
      <AdminTabs active="system" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">System</h1>
        <button className={btn} onClick={() => load()}>Refresh</button>
      </div>
      <Notice note={note} />
      {!sys ? <p className="text-gray-500">Loading…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Light ok label="API" detail={`Up ${up(sys.api.uptimeSeconds)} · ${sys.api.memoryMb} MB · ${sys.api.release ?? 'release unknown'}`} />
            <Light ok={sys.database.ok} label="Database" detail={`${sys.database.latencyMs} ms · ${sys.database.sizeMb} MB · PostgreSQL ${sys.database.version}`} />
            <Light ok={sys.worker.ok} label="Background worker" detail={sys.worker.ok ? `Last ran ${when(sys.worker.lastTickAt ?? null)}` : (sys.worker.lastError ?? 'Not responding')} />
            <Light ok={sys.jobs.dead === 0 && sys.jobs.oldest_due_seconds < 300} label="Job queue" detail={`${sys.jobs.pending} waiting · ${sys.jobs.dead} failed · ${sys.jobs.done_24h} done in 24 h`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(labels).map(([k, label]) => (
              <div key={k} className={`${card} p-4`}><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-bold text-gray-900">{sys.counts[k] ?? 0}</div></div>
            ))}
            <div className={`${card} p-4 text-xs text-gray-600`}>
              <div className="text-gray-500">Set up</div>
              {([['AI provider', sys.config.ai], ['Email sending', sys.config.email], ['Payments (Hub)', sys.config.hub], ['Price list', !!sys.config.pricing]] as const).map(([name, on]) => (
                <div key={name} className={on ? 'text-green-700' : 'text-red-700'}>{on ? '✓' : '✗'} {name}</div>
              ))}
            </div>
          </div>
        </>
      )}
      <section className={card}>
        <div className="px-5 pt-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Failed jobs <span className="text-sm font-normal text-gray-500">({jobs.length})</span></h2>
          {jobs.length > 0 && <button className={btn} onClick={() => confirm('Retry every failed job?') && replay({ all: true })}>Retry all</button>}
        </div>
        {jobs.length === 0 ? <p className="px-5 py-4 text-sm text-gray-500">No failed jobs. A job lands here after six failed attempts.</p> : (
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="px-5 py-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><b>{j.topic}</b> <span className="text-gray-500">#{j.id} · {j.attempts} attempts · {when(j.createdAt)}</span>
                  <div className="text-xs text-red-700 break-all">{j.lastError}</div></div>
                <button className={btn} onClick={() => replay({ ids: [j.id] })}>Retry</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
