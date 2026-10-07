// Account: where you are signed in, change password, export your data, delete the
// account, and (super user only) view the product as a plan.
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { api, API_URL, type Me } from '../../lib/api';
import AppShell from './AppShell';

const input = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none text-sm';
const card = 'bg-white rounded-xl border border-gray-200 p-5';
const btn = 'px-3 py-1.5 rounded-md border border-gray-200 text-sm hover:border-gray-300 disabled:opacity-50';

interface SessionRow { id: string; ipAddress: string | null; userAgent: string | null; createdAt: string; current: boolean }
type Note = { ok: boolean; text: string } | null;

export default function Account() {
  return <AppShell>{(me) => <Body me={me} />}</AppShell>;
}

function Notice({ note }: { note: Note }) {
  if (!note) return null;
  return <div role={note.ok ? 'status' : 'alert'} className={`mt-3 p-3 rounded-lg text-sm ${note.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{note.text}</div>;
}

/** A short, readable name for a browser from its user-agent string. */
export function deviceName(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

function Body({ me }: { me: Me }) {
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [sessNote, setSessNote] = useState<Note>(null);
  const loadSessions = () => api<{ sessions: SessionRow[] }>('/api/v1/me/sessions').then((r) => setSessions(r.sessions));
  useEffect(() => { loadSessions(); }, []);

  async function revoke(scope: 'others' | 'all') {
    if (scope === 'all' && !confirm('Sign out everywhere, including this device?')) return;
    try {
      const r = await api<{ revoked: number }>('/api/v1/me/sessions/revoke', { method: 'POST', body: { scope } });
      if (scope === 'all') { navigate('/app/sign-in'); return; }
      setSessNote({ ok: true, text: r.revoked ? `Signed out ${r.revoked} other device${r.revoked === 1 ? '' : 's'}.` : 'No other devices were signed in.' });
      await loadSessions();
    } catch (e) { setSessNote({ ok: false, text: e instanceof Error ? e.message : 'Could not sign out.' }); }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <section className={card}>
        <h1 className="text-lg font-bold text-gray-900">Account</h1>
        <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-gray-500">Name</dt><dd className="text-gray-900">{me.user.name}</dd>
          <dt className="text-gray-500">Email</dt><dd className="text-gray-900">{me.user.email}{me.user.emailVerified ? '' : ' (not confirmed)'}</dd>
          <dt className="text-gray-500">Two-factor</dt><dd className="text-gray-900">{me.user.twoFactorEnabled ? 'On' : 'Off'}</dd>
        </dl>
      </section>

      {me.user.isSuperUser && <ViewAs />}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Where you are signed in</h2>
          <div className="flex gap-2">
            <button className={btn} onClick={() => revoke('others')}>Sign out other devices</button>
            <button className={`${btn} text-red-700 border-red-200`} onClick={() => revoke('all')}>Sign out everywhere</button>
          </div>
        </div>
        <Notice note={sessNote} />
        {sessions === null ? <p className="mt-3 text-sm text-gray-500">Loading…</p> : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span className="text-gray-900">{deviceName(s.userAgent)}{s.current && <span className="ms-2 rounded bg-green-50 px-1.5 text-xs text-green-800">this device</span>}</span>
                <span className="text-gray-500">{s.ipAddress || 'address not recorded'} · since {new Date(s.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ChangePassword />
      <ExportData />
      {!(me.user.isSuperUser || me.user.role === 'admin') && <DeleteAccount onDone={() => navigate('/')} />}
    </div>
  );
}

function ViewAs() {
  const [state, setState] = useState<{ current: string; options: string[] } | null>(null);
  const [note, setNote] = useState<Note>(null);
  useEffect(() => { api<{ current: string; options: string[] }>('/api/v1/me/view-as').then(setState).catch(() => {}); }, []);
  if (!state) return null;
  const label = (o: string) => (o === 'unlimited' ? 'Unlimited (super user)' : o === 'none' ? 'No plan' : o.replace('eqence-', '').replace(/^./, (c) => c.toUpperCase()));
  return (
    <section className={card}>
      <h2 className="font-semibold text-gray-900">View the product as a plan</h2>
      <p className="text-sm text-gray-600 mt-1">Super user only. Changes what this account is shown and allowed (reply allowance, Auto-DM). It never creates a subscription or a charge.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {state.options.map((o) => (
          <button key={o} aria-pressed={state.current === o}
            className={`px-3 py-1.5 rounded-md text-sm border ${state.current === o ? 'bg-[#C41E3A] text-white border-[#C41E3A]' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
            onClick={async () => {
              try {
                const r = await api<{ current: string }>('/api/v1/me/view-as', { method: 'PUT', body: { plan: o } });
                setState({ ...state, current: r.current });
                setNote({ ok: true, text: `Now viewing the product as: ${label(r.current)}.` });
              } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : 'Could not switch.' }); }
            }}>{label(o)}</button>
        ))}
      </div>
      <Notice note={note} />
    </section>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next, revokeOtherSessions: true } });
      setCurrent(''); setNext('');
      setNote({ ok: true, text: 'Password changed. Other devices were signed out.' });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not change the password.' });
    } finally { setBusy(false); }
  }
  return (
    <section className={card}>
      <h2 className="font-semibold text-gray-900">Change password</h2>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="pw-cur" className="block text-xs font-medium text-gray-700 mb-1">Current password</label>
          <input id="pw-cur" type="password" autoComplete="current-password" required className={input} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pw-new" className="block text-xs font-medium text-gray-700 mb-1">New password (10 characters or more)</label>
          <input id="pw-new" type="password" autoComplete="new-password" required minLength={10} className={input} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy}>{busy ? 'Saving…' : 'Change'}</button>
      </form>
      <Notice note={note} />
    </section>
  );
}

