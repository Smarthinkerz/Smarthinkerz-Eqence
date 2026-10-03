import { useEffect, useState } from 'react';
import { api, type ConnectionRow } from '../../lib/api';
import AppShell from './AppShell';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none text-sm';

export default function Connections() {
  return <AppShell>{() => <ConnectionsBody />}</AppShell>;
}

function ConnectionsBody() {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [shopDomain, setShopDomain] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = () => api<{ connections: ConnectionRow[] }>('/api/v1/connections').then((r) => setRows(r.connections));
  useEffect(() => { load(); }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage(null);
    try {
      await api('/api/v1/connections/judgeme', { method: 'POST', body: { shopDomain, apiToken } });
      setApiToken('');
      setMessage({ kind: 'ok', text: 'Connected. Your reviews are being imported now.' });
      await load();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Could not connect.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h1 className="text-lg font-bold text-gray-900">Connect your Judge.me reviews</h1>
        <p className="text-sm text-gray-600 mt-1">
          In Judge.me (Shopify admin → Apps → Judge.me), open <b>Settings → Integrations</b> and click <b>View API tokens</b>. Copy the <b>Private API Token</b> (not the public one) and your <b>shop domain</b> (yourstore.myshopify.com) and paste them here. The token is stored encrypted and is only used to read your reviews and post the replies you approve.
        </p>
        {message && <div role={message.kind === 'err' ? 'alert' : 'status'}
          className={`mt-4 p-3 rounded-lg text-sm ${message.kind === 'err' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>{message.text}</div>}
        <form onSubmit={connect} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="shop" className="block text-xs font-medium text-gray-700 mb-1">Store domain</label>
            <input id="shop" className={inputClass} placeholder="yourstore.myshopify.com" required value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tok" className="block text-xs font-medium text-gray-700 mb-1">Judge.me private API token</label>
            <input id="tok" type="password" autoComplete="off" className={inputClass} required value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
          </div>
          <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy}>{busy ? 'Checking…' : 'Connect'}</button>
        </form>
      </section>

      <section className="bg-white rounded-xl border border-gray-200">
        <h2 className="px-5 pt-4 font-semibold text-gray-900">Connected sources</h2>
        {rows.length === 0 ? <p className="px-5 py-4 text-sm text-gray-500">Nothing connected yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {rows.map((c) => (
              <li key={c.id} className="px-5 py-3 flex flex-wrap items-center gap-3 justify-between text-sm">
                <div>
                  <div className="font-medium text-gray-900">Judge.me · {c.externalAccount}</div>
                  <div className="text-gray-500">
                    {c.status === 'active' ? 'Active' : c.status === 'error' ? `Error: ${c.error}` : c.status}
                    {c.lastSyncAt && ` · last synced ${new Date(c.lastSyncAt).toLocaleString()}`}
                  </div>
                </div>
                {c.status !== 'revoked' && (
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-md border border-gray-200 hover:border-gray-300"
                      onClick={async () => { await api(`/api/v1/connections/${c.id}/sync`, { method: 'POST', body: {} }); setMessage({ kind: 'ok', text: 'Sync queued.' }); }}>Sync now</button>
                    <button className="px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                      onClick={async () => { if (confirm('Disconnect this store? Eqence stops reading its reviews.')) { await api(`/api/v1/connections/${c.id}`, { method: 'DELETE' }); await load(); } }}>Disconnect</button>
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
