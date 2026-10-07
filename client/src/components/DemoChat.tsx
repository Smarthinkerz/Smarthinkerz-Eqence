// "Try it" on the home page, carried over from Comment to Customer's landing demo: the
// visitor types a sample review, and the real Eqence AI shows its reading and a reply.
// No account needed; the server limits each address to a few tries a minute.
import { useState } from 'react';
import { Link } from 'wouter';
import { useI18n } from '../contexts/I18nContext';
import { api } from '../lib/api';

interface Result { reply: string; sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'; score: number }

const copy = {
  en: {
    title: 'Try it now', subtitle: 'Type a review a customer might leave. Eqence reads it and drafts the reply, live.',
    placeholder: 'Example: The perfume smells amazing but delivery took two weeks.', button: 'Draft a reply', busy: 'Reading…',
    samples: ['Love it! Best abaya I have bought online.', 'Arrived late and the box was damaged.', 'وصل الطلب بسرعة والجودة ممتازة'],
    sentiment: 'Sentiment', intent: 'Buying intent', reply: 'Drafted reply', note: 'In your store, nothing is posted until you approve it.',
    cta: 'Use it on my reviews', positive: 'Positive', neutral: 'Neutral', negative: 'Negative', mixed: 'Mixed', fail: 'The demo could not answer just now.',
  },
  ar: {
    title: 'جرّبه الآن', subtitle: 'اكتب تقييماً قد يتركه عميل. يقرأه Eqence ويصوغ الرد مباشرة.',
    placeholder: 'مثال: العطر رائع لكن التوصيل تأخر أسبوعين.', button: 'صياغة رد', busy: 'جارٍ القراءة…',
    samples: ['وصل الطلب بسرعة والجودة ممتازة', 'تأخر الطلب والعلبة وصلت تالفة', 'Great quality, will order again!'],
    sentiment: 'الانطباع', intent: 'نية الشراء', reply: 'الرد المقترح', note: 'في متجرك لا يُنشر أي رد قبل موافقتك.',
    cta: 'استخدمه على تقييماتي', positive: 'إيجابي', neutral: 'محايد', negative: 'سلبي', mixed: 'متباين', fail: 'تعذّر الرد الآن.',
  },
  ja: {
    title: '今すぐ試す', subtitle: 'お客様が書きそうなレビューを入力してください。Eqence が読み取り、返信を作成します。',
    placeholder: '例：香りは最高ですが、配送に2週間かかりました。', button: '返信を作成', busy: '読み取り中…',
    samples: ['品質が良く、また注文します。', '到着が遅れ、箱が破損していました。', 'Love it! Fast delivery.'],
    sentiment: '感情', intent: '購入意欲', reply: '返信案', note: '実際のストアでは、承認するまで投稿されません。',
    cta: '自分のレビューで使う', positive: 'ポジティブ', neutral: '中立', negative: 'ネガティブ', mixed: '混在', fail: 'ただいま応答できません。',
  },
} as const;

const tone = { positive: 'bg-green-50 text-green-800', neutral: 'bg-gray-100 text-gray-700', negative: 'bg-red-50 text-red-700', mixed: 'bg-amber-50 text-amber-800' };

export default function DemoChat() {
  const { language } = useI18n();
  const c = copy[(language as keyof typeof copy)] ?? copy.en;
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  async function ask(text: string) {
    const m = text.trim();
    if (!m || busy) return;
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api<Result>('/api/demo-chat', { method: 'POST', body: { message: m } })); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : c.fail); }
    finally { setBusy(false); }
  }

  return (
    <section id="demo" className="section-padding bg-white">
      <div className="container max-w-3xl">
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900">{c.title}</h2>
          <p className="mt-3 text-gray-600">{c.subtitle}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(message); }} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
          <label htmlFor="demo-text" className="sr-only">{c.title}</label>
          <textarea id="demo-text" dir="auto" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={c.placeholder}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-[#C41E3A]" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {c.samples.map((s) => (
                <button key={s} type="button" dir="auto" onClick={() => { setMessage(s); ask(s); }}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:border-gray-300">{s}</button>
              ))}
            </div>
            <button className="btn-primary px-5 py-2.5 text-sm disabled:opacity-60" disabled={busy || !message.trim()}>{busy ? c.busy : c.button}</button>
          </div>
          {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {result && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-medium ${tone[result.sentiment]}`}>{c.sentiment}: {c[result.sentiment]}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{c.intent}: {result.score}/100</span>
              </div>
              <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{c.reply}</div>
              <p dir="auto" className="mt-1 text-gray-900 leading-relaxed">{result.reply}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-gray-500">{c.note}</span>
                <Link href="/app/sign-in?mode=up" className="text-sm font-semibold text-[#C41E3A] hover:underline">{c.cta} →</Link>
              </div>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