function ExportData() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  async function download() {
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/me/export`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `eqence-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setNote({ ok: true, text: 'Your export was downloaded.' });
    } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : 'Export failed.' }); } finally { setBusy(false); }
  }
  return (
    <section className={card}>
      <h2 className="font-semibold text-gray-900">Export your data</h2>
      <p className="text-sm text-gray-600 mt-1">Downloads one file with your account details, workspace, connected sources, reviews, replies, brand voice and usage. Store passwords and API tokens are never included.</p>
      <button className={`${btn} mt-3`} disabled={busy} onClick={download}>{busy ? 'Preparing…' : 'Download my data'}</button>
      <Notice note={note} />
    </section>
  );
}

function DeleteAccount({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      await api('/api/v1/me/delete', { method: 'POST', body: { password, confirm: confirmText } });
      onDone();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not delete the account.' });
      setBusy(false);
    }
  }
  return (
    <section className={`${card} border-red-200`}>
      <h2 className="font-semibold text-red-800">Delete account</h2>
      <p className="text-sm text-gray-600 mt-1">Permanently removes your account, your workspace, imported reviews, replies and the stored connection to your store. This cannot be undone, and it does not refund a plan already paid for. Export your data first if you want a copy.</p>
      {!open ? <button className={`${btn} mt-3 text-red-700 border-red-200`} onClick={() => setOpen(true)}>Delete my account…</button> : (
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:max-w-sm">
          <div>
            <label htmlFor="del-pw" className="block text-xs font-medium text-gray-700 mb-1">Your password</label>
            <input id="del-pw" type="password" autoComplete="current-password" required className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="del-ok" className="block text-xs font-medium text-gray-700 mb-1">Type DELETE to confirm</label>
            <input id="del-ok" required className={input} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm disabled:opacity-50" disabled={busy || confirmText !== 'DELETE'}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
            <button type="button" className={btn} onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <Notice note={note} />
        </form>
      )}
    </section>
  );
}
