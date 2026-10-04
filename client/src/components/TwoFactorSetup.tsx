// One-time two-factor setup, required before admin pages open. Confirm the password,
// scan the QR code with an authenticator app (Google Authenticator, Microsoft
// Authenticator, 1Password…), save the backup codes, then enter one code to switch it on.
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const input = 'w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none';

export default function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ uri: string; secret: string; backupCodes: string[] } | null>(null);
  const [qr, setQr] = useState('');
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(''));
  }, [setup]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api<{ totpURI: string; backupCodes: string[] }>('/api/auth/two-factor/enable', { method: 'POST', body: { password } });
      setSetup({ uri: r.totpURI, secret: new URL(r.totpURI).searchParams.get('secret') ?? '', backupCodes: r.backupCodes });
      setPassword('');
    } catch {
      setError('Password is incorrect.');
    } finally { setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: code.replace(/\s/g, '') } });
      onDone();
    } catch {
      setError('That code did not match. Check the time on your phone and try the newest code.');
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-xl bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Set up two-factor sign-in</h1>
        <p className="text-sm text-gray-600 mt-1">Admin access needs a code from an authenticator app as well as your password. This takes about a minute and is only needed once.</p>
      </div>
      {error && <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {!setup ? (
        <form onSubmit={start} className="space-y-3">
          <label htmlFor="tfa-pw" className="block text-sm font-medium text-gray-700">Confirm your password</label>
          <input id="tfa-pw" type="password" autoComplete="current-password" required className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-5 items-start">
            {qr ? <img src={qr} alt="QR code for your authenticator app" className="h-[220px] w-[220px] rounded border border-gray-200" /> : null}
            <div className="text-sm text-gray-700 space-y-2 min-w-0 flex-1">
              <p><b>1.</b> Open your authenticator app and scan this code.</p>
              <p>Can't scan? Add an account manually with this key:</p>
              <code className="block break-all rounded bg-gray-50 p-2 text-xs">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            </div>
          </div>
          <div className="text-sm text-gray-700">
            <p><b>2.</b> Save these backup codes somewhere safe. Each one works once if you lose your phone.</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded bg-gray-50 p-3 font-mono text-xs">{setup.backupCodes.map((c) => <span key={c}>{c}</span>)}</div>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved my backup codes</label>
          </div>
          <form onSubmit={confirm} className="space-y-2">
            <label htmlFor="tfa-code" className="block text-sm text-gray-700"><b>3.</b> Enter the 6-digit code from the app</label>
            <input id="tfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className={`${input} max-w-[10rem] tracking-widest text-center`} value={code} onChange={(e) => setCode(e.target.value)} />
            <div><button className="btn-primary text-sm px-4 py-2 disabled:opacity-60" disabled={busy || !saved}>{busy ? 'Checking…' : 'Turn on two-factor'}</button></div>
          </form>
        </>
      )}
    </div>
  );
}
