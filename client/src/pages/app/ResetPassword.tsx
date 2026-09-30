import { useState } from 'react';
import { Link, useSearch } from 'wouter';
import { auth } from '../../lib/api';

export default function ResetPassword() {
  const token = new URLSearchParams(useSearch()).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      await auth.resetPassword(token, password);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The link is invalid or has expired.');
      setState('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md">
        <Link href="/" className="text-[#C41E3A] font-bold text-2xl">Eqence</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-6">Choose a new password</h1>
        {!token ? <p className="text-gray-600">This link is missing its token. Request a new reset email from the sign-in page.</p>
          : state === 'done' ? <p className="text-gray-700">Your password is changed. <Link href="/app/sign-in" className="text-[#C41E3A] hover:underline">Sign in</Link></p>
          : (
            <form onSubmit={submit} className="space-y-4">
              {state === 'error' && <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
              <input type="password" aria-label="New password" minLength={10} required autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] outline-none" />
              <button className="w-full btn-primary disabled:opacity-60" disabled={state === 'busy'}>Save password</button>
            </form>
          )}
      </div>
    </div>
  );
}
