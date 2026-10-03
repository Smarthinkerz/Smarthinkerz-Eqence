// Public blog, laid out like cahitcontracting.com/blog: hero banner, section heading,
// three-column card grid (cover, month and year, title, excerpt, read more), then
// /blog/<slug> with a title banner and an 800px article column. Arabic readers get the
// Arabic fields when a post has them, otherwise the English text.
import { useEffect, useState } from 'react';
import { Link, useRoute } from 'wouter';
import Markdown from '../components/Markdown';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import { useI18n } from '../contexts/I18nContext';
import { API_URL } from '../lib/api';

interface PostCard {
  slug: string; titleEn: string; titleAr: string | null; excerptEn: string | null; excerptAr: string | null;
  coverUrl: string | null; authorName: string | null; publishedAt: string;
}
interface Post extends PostCard { bodyEn: string; bodyAr: string | null; metaTitle: string | null; metaDescription: string | null }

const locale = (lang: string) => (lang === 'ar' ? 'ar' : lang === 'ja' ? 'ja-JP' : 'en-GB');
const pick = (lang: string, en: string | null, ar: string | null) => (lang === 'ar' && ar ? ar : en ?? '');

function Cover({ url, title }: { url: string | null; title: string }) {
  return url ? (
    <img src={url} alt={title} loading="lazy" className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#C41E3A] to-[#7a1324] text-5xl font-black text-white/90">
      {title.trim().charAt(0) || 'E'}
    </div>
  );
}

function Banner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="relative mt-16 bg-gradient-to-br from-slate-900 via-slate-800 to-[#5a0f1c] text-white">
      <div className="container py-16 sm:py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-black" dir="auto">{title}</h1>
        {subtitle && <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200" dir="auto">{subtitle}</p>}
      </div>
    </section>
  );
}

export default function Blog() {
  const { t, language } = useI18n();
  const [posts, setPosts] = useState<PostCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.title = `${t('blog.hero.title')} | Eqence`;
    fetch(`${API_URL}/api/blog`).then((r) => r.json()).then((j) => setPosts(j.posts ?? [])).catch(() => setFailed(true));
  }, [t]);

  return (
    <div className="min-h-screen bg-white">
      <SiteNav />
      <Banner title={t('blog.hero.title')} subtitle={t('blog.hero.subtitle')} />
      <section className="section-padding">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{t('blog.section.title')}</h2>
            <p className="text-lg text-gray-600">{t('blog.section.subtitle')}</p>
          </div>
          {posts === null && !failed ? <p className="text-center text-gray-500">…</p>
            : failed || posts!.length === 0 ? <p className="text-center text-gray-600">{t('blog.empty')}</p>
            : (
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {posts!.map((p) => {
                  const title = pick(language, p.titleEn, p.titleAr);
                  return (
                    <article key={p.slug} className="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-lg">
                      <Link href={`/blog/${p.slug}`} className="block aspect-[16/10] overflow-hidden bg-gray-100"><Cover url={p.coverUrl} title={title} /></Link>
                      <div className="flex flex-1 flex-col p-6">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#C41E3A]">
                          {new Date(p.publishedAt).toLocaleDateString(locale(language), { month: 'long', year: 'numeric' })}
                        </span>
                        <h3 className="mt-2 text-lg font-bold text-gray-900" dir="auto">
                          <Link href={`/blog/${p.slug}`} className="hover:text-[#C41E3A]">{title}</Link>
                        </h3>
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600 line-clamp-4" dir="auto">{pick(language, p.excerptEn, p.excerptAr)}</p>
                        <Link href={`/blog/${p.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#C41E3A] hover:underline">
                          {t('blog.readmore')} <span aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

export function BlogPost() {
  const { t, language } = useI18n();
  const [, params] = useRoute('/blog/:slug');
  const [post, setPost] = useState<Post | null | undefined>(undefined);

  useEffect(() => {
    setPost(undefined);
    fetch(`${API_URL}/api/blog/${encodeURIComponent(params?.slug ?? '')}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => setPost(j?.post ?? null)).catch(() => setPost(null));
  }, [params?.slug]);

  const title = post ? pick(language, post.titleEn, post.titleAr) : '';
  useEffect(() => {
    if (!post) return;
    document.title = `${post.metaTitle || title} | Eqence`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = post.metaDescription || pick(language, post.excerptEn, post.excerptAr) || '';
  }, [post, title, language]);

  const body = post ? (language === 'ar' && post.bodyAr ? post.bodyAr : post.bodyEn) : '';
  const rtl = language === 'ar' && !!post?.bodyAr;

  return (
    <div className="min-h-screen bg-white">
      <SiteNav />
      {post === undefined ? <div className="mt-40 text-center text-gray-500">…</div>
        : post === null ? (
          <>
            <Banner title={t('blog.hero.title')} />
            <div className="container py-16 text-center">
              <p className="text-gray-700">{t('blog.notfound')}</p>
              <Link href="/blog" className="mt-4 inline-block text-[#C41E3A] hover:underline">{t('blog.back')}</Link>
            </div>
          </>
        ) : (
          <>
            <Banner title={title} subtitle={new Date(post.publishedAt).toLocaleDateString(locale(language), { day: 'numeric', month: 'long', year: 'numeric' })} />
            <section className="section-padding">
              <div className="mx-auto max-w-[800px] px-4">
                {post.coverUrl && <img src={post.coverUrl} alt={title} className="mb-8 w-full rounded-xl" />}
                <Markdown source={body} dir={rtl ? 'rtl' : 'auto'} />
                {post.authorName && <p className="mt-8 text-sm text-gray-500" dir="auto">{post.authorName}</p>}
                <Link href="/blog" className="mt-10 inline-block font-semibold text-[#C41E3A] hover:underline">
                  {language === 'ar' ? '→' : '←'} {t('blog.back')}
                </Link>
              </div>
            </section>
          </>
        )}
      <SiteFooter />
    </div>
  );
}
