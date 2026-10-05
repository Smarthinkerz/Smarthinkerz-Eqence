// Renders blog Markdown as React elements. No HTML is ever passed through: text becomes
// text nodes, so a post cannot inject scripts or markup. Supports ## / ### headings,
// paragraphs, - (or • pasted from documents) and 1. lists, > quotes, **bold**, *italic*, [links](https://…) and
// ![images](https://…). Links and images must be http(s); anything else is shown as text.
import type { ReactNode } from 'react';

const SAFE_URL = /^https?:\/\/[^\s]+$/i;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(!\[([^\]]*)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) {
      out.push(SAFE_URL.test(m[3]) ? <img key={k} src={m[3]} alt={m[2]} loading="lazy" className="my-6 w-full rounded-xl" /> : m[0]);
    } else if (m[4]) {
      out.push(SAFE_URL.test(m[6])
        ? <a key={k} href={m[6]} target="_blank" rel="noopener noreferrer nofollow" className="text-[#C41E3A] underline">{m[5]}</a>
        : m[0]);
    } else if (m[7]) {
      out.push(<strong key={k}>{m[8]}</strong>);
    } else if (m[9]) {
      out.push(<em key={k}>{m[10]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ source, dir }: { source: string; dir?: 'rtl' | 'ltr' | 'auto' }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let n = 0;

  const flush = () => {
    if (para.length) { blocks.push(<p key={n++} className="mb-5">{inline(para.join(' '), `p${n}`)}</p>); para = []; }
    if (list) {
      const items = list.items.map((it, j) => <li key={j} className="mb-1">{inline(it, `l${n}-${j}`)}</li>);
      blocks.push(list.ordered ? <ol key={n++} className="mb-5 list-decimal ps-6">{items}</ol> : <ul key={n++} className="mb-5 list-disc ps-6">{items}</ul>);
      list = null;
    }
    if (quote.length) { blocks.push(<blockquote key={n++} className="mb-5 border-s-4 border-[#C41E3A]/40 ps-4 text-gray-600 italic">{inline(quote.join(' '), `q${n}`)}</blockquote>); quote = []; }
  };

  // A blank line ends paragraphs and quotes; a list stays open across it if another item follows.
  let gap = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      if (para.length || quote.length) flush();
      gap = true;
      continue;
    }
    const item = line.match(/^\s*(?:[-*+•●▪■◦‣·]|\d+[.)])\s+(.+)$/);
    // An indented line right under a list item is that item wrapping onto a new line.
    if (list && !item && !gap && /^\s/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (list && gap && !item) flush();
    gap = false;
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flush();
      const level = m[1].length;
      const cls = level === 1 ? 'text-3xl' : level === 2 ? 'text-2xl' : 'text-xl';
      const El = (level === 3 ? 'h3' : 'h2') as 'h2' | 'h3';
      blocks.push(<El key={n++} className={`${cls} font-bold text-gray-900 mt-8 mb-4`}>{inline(m[2], `h${n}`)}</El>);
      continue;
    }
    if (item) {
      const ordered = /^\s*\d/.test(line);
      if (para.length || quote.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[1]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      if (para.length || list) flush();
      quote.push(m[1]);
      continue;
    }
    if (list || quote.length) flush();
    para.push(line.trim());
  }
  flush();
  return <div dir={dir} className="text-[1.05rem] leading-[1.8] text-slate-700">{blocks}</div>;
}
