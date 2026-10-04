// Admin → Users: search accounts, change role, disable or re-enable.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AppShell from './AppShell';
import { AdminTabs } from './AdminBlog';

interface Row {
  id: string; name: string; email: string; emailVerified: boolean; role: string; isSuperUser: boolean;
  twoFactorEnabled: boolean; disabled: boolean; migratedFromC2c: boolean; createdAt: string;
  plan: string | null; planStatus: string | null; planExpiresAt: string | null;
}

export default function AdminUsers() {
  return <AppShell admin>{(me) => <Body myId={me.user.id} iAmSuper={me.user.isSuperUser} />}</AppShell>;
}

function Body({ myId, iAmSuper }: { myId: string; iAmSuper: boolean }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => api<{ users: Row[]; total: number }>(`/api/v1/admin/users?q=${encodeURIComponent(q)}`)
    .then((r) => { setRows(r.users); setTotal(r.total); }), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function change(u: Row, body: { role?: string; disabled?: boolean }, what: string) {
    if (!confirm(`${what} ${u.email}?`)) return;
    setMsg(null);
    try {
      await api(`/api/v1/admin/users/${u.id}`, { method: 'PATCH', body });
      setMsg({ ok: true, text: `${what}: ${u.email}` });
      await load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Change failed' }); }
  }

  const btn = 'px-2.5 py-1 rounded-md border border-gray-200 text-xs hover:border-gray-300';
  return (
    <div className="space-y-5">
      <AdminTabs active="users" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">Users <span className="text-sm font-normal text-gray-500">({total})</span></h1>
        <input type="search" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full sm:w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C41E3A] outline-none" />
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`p-3 rounded-lg text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      {rows === null ? <p className="text-gray-500">Loading…</p> : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-2">Account</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Security</th><th className="px-4 py-2">Joined</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((u) => {
                const locked = u.id === myId || (u.isSuperUser && !iAmSuper);
                return (
                  <tr key={u.id} className={u.disabled ? 'bg-gray-50 text-gray-400' : ''}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-500">{u.email}{u.migratedFromC2c ? ' · from C2C' : ''}{u.emailVerified ? '' : ' · email not confirmed'}</div>
                    </td>
                    <td className="px-4 py-2">{u.isSuperUser ? 'super user' : u.role}{u.disabled && <span className="ms-1 rounded bg-red-50 px-1.5 text-xs text-red-700">disabled</span>}</td>
                    <td className="px-4 py-2 text-xs">{u.planStatus === 'active' ? `${u.plan?.replace('eqence-', '')} until ${u.planExpiresAt ? new Date(u.planExpiresAt).toLocaleDateString() : '-'}` : u.planStatus ?? '-'}</td>
                    <td className="px-4 py-2 text-xs">{u.twoFactorEnabled ? '2FA on' : '2FA off'}</td>
                    <td className="px-4 py-2 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      {locked ? <span className="text-xs text-gray-400">{u.id === myId ? 'you' : 'super user'}</span> : (
                        <div className="flex justify-end gap-2">
                          {!u.isSuperUser && (u.role === 'admin'
                            ? <button className={btn} onClick={() => change(u, { role: 'user' }, 'Remove admin role from')}>Make user</button>
                            : <button className={btn} onClick={() => change(u, { role: 'admin' }, 'Make admin')}>Make admin</button>)}
                          {u.disabled
                            ? <button className={btn} onClick={() => change(u, { disabled: false }, 'Re-enable')}>Re-enable</button>
                            : <button className={`${btn} text-red-700 border-red-200`} onClick={() => change(u, { disabled: true }, 'Disable and sign out')}>Disable</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
