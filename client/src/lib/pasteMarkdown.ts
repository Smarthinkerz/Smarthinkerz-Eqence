// Turns text pasted from Word, Google Docs, PDFs or web pages into the Markdown our
// pages render: headings become ## / ###, bold stays **bold**, bullets become "- ".
// htmlToMarkdown only reads the clipboard HTML through DOMParser (nothing is inserted
// into the page or executed); the output is plain text.

// Bullet characters documents use instead of "-": • ● ▪ ■ ◦ ‣ · and Word's Symbol-font bullet.
const BULLET = /^(\s*)[•●▪■◦‣·⁃]\s*/;

/** Normalise plain pasted text: bullet characters to "- ", stray non-breaking spaces to spaces. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(BULLET, '$1- ').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // Word pastes every bullet as its own paragraph; keep a list's items on adjacent lines.
    .replace(/^(\s*(?:-|\d+[.)]) .*)\n\n(?=\s*(?:-|\d+[.)]) )/gm, '$1\n')
    .trim();
}

const BLOCK_TAGS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'TBODY', 'THEAD', 'TR', 'TD', 'TH', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'PRE'];
const BLOCK = new RegExp(`^(${BLOCK_TAGS.join('|')})$`);
const BLOCK_SELECTOR = BLOCK_TAGS.join(',').toLowerCase();

function wrap(s: string, mark: string) {
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : s;
}

function isBold(el: HTMLElement) {
  const fw = el.style.fontWeight;
  if (fw === 'normal' || fw === '400') return false;   // Google Docs wraps everything in <b style="font-weight:normal">
  return el.tagName === 'B' || el.tagName === 'STRONG' || fw === 'bold' || Number(fw) >= 600;
}

function inline(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').replace(/\s+/g, ' ');
  if (!(n instanceof HTMLElement)) return '';
  if (n.tagName === 'BR') return '\n';
  if (n.tagName === 'STYLE' || n.tagName === 'SCRIPT') return '';
  const inner = Array.from(n.childNodes).map(inline).join('');
  if (n.tagName === 'A') {
    const href = n.getAttribute('href') ?? '';
    return /^https?:\/\//i.test(href) && inner.trim() ? `[${inner.trim()}](${href})` : inner;
  }
  if (isBold(n)) return wrap(inner.replace(/\*\*/g, ''), '**');
  if (n.tagName === 'I' || n.tagName === 'EM' || n.style.fontStyle === 'italic') return wrap(inner, '*');
  return inner;
}

const clean = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

function list(el: HTMLElement, out: string[], depth: number) {
  const lines: string[] = [];
  let i = 1;
  const walk = (ul: HTMLElement, d: number) => {
    for (const li of Array.from(ul.children)) {
      if (!(li instanceof HTMLElement)) continue;
      if (li.tagName === 'UL' || li.tagName === 'OL') { walk(li, d + 1); continue; }
      const nested: HTMLElement[] = [];
      const text = clean(Array.from(li.childNodes).map((c) => {
        if (c instanceof HTMLElement && (c.tagName === 'UL' || c.tagName === 'OL')) { nested.push(c); return ''; }
        return inline(c);
      }).join('')).replace(/\n/g, ' ');
      if (text) lines.push(`${'  '.repeat(d)}${ul.tagName === 'OL' && d === depth ? `${i++}.` : '-'} ${text}`);
      for (const n of nested) walk(n, d + 1);
    }
  };
  walk(el, depth);
  if (lines.length) out.push(lines.join('\n'));
}

function blocks(el: Element, out: string[]) {
  let buf = '';
  const flush = () => { const t = clean(buf); if (t) out.push(t); buf = ''; };
  for (const c of Array.from(el.childNodes)) {
    if (!(c instanceof HTMLElement)) { buf += inline(c); continue; }
    const tag = c.tagName;
    if (!BLOCK.test(tag)) {
      // An inline wrapper around whole paragraphs (Google Docs puts the document in one <b>): walk into it.
      if (c.querySelector(BLOCK_SELECTOR)) { flush(); blocks(c, out); } else buf += inline(c);
      continue;
    }
    flush();
    if (/^H[1-6]$/.test(tag)) {
      const t = clean(inline(c)).replace(/\*\*/g, '').replace(/\n/g, ' ');
      if (t) out.push(`${tag === 'H1' || tag === 'H2' ? '##' : '###'} ${t}`);
    } else if (tag === 'UL' || tag === 'OL') {
      list(c, out, 0);
    } else if (tag === 'BLOCKQUOTE') {
      const t = clean(inline(c));
      if (t) out.push(t.split('\n').map((l) => `> ${l}`).join('\n'));
    } else {
      blocks(c, out);
    }
  }
  flush();
}

/** Clipboard HTML → Markdown. Returns null when the HTML holds no text worth converting. */
export function htmlToMarkdown(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  blocks(doc.body, out);
  const md = tidyText(out.join('\n\n').replace(/\*\*\*\*/g, ''));
  return md || null;
}
