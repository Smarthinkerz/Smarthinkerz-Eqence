// "Admin login" from the site footer: a pop-up sign-in that only lets admin accounts
// through. The real check is on the server (every admin API route requires the admin
// role); this dialog just avoids sending a non-admin into a screen that will refuse them.
import { useState } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError, auth, type Me } from '../lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';

const input = 'w-full px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 focus:border-[#C41E3A] focus:ring-2 focus:ring-[#C41E3A]/20 outline-none';

export default function AdminLoginDialog({ className, label }: { className?: string; label: string }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await auth.signIn(email, password);
      const me = await api<Me>('/api/v1/me');
      if (me.user.role === 'admin' || me.user.isSuperUser) {
        setOpen(false);
        setPassword('');
        navigate('/app/admin');
        return;
      }
      await auth.signOut().catch(() => {});
      setError('This account does not have admin access.');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 401 ? 'Email or password is incorrect.'
        : status === 403 ? 'Please confirm this account\'s email first.'
        : status === 429 ? 'Too many attempts. Wait a minute and try again.'
        : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setError(''); setPassword(''); } }}>
      <DialogTrigger asChild>
        <button type="button" className={className}>{label}</button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-white text-gray-900">
        <DialogTitle className="text-xl font-bold">Admin login</DialogTitle>
        <DialogDescription className="text-sm text-gray-500">For Eqence site administrators.</DialogDescription>
        {error && <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="admin-email" type="email" required autoComplete="username" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input id="admin-password" type="password" required autoComplete="current-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={busy} className="w-full btn-primary disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
