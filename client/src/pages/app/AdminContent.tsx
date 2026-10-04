// Front-page text editor. Every field shows the built-in default; anything typed here
// overrides it on the live site for that language. Clearing a field restores the default.
import { useEffect, useMemo, useState } from 'react';
import { translations, useI18n } from '../../contexts/I18nContext';
import { api, API_URL } from '../../lib/api';
import AppShell from './AppShell';
import { AdminTabs } from './AdminBlog';

const GROUPS: { title: string; page: string; keys: string[] }[] = [
  { title: 'Navigation', page: '/', keys: ['nav.features', 'nav.pricing', 'nav.blog', 'nav.login', 'nav.register'] },
  { title: 'Hero', page: '/', keys: ['hero.badge', 'hero.title', 'hero.subtitle', 'hero.cta'] },
  {
    title: 'Features', page: '/#features', keys: ['features.title', 'features.subtitle',
      ...['monitoring', 'sentiment', 'autoresponse', 'analytics', 'notifications', 'integrations'].flatMap((k) => [`features.${k}`, `features.${k}.desc`])],
  },
  { title: 'How it works', page: '/#how-it-works', keys: ['howit.title', 'howit.subtitle', 'howit.step1', 'howit.step1.desc', 'howit.step2', 'howit.step2.desc', 'howit.step3', 'howit.step3.desc'] },
  { title: 'Pricing', page: '/#pricing', keys: ['pricing.title', 'pricing.subtitle', 'pricing.cta', 'pricing.contact', 'pricing.f.replies', 'pricing.f.included'] },
  { title: 'Legal pages', page: '/privacy', keys: ['legal.privacy.title', 'legal.privacy.body', 'legal.terms.title', 'legal.terms.body'] },
  { title: 'Blog page', page: '/blog', keys: ['blog.hero.image', 'blog.hero.title', 'blog.hero.subtitle', 'blog.section.title', 'blog.section.subtitle', 'blog.readmore', 'blog.back', 'blog.empty'] },
];
const LANGS = [{ code: 'en', label: 'English' }, { code: 'ar', label: 'العربية' }, { code: 'ja', label: '日本語' }];

export default function AdminContent() {
  return <AppShell admin>{() => <Body />}</AppShell>;
}

function Body() {
  const { reloadContent } = useI18n();
  const [lang, setLang] = useState('en');
  const [saved, setSaved] = useState<Record<string, string>>({});   // key|lang -> value in the database
  const [draft, setDraft] = useState<Record<string, string>>({});   // key|lang -> value being edited
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<{ rows: { key: string; lang: string; value: string }[] }>('/api/v1/admin/content').then(({ rows }) => {
    const m: Record<string, string> = {};
    for (const r of rows) m[`${r.key}|${r.lang}`] = r.value;
    setSaved(m); setDraft(m);
  });
  useEffect(() => { load(); }, []);

  const changed = useMemo(() => GROUPS.flatMap((g) => g.keys).filter((k) => (draft[`${k}|${lang}`] ?? '') !== (saved[`${k}|${lang}`] ?? '')), [draft, saved, lang]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const values = Object.fromEntries(changed.map((k) => [k, (draft[`${k}|${lang}`] ?? '').trim() || null]));
      await api('/api/v1/admin/content', { method: 'PUT', body: { lang, values } });
      await load();
      reloadContent();
      setMsg({ ok: true, text: `Saved ${changed.length} change${changed.length === 1 ? '' : 's'}. The live site shows them within a minute.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally { setBusy(false); }
  }

  const rtl = lang === 'ar';
  return (
    <div className="space-y-5">
      <AdminTabs active="content" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Language" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={lang === l.code}
              className={`px-3 py-1.5 rounded-md ${lang === l.code ? 'bg-[#C41E3A] text-white' : 'text-gray-700'}`}>{l.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
          <button onClick={save} disabled={busy || changed.length === 0} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
            {busy ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}
          </button>
        </div>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">{g.title}</h2>
            <a href={g.page} target="_blank" rel="noopener" className="text-sm text-[#C41E3A] hover:underline">Open page ↗</a>
          </div>
          <div className="space-y-4">
            {g.keys.map((k) => {
              const def = translations[lang]?.[k] ?? translations.en[k] ?? '';
              const id = `${k}|${lang}`;
              const v = draft[id] ?? '';
              const legal = k.startsWith('legal.') && k.endsWith('.body');
              const long = legal || def.length > 70 || k.endsWith('.desc') || k.endsWith('subtitle');
              const Field = long ? 'textarea' : 'input';
              return (
                <div key={k}>
                  <label htmlFor={id} className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <code>{k}</code>{saved[id] && <span className="rounded bg-amber-50 px-1.5 text-amber-800">edited</span>}
                  </label>
                  <Field id={id} dir={rtl ? 'rtl' : 'ltr'} value={v} placeholder={legal ? 'Paste the full text here (Markdown: ## for headings, - for lists).' : def} maxLength={legal ? 60000 : 5000}
                    {...(long ? { rows: legal ? 16 : 2 } : {})}
                    onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ ...draft, [id]: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C41E3A] outline-none placeholder:text-gray-400" />
                  {k.endsWith('.image') && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {v && <img src={v} alt="" className="h-16 w-28 rounded object-cover" />}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="text-xs" onChange={async (e) => {
                        const f = e.target.files?.[0]; e.target.value = '';
                        if (!f) return;
                        const fd = new FormData(); fd.append('file', f);
                        const res = await fetch(`${API_URL}/api/v1/admin/media`, { method: 'POST', credentials: 'include', body: fd });
                        const j = await res.json().catch(() => ({}));
                        if (res.ok) setDraft((d) => ({ ...d, [id]: j.url })); else setMsg({ ok: false, text: j.error || 'Upload failed' });
                      }} />
                      <span className="text-xs text-gray-500">Banner photo, PNG/JPEG/WebP up to 4 MB, wide (e.g. 1920×600).</span>
                    </div>
                  )}
                  {saved[id] && <button className="mt-1 text-xs text-gray-500 hover:text-gray-800" onClick={() => setDraft({ ...draft, [id]: '' })}>Reset to default</button>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
