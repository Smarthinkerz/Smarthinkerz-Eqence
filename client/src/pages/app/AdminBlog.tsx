// Blog manager: list, write (English and Arabic), cover upload, publish, and an AI
// writing assistant. AI output only goes into the form; nothing is saved until "Save".
import { useEffect, useState } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import MarkdownEditor from '../../components/MarkdownEditor';
import { api, API_URL } from '../../lib/api';
import AppShell from './AppShell';

export interface AdminPost {
  id: string; slug: string; status: 'draft' | 'published';
  titleEn: string; titleAr: string | null; excerptEn: string | null; excerptAr: string | null;
  bodyEn: string; bodyAr: string | null; coverUrl: string | null;
  metaTitle: string | null; metaDescription: string | null; authorName: string | null;
  publishedAt: string | null; updatedAt: string;
}

export function AdminTabs({ active }: { active: 'dashboard' | 'content' | 'blog' | 'users' | 'audit' | 'security' | 'system' }) {
  const tab = (key: string, href: string, label: string) => (
    <Link href={href} className={`px-3 py-1.5 rounded-md text-sm ${active === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>{label}</Link>
  );
  return <div className="flex flex-wrap gap-2">{tab('dashboard', '/app/admin', 'Dashboard')}{tab('content', '/app/admin/content', 'Front page')}{tab('blog', '/app/admin/blog', 'Blog')}{tab('users', '/app/admin/users', 'Users')}{tab('audit', '/app/admin/audit', 'Audit log')}{tab('security', '/app/admin/security', 'Security')}{tab('system', '/app/admin/system', 'System')}</div>;
}

export default function AdminBlog() {
  return <AppShell admin>{() => <ListBody />}</AppShell>;
}

function ListBody() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  useEffect(() => { api<{ posts: AdminPost[] }>('/api/v1/admin/blog').then((r) => setPosts(r.posts)); }, []);
  return (
    <div className="space-y-5">
      <AdminTabs active="blog" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Blog posts</h1>
        <Link href="/app/admin/blog/new" className="btn-primary text-sm px-4 py-2">New post</Link>
      </div>
      {posts === null ? <p className="text-gray-500">Loading…</p> : posts.length === 0 ? (
        <p className="bg-white rounded-xl border border-gray-200 p-6 text-gray-600">No posts yet.</p>
      ) : (
        <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {posts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <Link href={`/app/admin/blog/${p.id}`} className="font-medium text-gray-900 hover:text-[#C41E3A]">{p.titleEn}</Link>
                <div className="text-xs text-gray-500">/blog/{p.slug} · updated {new Date(p.updatedAt).toLocaleString()}{p.titleAr ? ' · AR' : ''}</div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={`rounded px-2 py-0.5 text-xs ${p.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                {p.status === 'published' && <a href={`/blog/${p.slug}`} target="_blank" rel="noopener" className="text-[#C41E3A] hover:underline">View ↗</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminBlogEdit() {
  return <AppShell admin>{() => <EditBody />}</AppShell>;
}

const empty: Partial<AdminPost> = { titleEn: '', titleAr: '', excerptEn: '', excerptAr: '', bodyEn: '', bodyAr: '', coverUrl: '', metaTitle: '', metaDescription: '', authorName: '', status: 'draft' };
const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C41E3A] outline-none';

function EditBody() {
  const [, params] = useRoute('/app/admin/blog/:id');
  const [, navigate] = useLocation();
  const isNew = params?.id === 'new';
  const [post, setPost] = useState<Partial<AdminPost> | null>(isNew ? { ...empty } : null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('short');
  const [aiOut, setAiOut] = useState('');

  useEffect(() => {
    if (!isNew && params?.id) api<{ post: AdminPost }>(`/api/v1/admin/blog/${params.id}`).then((r) => setPost(r.post)).catch(() => setPost(null));
  }, [params?.id, isNew]);

  if (!post) return <div className="space-y-4"><AdminTabs active="blog" /><p className="text-gray-500">{isNew ? '' : 'Loading…'}</p></div>;
  const set = (k: keyof AdminPost, v: string) => setPost({ ...post, [k]: v });

  async function save(status?: 'draft' | 'published') {
    setBusy('save'); setMsg(null);
    const body = {
      titleEn: post!.titleEn, titleAr: post!.titleAr, excerptEn: post!.excerptEn, excerptAr: post!.excerptAr,
      bodyEn: post!.bodyEn, bodyAr: post!.bodyAr, coverUrl: post!.coverUrl, metaTitle: post!.metaTitle,
      metaDescription: post!.metaDescription, authorName: post!.authorName, status: status ?? post!.status,
      ...(isNew ? {} : { slug: post!.slug }),
    };
    try {
      const r = isNew
        ? await api<{ post: AdminPost }>('/api/v1/admin/blog', { method: 'POST', body })
        : await api<{ post: AdminPost }>(`/api/v1/admin/blog/${post!.id}`, { method: 'PATCH', body });
      setPost(r.post);
      setMsg({ ok: true, text: r.post.status === 'published' ? 'Saved and published.' : 'Saved as draft.' });
      if (isNew) navigate(`/app/admin/blog/${r.post.id}`, { replace: true });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' }); }
    finally { setBusy(''); }
  }

  async function upload(file: File) {
    setBusy('upload'); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`${API_URL}/api/v1/admin/media`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Upload failed (${res.status})`);
      setPost({ ...post!, coverUrl: j.url });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Upload failed' }); }
    finally { setBusy(''); }
  }

  async function ai(action: string, text = '') {
    setBusy(action); setMsg(null);
    try {
      const r = await api<{ text: string }>('/api/v1/admin/blog-ai', { method: 'POST', body: { action, topic: topic || post!.titleEn, text, length } });
      return r.text;
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'AI request failed' }); return null; }
    finally { setBusy(''); }
  }

  async function translateToArabic() {
    const [t, x, b] = [post!.titleEn ?? '', post!.excerptEn ?? '', post!.bodyEn ?? ''];
    if (!t && !b) return setMsg({ ok: false, text: 'Write the English title and body first.' });
    setBusy('translate_ar'); setMsg(null);
    try {
      const run = (text: string) => text.trim() ? api<{ text: string }>('/api/v1/admin/blog-ai', { method: 'POST', body: { action: 'translate_ar', text } }).then((r) => r.text) : Promise.resolve('');
      const [ta, xa, ba] = await Promise.all([run(t), run(x), run(b)]);
      setPost({ ...post!, titleAr: ta, excerptAr: xa, bodyAr: ba });
      setMsg({ ok: true, text: 'Arabic fields filled from the English. Review them, then save.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Translation failed' }); }
    finally { setBusy(''); }
  }

  async function remove() {
    if (!post!.id || !confirm('Delete this post permanently?')) return;
    await api(`/api/v1/admin/blog/${post!.id}`, { method: 'DELETE' });
    navigate('/app/admin/blog');
  }

  const btn = 'px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm hover:border-gray-300 disabled:opacity-50';
  return (
    <div className="space-y-5">
      <AdminTabs active="blog" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/app/admin/blog" className="text-sm text-gray-500 hover:text-gray-800">← All posts</Link>
          <h1 className="text-lg font-bold text-gray-900">{isNew ? 'New post' : post.titleEn || 'Untitled'}</h1>
          {!isNew && <p className="text-xs text-gray-500">Status: {post.status}{post.status === 'published' && <> · <a href={`/blog/${post.slug}`} target="_blank" rel="noopener" className="text-[#C41E3A] hover:underline">view live ↗</a></>}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
          <button className={btn} disabled={!!busy} onClick={() => save('draft')}>Save draft</button>
          <button className="btn-primary text-sm px-4 py-2 disabled:opacity-50" disabled={!!busy} onClick={() => save('published')}>
            {post.status === 'published' ? 'Save and keep published' : 'Publish'}
          </button>
          {!isNew && post.status === 'published' && <button className={btn} disabled={!!busy} onClick={() => save('draft')}>Unpublish</button>}
          {!isNew && <button className="px-3 py-1.5 rounded-md border border-red-200 text-sm text-red-700 hover:bg-red-50" onClick={remove}>Delete</button>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">English</h2>
            <input className={input} placeholder="Title" value={post.titleEn ?? ''} onChange={(e) => set('titleEn', e.target.value)} maxLength={300} />
            <textarea className={input} rows={2} placeholder="Excerpt (shown on the blog card)" value={post.excerptEn ?? ''} onChange={(e) => set('excerptEn', e.target.value)} maxLength={600} />
            <MarkdownEditor rows={16} placeholder="Write or paste the post. Links: [text](https://…), images: ![alt](https://…)" value={post.bodyEn ?? ''} onChange={(v) => set('bodyEn', v)} />
          </section>
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">العربية (Arabic, optional)</h2>
              <button className={btn} disabled={!!busy} onClick={translateToArabic}>{busy === 'translate_ar' ? 'Translating…' : 'Translate from English with AI'}</button>
            </div>
            <input dir="rtl" className={input} placeholder="العنوان" value={post.titleAr ?? ''} onChange={(e) => set('titleAr', e.target.value)} maxLength={300} />
            <textarea dir="rtl" className={input} rows={2} placeholder="المقتطف" value={post.excerptAr ?? ''} onChange={(e) => set('excerptAr', e.target.value)} maxLength={600} />
            <MarkdownEditor dir="rtl" rows={12} placeholder="نص المقالة" value={post.bodyAr ?? ''} onChange={(v) => set('bodyAr', v)} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Cover image</h2>
            {post.coverUrl && <img src={post.coverUrl} alt="" className="w-full rounded-lg" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} className="text-sm" />
            <p className="text-xs text-gray-500">PNG, JPEG or WebP, up to 4 MB. 1600×1000 works well.</p>
            {post.coverUrl && <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => set('coverUrl', '')}>Remove cover</button>}
          </section>
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Details</h2>
            {!isNew && <label className="block text-xs text-gray-500">Address: /blog/<input className={`${input} mt-1`} value={post.slug ?? ''} onChange={(e) => set('slug', e.target.value)} maxLength={120} /></label>}
            <input className={input} placeholder="Author name (optional)" value={post.authorName ?? ''} onChange={(e) => set('authorName', e.target.value)} maxLength={100} />
            <input className={input} placeholder="SEO title (under 60 characters)" value={post.metaTitle ?? ''} onChange={(e) => set('metaTitle', e.target.value)} maxLength={70} />
            <textarea className={input} rows={2} placeholder="SEO description (under 155 characters)" value={post.metaDescription ?? ''} onChange={(e) => set('metaDescription', e.target.value)} maxLength={170} />
          </section>
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">AI writing assistant</h2>
            <input className={input} placeholder="Topic (defaults to the English title)" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={500} />
            <div className="flex flex-wrap gap-2">
              <button className={btn} disabled={!!busy} onClick={async () => { const t = await ai('titles'); if (t) setAiOut(t); }}>Title ideas</button>
              <button className={btn} disabled={!!busy} onClick={async () => { const t = await ai('outline'); if (t) setAiOut(t); }}>Outline</button>
              <span className="inline-flex items-center gap-1">
                <button className={btn} disabled={!!busy} onClick={async () => { const t = await ai('full_post', aiOut); if (t) setAiOut(t); }}>Write full post</button>
                <select aria-label="Post length" value={length} onChange={(e) => setLength(e.target.value as typeof length)} disabled={!!busy}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm">
                  <option value="short">Short, about 600 words</option>
                  <option value="medium">Medium, about 1,500 words</option>
                  <option value="long">Long, up to 3,500 words</option>
                </select>
              </span>
              <button className={btn} disabled={!!busy} onClick={async () => { const t = await ai('excerpt', post.bodyEn ?? ''); if (t) setPost({ ...post, excerptEn: t }); }}>Write excerpt</button>
              <button className={btn} disabled={!!busy} onClick={async () => {
                const t = await ai('seo', post.bodyEn ?? ''); if (!t) return;
                setPost({ ...post, metaTitle: t.match(/META TITLE:\s*(.+)/)?.[1]?.trim().slice(0, 70) ?? post.metaTitle, metaDescription: t.match(/META DESCRIPTION:\s*(.+)/)?.[1]?.trim().slice(0, 170) ?? post.metaDescription });
              }}>SEO fields</button>
              <button className={btn} disabled={!!busy || !(post.bodyEn ?? '').trim()} onClick={async () => { const t = await ai('improve', post.bodyEn ?? ''); if (t) setAiOut(t); }}>Improve body</button>
            </div>
            {busy && !['save', 'upload'].includes(busy) && <p role="status" className="text-sm text-gray-500">{busy === 'full_post' ? (length === 'long' ? 'Writing a long post. This can take two to three minutes; keep this page open.' : length === 'medium' ? 'Writing. This can take up to a minute.' : 'Writing…') : 'Working…'}</p>}
            {aiOut && <p className="text-xs text-gray-500">{aiOut.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</p>}
            {aiOut && (
              <div className="space-y-2">
                <textarea className={`${input} font-mono`} rows={10} value={aiOut} onChange={(e) => setAiOut(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={() => setPost({ ...post, bodyEn: aiOut })}>Use as English body</button>
                  <button className={btn} onClick={() => setPost({ ...post, titleEn: aiOut.split('\n')[0].replace(/^\s*(\d+[.)]|#+|[-*])\s*/, '').replace(/\*\*/g, '').trim() })}>Use first line as title</button>
                  <button className={btn} onClick={() => setAiOut('')}>Clear</button>
                </div>
                <p className="text-xs text-gray-500">AI text is a draft. Check facts before publishing.</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
