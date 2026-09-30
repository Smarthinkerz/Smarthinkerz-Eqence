// Signed-in area of Eqence. Redirects to /app/sign-in when there is no session.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { api, auth, type Me } from '../../lib/api';

const nav = [
  { href: '/app', label: 'Inbox' },
  { href: '/app/connections', label: 'Connections' },
  { href: '/app/brand-voice', label: 'Brand voice' },
];

export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    api<Me>('/api/v1/me').then(setMe).catch(() => setMe(null));
  }, []);
  return me;
}

export default function AppShell({ children }: { children: (me: Me) => ReactNode }) {
  const me = useMe();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (me === null) navigate(`/app/sign-in?next=${encodeURIComponent(location)}`);
  }, [me, location, navigate]);

  if (!me) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/app" className="text-xl font-bold text-[#C41E3A]">Eqence</Link>
            <nav className="flex gap-1 overflow-x-auto">
              {nav.map((n) => (
                <Link key={n.href} href={n.href}
                  className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${location === n.href ? 'bg-red-50 text-[#C41E3A] font-semibold' : 'text-gray-600 hover:text-gray-900'}`}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-gray-500 truncate max-w-48">{me.user.email}</span>
            <button className="text-gray-600 hover:text-gray-900"
              onClick={async () => { await auth.signOut().catch(() => {}); navigate('/app/sign-in'); }}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children(me)}</main>
    </div>
  );
}
