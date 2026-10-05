// Text editor for long pages (legal texts, blog posts): a toolbar for headings, bold and
// lists, a Write / Preview switch, and pasting from Word or Google Docs that keeps the
// formatting. Underneath it is plain Markdown, the same text the site renders.
import { useRef, useState } from 'react';
import { htmlToMarkdown, tidyText } from '../lib/pasteMarkdown';
import Markdown from './Markdown';

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  dir?: 'rtl' | 'ltr';
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}

const LINE_PREFIX = /^(#{1,3}\s+|\s*(?:[-*+•]|\d+[.)])\s+)/;

export default function MarkdownEditor({ id, value, onChange, dir = 'ltr', rows = 16, maxLength, placeholder }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  // Replace [start, end) with text, keeping the browser's undo history where it can.
  function replace(start: number, end: number, text: string, selStart: number, selEnd: number) {
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => el.setSelectionRange(selStart, selEnd));
  }

  // Apply a line prefix (## , ### , - , 1. ) to every selected line; clicking again removes it.
  function prefixLines(kind: 'h2' | 'h3' | 'ul' | 'ol') {
    const el = ta.current;
    if (!el) return;
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let end = value.indexOf('\n', Math.max(el.selectionEnd - (el.selectionEnd > el.selectionStart ? 1 : 0), el.selectionStart));
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split('\n');
    const want = (i: number) => (kind === 'h2' ? '## ' : kind === 'h3' ? '### ' : kind === 'ul' ? '- ' : `${i + 1}. `);
    const has = (l: string) => (kind === 'h2' ? /^##\s/.test(l) : kind === 'h3' ? /^###\s/.test(l) : kind === 'ul' ? /^\s*[-*+•]\s/.test(l) : /^\s*\d+[.)]\s/.test(l));
    const remove = lines.filter((l) => l.trim()).every(has);
    const out = lines.map((l, i) => {
      if (!l.trim()) return l;
      const bare = l.replace(LINE_PREFIX, '');
      return remove ? bare : want(i) + bare;
    }).join('\n');
    replace(start, end, out, start, start + out.length);
  }

  function bold() {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e);
    if (/^\*\*[\s\S]*\*\*$/.test(sel)) { replace(s, e, sel.slice(2, -2), s, e - 4); return; }
    const text = sel || 'bold text';
    replace(s, e, `**${text}**`, s + 2, s + 2 + text.length);
  }

  function onPaste(ev: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = ev.clipboardData.getData('text/html');
    const plain = ev.clipboardData.getData('text/plain');
    const md = (html && htmlToMarkdown(html)) || (plain ? tidyText(plain) : null);
    if (!md || md === plain) return;   // nothing to convert: let the browser paste as usual
    ev.preventDefault();
    const el = ev.currentTarget;
    const s = el.selectionStart;
    replace(s, el.selectionEnd, md, s + md.length, s + md.length);
  }

  const tool = 'px-2.5 py-1 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40';
  return (
    <div className="rounded-lg border border-gray-200 focus-within:border-[#C41E3A]">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 px-2 py-1.5">
        <button type="button" className={tool} disabled={preview} onClick={() => prefixLines('h2')} title="Title (## )">Title</button>
        <button type="button" className={tool} disabled={preview} onClick={() => prefixLines('h3')} title="Subtitle (### )">Subtitle</button>
        <button type="button" className={`${tool} font-bold`} disabled={preview} onClick={bold} title="Bold (**text**)">B</button>
        <button type="button" className={tool} disabled={preview} onClick={() => prefixLines('ul')} title="Bullet list (- )">• List</button>
        <button type="button" className={tool} disabled={preview} onClick={() => prefixLines('ol')} title="Numbered list (1. )">1. List</button>
        <div className="ms-auto inline-flex rounded-md border border-gray-200 p-0.5 text-xs">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={`px-2 py-0.5 rounded ${!preview ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>Write</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={`px-2 py-0.5 rounded ${preview ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>Preview</button>
        </div>
      </div>
      {preview ? (
        <div className="max-h-[36rem] overflow-y-auto p-4">
          {value.trim() ? <Markdown source={value} dir={dir === 'rtl' ? 'rtl' : 'auto'} /> : <p className="text-sm text-gray-400">Nothing to preview yet.</p>}
        </div>
      ) : (
        <textarea ref={ta} id={id} dir={dir} rows={rows} maxLength={maxLength} placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)} onPaste={onPaste}
          className="block w-full resize-y rounded-b-lg px-3 py-2 font-mono text-sm outline-none placeholder:text-gray-400" />
      )}
      <p className="border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-500">
        Pasting from Word or Google Docs keeps titles, bold and bullet points. Shortcuts: <code>## Title</code>, <code>### Subtitle</code>, <code>**bold**</code>, <code>- bullet</code>, <code>1. numbered</code>.
      </p>
    </div>
  );
}
