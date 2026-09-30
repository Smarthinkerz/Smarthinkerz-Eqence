import { useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ApiError, auth } from '../../lib/api';

const inputClass = 'w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none';

export default function SignIn() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const next = params.get('next')?.startsWith('/app') ? params.get('next')! : '/app';
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>(params.get('mode') === 'up' ? 'up' : 'in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'in') {
        await auth.signIn(email, password);
        navigate(next);
      } else if (mode === 'up') {
        await auth.signUp(name, email, password);
        setNotice('Check your email and click the confirmation link to finish creating your account.');
      } else {
        await auth.requestReset(email);
        setNotice('If an account exists for that address, a reset link is on its way.');
      }
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 403 ? 'Please confirm your email first. We sent you a link when you signed up.'
        : status === 401 ? 'Email or password is incorrect.'
        : err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md">
        <Link href="/" className="text-[#C41E3A] font-bold text-2xl">Eqence</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-6">
          {mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create your account' : 'Reset your password'}
        </h1>
        {error && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        {notice && <div role="status" className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">{notice}</div>}
        <form onSubmit={submit} className="space-y-4">
          {mode === 'up' && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
              <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          {mode !== 'forgot' && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={mode === 'up' ? 10 : 1} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
              {mode === 'up' && <p className="text-xs text-gray-500 mt-1">At least 10 characters.</p>}
            </div>
          )}
          <button type="submit" disabled={busy} className="w-full btn-primary disabled:opacity-60">
            {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
        <div className="mt-5 text-sm text-gray-600 space-y-2">
          {mode === 'in' && <>
            <button className="text-[#C41E3A] hover:underline" onClick={() => setMode('forgot')}>Forgot your password?</button>
            <p>New to Eqence? <button className="text-[#C41E3A] hover:underline" onClick={() => setMode('up')}>Create an account</button></p>
          </>}
          {mode !== 'in' && <button className="text-[#C41E3A] hover:underline" onClick={() => setMode('in')}>Back to sign in</button>}
        </div>
      </div>
    </div>
  );
}
