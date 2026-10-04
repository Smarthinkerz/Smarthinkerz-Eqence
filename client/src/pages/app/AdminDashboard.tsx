// Admin dashboard: where the footer "Admin Login" lands. Overview counts and the way in
// to the front-page editor and the blog manager.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { api } from '../../lib/api';
import AppShell from './AppShell';
import { AdminTabs } from './AdminBlog';

interface Overview {
  blog: { published: number; drafts: number; latest: { slug: string; titleEn: string; status: string; updatedAt: string } | null };
  content: { overrides: number };
  accounts: { users: number; verified: number; activePlans: number };
  reviews: { connections: number; reviews: number; repliesPosted7d: number };
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-gray-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  return <AppShell admin>{(me) => <Body name={me.user.name} />}</AppShell>;
}

function Body({ name }: { name: string }) {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Overview>('/api/v1/admin/overview').then(setO).catch((e) => setError(e instanceof Error ? e.message : 'Could not load')); }, []);

  return (
    <div className="space-y-6">
      <AdminTabs active="dashboard" />
      <div>
        <h1 className="text-xl font-bold text-gray-900">Admin dashboard</h1>
        <p className="text-sm text-gray-600">Signed in as {name}.</p>
      </div>
      {error && <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/app/admin/content" className="block rounded-xl border-2 border-gray-100 bg-white p-5 hover:border-[#C41E3A]">
          <div className="text-lg font-bold text-gray-900">Edit the front page</div>
          <p className="mt-1 text-sm text-gray-600">Change any text on the home page and blog page, in English, Arabic or Japanese, and the blog banner photo.</p>
          {o && <p className="mt-2 text-xs text-gray-500">{o.content.overrides} text{o.content.overrides === 1 ? '' : 's'} edited so far</p>}
        </Link>
        <Link href="/app/admin/blog" className="block rounded-xl border-2 border-gray-100 bg-white p-5 hover:border-[#C41E3A]">
          <div className="text-lg font-bold text-gray-900">Manage the blog</div>
          <p className="mt-1 text-sm text-gray-600">Write, translate, publish and remove posts. AI writing help included.</p>
          {o && <p className="mt-2 text-xs text-gray-500">{o.blog.published} published · {o.blog.drafts} draft{o.blog.drafts === 1 ? '' : 's'}</p>}
        </Link>
      </div>

      {o && (
        <>
          <section>
            <h2 className="mb-3 font-semibold text-gray-900">Site</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat label="Published posts" value={o.blog.published} />
              <Stat label="Draft posts" value={o.blog.drafts} />
              <Stat label="Edited texts" value={o.content.overrides} />
              <Stat label="Last post edit" value={o.blog.latest ? new Date(o.blog.latest.updatedAt).toLocaleDateString() : '-'} hint={o.blog.latest?.titleEn} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-semibold text-gray-900">Customers</h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat label="Accounts" value={o.accounts.users} hint={`${o.accounts.verified} with confirmed email`} />
              <Stat label="Active paid plans" value={o.accounts.activePlans} />
              <Stat label="Connected stores" value={o.reviews.connections} />
              <Stat label="Reviews imported" value={o.reviews.reviews} hint={`${o.reviews.repliesPosted7d} replies posted in the last 7 days`} />
            </div>
          </section>
        </>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <a href="/" target="_blank" rel="noopener" className="text-[#C41E3A] hover:underline">View the website ↗</a>
        <a href="/blog" target="_blank" rel="noopener" className="text-[#C41E3A] hover:underline">View the blog ↗</a>
      </div>
    </div>
  );
}
