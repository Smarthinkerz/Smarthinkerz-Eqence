// Second sign-in step for accounts with two-factor on: the authenticator code, or a backup code.
import { useState } from 'react';
import { api } from '../lib/api';

const input = 'w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 focus:border-[#C41E3A] outline-none';

export default function TwoFactorCode({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(backup ? '/api/auth/two-factor/verify-backup-code' : '/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: code.trim().replace(/\s/g, '') } });
      onVerified();
    } catch {
      setError(backup ? 'That backup code is not valid or was already used.' : 'That code did not match. Try the newest code from your app.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <label htmlFor="tfa-step-code" className="block text-sm font-medium text-gray-700">
        {backup ? 'Backup code' : '6-digit code from your authenticator app'}
      </label>
      <input id="tfa-step-code" autoFocus required inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code"
        className={`${input} ${backup ? '' : 'tracking-widest text-center'}`} maxLength={backup ? 40 : 7} value={code} onChange={(e) => setCode(e.target.value)} />
      <button type="submit" disabled={busy} className="w-full btn-primary disabled:opacity-60">{busy ? 'Checking…' : 'Verify'}</button>
      <button type="button" className="text-sm text-[#C41E3A] hover:underline" onClick={() => { setBackup(!backup); setCode(''); setError(''); }}>
        {backup ? 'Use the authenticator code instead' : 'Lost your phone? Use a backup code'}
      </button>
    </form>
  );
}
