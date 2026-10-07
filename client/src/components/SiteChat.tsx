// The assistant on the front page: a button in the corner that opens a small chat about
// Eqence. Answers come from the server's fixed fact sheet. Replies are shown as plain
// text (never as HTML), and the conversation lives only in this page's memory.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { api } from '../lib/api';

interface Msg { role: 'user' | 'assistant'; content: string }

const copy = {
  en: {
    open: 'Ask about Eqence', title: 'Eqence assistant', sub: 'Answers about what Eqence does, setup and plans.',
    hello: 'Hi! Ask me anything about Eqence: what it does, how to connect your store, or the plans.',
    placeholder: 'Type your question…', send: 'Send', close: 'Close', thinking: 'Writing…',
    asks: ['What does Eqence do?', 'How do I connect my store?', 'How much does it cost?', 'Does it post replies automatically?'],
    fail: 'I could not answer just now. Please try again, or email reply@smarthinkerz.com.',
    note: 'AI assistant. It cannot see your account. For account help, email reply@smarthinkerz.com.',
  },
  ar: {
    open: 'اسأل عن Eqence', title: 'مساعد Eqence', sub: 'إجابات عن ما يفعله Eqence وطريقة الإعداد والباقات.',
    hello: 'مرحباً! اسألني أي شيء عن Eqence: ماذا يفعل، كيف تربط متجرك، أو الباقات.',
    placeholder: 'اكتب سؤالك…', send: 'إرسال', close: 'إغلاق', thinking: 'جارٍ الكتابة…',
    asks: ['ماذا يفعل Eqence؟', 'كيف أربط متجري؟', 'كم التكلفة؟', 'هل ينشر الردود تلقائياً؟'],
    fail: 'تعذّر الرد الآن. حاول مرة أخرى أو راسلنا على reply@smarthinkerz.com.',
    note: 'مساعد يعمل بالذكاء الاصطناعي ولا يستطيع رؤية حسابك. لمساعدة تخص حسابك راسل reply@smarthinkerz.com.',
  },
  ja: {
    open: 'Eqence について質問', title: 'Eqence アシスタント', sub: 'Eqence の機能、設定、料金についてお答えします。',
    hello: 'こんにちは。Eqence の機能、ストアの接続方法、料金プランなど、何でもご質問ください。',
    placeholder: '質問を入力…', send: '送信', close: '閉じる', thinking: '入力中…',
    asks: ['Eqence は何をしますか？', 'ストアの接続方法は？', '料金はいくらですか？', '返信は自動で投稿されますか？'],
    fail: 'ただいま応答できません。もう一度お試しいただくか、reply@smarthinkerz.com までご連絡ください。',
    note: 'AI アシスタントです。アカウント情報は参照できません。アカウントのご相談は reply@smarthinkerz.com へ。',
  },
} as const;

export default function SiteChat() {
  const { language } = useI18n();
  const c = copy[language as keyof typeof copy] ?? copy.en;
  const rtl = language === 'ar';
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, busy, open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(q: string) {
    const question = q.trim().slice(0, 600);
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: question }];
    setMsgs(next); setText(''); setBusy(true); setError('');
    try {
      const r = await api<{ reply: string }>('/api/chat', { method: 'POST', body: { messages: next.slice(-10) } });
      setMsgs([...next, { role: 'assistant', content: r.reply }]);
    } catch (e) {
      setError(e instanceof Error && e.message && !/^Request failed/.test(e.message) ? e.message : c.fail);
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="fixed bottom-5 end-5 z-40 flex items-center gap-2 rounded-full bg-[#C41E3A] px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#a81831] focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200">
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        {c.open}
      </button>
    );
  }

  return (
    <div role="dialog" aria-label={c.title} dir={rtl ? 'rtl' : 'ltr'}
      className="fixed bottom-0 end-0 z-40 flex h-[min(34rem,100dvh)] w-full flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl sm:bottom-5 sm:end-5 sm:w-[23rem] sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
        <div>
          <div className="font-semibold">{c.title}</div>
          <div className="text-xs text-slate-300">{c.sub}</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={c.close} className="rounded p-1 text-slate-300 hover:text-white">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div ref={list} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4 text-sm" aria-live="polite">
        <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white px-3 py-2 text-gray-800 shadow-sm">{c.hello}</div>
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {c.asks.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:border-gray-300">{q}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} dir="auto"
            className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 shadow-sm ${m.role === 'user' ? 'ms-auto rounded-ee-sm bg-[#C41E3A] text-white' : 'rounded-ss-sm bg-white text-gray-800'}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-white px-3 py-2 text-gray-500 shadow-sm">{c.thinking}</div>}
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="border-t border-gray-200 bg-white p-3">
        <div className="flex gap-2">
          <label htmlFor="site-chat-input" className="sr-only">{c.placeholder}</label>
          <input id="site-chat-input" ref={input} dir="auto" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder={c.placeholder}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#C41E3A]" />
          <button className="rounded-lg bg-[#C41E3A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !text.trim()}>{c.send}</button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-gray-500">{c.note}</p>
      </form>
    </div>
  );
}
