/**
 * Read-only rich text for task descriptions (stored as CKEditor HTML).
 *
 * We parse with htmlparser2 and build OUR OWN small tree from a strict
 * whitelist. Nothing from the source markup is passed through: no styles, no
 * classes, no images, no scripts. Anything not listed is dropped (dangerous
 * containers with their content) or unwrapped (harmless wrappers, text kept).
 *
 * Allowed tags: p, br, strong, em, u, s, ul, ol, li, a, blockquote, code, pre,
 *               h1-h6 (rendered as headings), div (block). Only a[href] is read.
 * Allowed link schemes: http, https, mailto.
 *
 * Hardening (untrusted input):
 *  - input is capped (MAX_INPUT_CHARS) and the block count is capped (MAX_BLOCKS);
 *  - recursion depth is capped (MAX_DEPTH); deeper content is flattened to text
 *    by an ITERATIVE walk, so 10k nested elements cannot overflow the stack;
 *  - HTML detection is a linear scan, not a backtracking regex.
 */
import { parseDocument } from 'htmlparser2';

export interface InlineText {
  kind: 'text';
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  /** Normalized, already scheme-checked URL. */
  href?: string;
}
export interface InlineBreak {
  kind: 'break';
}
export type Inline = InlineText | InlineBreak;

export type Block =
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'heading'; level: 2 | 3 | 4; children: Inline[] }
  | { kind: 'quote'; children: Block[] }
  | { kind: 'list'; ordered: boolean; items: Block[][] }
  | { kind: 'code'; text: string };

export const MAX_INPUT_CHARS = 100_000;
/** First render shows this much; "Show more" raises it to MAX_INPUT_CHARS. */
export const PREVIEW_CHARS = 20_000;
export const MAX_BLOCKS = 2_000;
/** Preview budget before "Show more". */
export const PREVIEW_BLOCKS = 300;
export const MAX_DEPTH = 50;

/* ── URLs ────────────────────────────────────────────────────────────────── */

// Control chars, whitespace (incl. NBSP and the Unicode line separators) and
// invisible / bidi-control characters that can disguise a URL.
// Char codes instead of a regex literal: linear, no escapes to get mangled.
function hasBadUrlChar(url: string): boolean {
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c <= 0x20 || (c >= 0x7f && c <= 0xa0) || c === 0xad) return true;
    if (c === 0x2028 || c === 0x2029 || c === 0x2060 || c === 0xfeff) return true;
    if ((c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
  }
  return false;
}

/**
 * Returns a normalized URL if it is safe to open, else null. Leading/trailing
 * whitespace is trimmed; ANY control character, whitespace or invisible/bidi
 * character left inside (including inside the scheme, e.g. "java\tscript:")
 * rejects the URL outright instead of being "repaired". http(s) URLs with a
 * backslash are rejected too: WHATWG parsers treat "\" as "/" for those schemes,
 * so "https://evil.com\@good.com" really goes to evil.com. Callers must use the
 * RETURNED value, never the raw input.
 */
export function normalizeUrl(
  href: unknown,
  schemes: readonly string[] = ['http', 'https', 'mailto'],
): string | null {
  if (typeof href !== 'string') return null;
  const url = href.trim();
  if (!url || url.length > 4096 || hasBadUrlChar(url)) return null;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (!m || !schemes.includes((m[1] as string).toLowerCase())) return null;
  const scheme = (m[1] as string).toLowerCase();
  if ((scheme === 'http' || scheme === 'https') && url.includes('\\')) return null;
  return url;
}

export const isSafeUrl = (href: unknown, schemes?: readonly string[]): boolean =>
  normalizeUrl(href, schemes) !== null;

/** Authority of an http(s) URL as a WHATWG parser reads it: ends at the first / \ ? or #. */
function authorityOf(href: string): string | null {
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:[/\\]{0,2}([^/\\?#]*)/.exec(href);
  return m ? (m[1] ?? '') : null;
}

/** True when an http(s) link carries "user@" or "user:pass@" before the host. */
export function linkHasUserinfo(href: string): boolean {
  if (href.toLowerCase().startsWith('mailto:')) return false;
  return (authorityOf(href) ?? '').includes('@');
}

/** Host (or mailbox) a link will really go to, for display and confirmation. */
export function linkHost(href: string): string {
  if (href.toLowerCase().startsWith('mailto:')) return href.slice(7).split('?')[0] ?? '';
  const auth = authorityOf(href) ?? '';
  const host = auth.slice(auth.lastIndexOf('@') + 1); // the LAST "@" ends the userinfo
  return host.replace(/:\d*$/, '');
}

const stripWww = (h: string) => h.toLowerCase().replace(/^www\./, '');

/** Non-ASCII characters or punycode: a possible look-alike (IDN homograph). */
export function isIdnLike(host: string): boolean {
  if (host.toLowerCase().includes('xn--')) return true;
  for (let i = 0; i < host.length; i++) if (host.charCodeAt(i) > 127) return true;
  return false;
}

/** If link text looks like a URL or a domain, returns the host it claims; else null. */
function claimedHost(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/.exec(t);
  const raw = withScheme ? withScheme[1] : /^((?:[^\s./?#:@]+\.)+[^\s./?#:@]{2,})(?:[:/?#].*)?$/.exec(t)?.[1];
  // Text shown with userinfo ("example.com@evil.io") is a classic spoof: never trust it.
  if (!raw || raw.includes('@') || raw.includes('\\')) return null;
  return stripWww(raw.replace(/:\d+$/, ''));
}

// Without a public-suffix list we cannot know the registrable domain, so a
// parent-domain claim is only trusted when the claimed name is clearly NOT a
// public suffix: not "co.uk"-shaped and not a well-known multi-tenant host.
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'gob', 'nom', 'ltd', 'plc', 'sch', 'mil', 'id', 'info', 'biz']);
const SHARED_HOSTS = new Set([
  'github.io', 'herokuapp.com', 'blogspot.com', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev',
  'web.app', 'firebaseapp.com', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'appspot.com',
  'onrender.com', 'glitch.me', 'repl.co', 'ngrok.io', 'wordpress.com', 'wixsite.com', 'weebly.com',
  'pp.ua', 's3.amazonaws.com', 'execute-api.amazonaws.com', 'elasticbeanstalk.com',
]);
function looksLikePublicSuffix(domain: string): boolean {
  if (SHARED_HOSTS.has(domain)) return true;
  const labels = domain.split('.');
  if (labels.length < 2) return true;
  const last = labels[labels.length - 1] ?? '';
  const prev = labels[labels.length - 2] ?? '';
  return labels.length === 2 && last.length === 2 && SECOND_LEVEL.has(prev);
}

/**
 * True when the visible link text does not honestly show where the link goes.
 * Always confirms: userinfo ("user@host"), backslashes in http(s) URLs, IDN or
 * punycode hosts, and plain text ("click here") so the real host is shown.
 * Hosts are compared by EQUALITY (after stripping "www."), or label-boundary
 * parent (text "example.com" for "docs.example.com") when the claimed name is
 * not a public-suffix lookalike ("co.uk" for "evil.co.uk" confirms). Never by
 * substring: "box.com" must not vouch for "x.co", and "bank.com.evil.io" is not
 * "bank.com".
 */
export function linkNeedsConfirm(text: string, href: string): boolean {
  const isMail = href.toLowerCase().startsWith('mailto:');
  if (!isMail && (href.includes('\\') || linkHasUserinfo(href))) return true;
  // Scheme downgrade: the text promises https:// but the link is plain http.
  if (/^https:\/\//i.test(text.trim()) && /^http:/i.test(href)) return true;
  const real = stripWww(linkHost(href));
  if (!real) return true;
  if (isIdnLike(real)) return true;
  const claimed = claimedHost(text);
  if (!claimed) return true; // not a domain: show the real host and ask
  if (isIdnLike(claimed)) return true;
  if (claimed === real) return false;
  // text is a parent domain of the real host, on a label boundary
  if (real.endsWith(`.${claimed}`) && !looksLikePublicSuffix(claimed)) return false;
  return true;
}

/* ── DOM walking ─────────────────────────────────────────────────────────── */

/** Dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math',
  'head', 'title', 'link', 'meta', 'img', 'video', 'audio', 'canvas', 'form', 'input',
  'button', 'select', 'textarea', 'applet', 'base',
]);

interface DomNode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

interface Marks {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  href?: string;
}

interface Ctx {
  blocks: number;
  truncated: boolean;
  /** Document-wide leaf-block budget. */
  maxBlocks: number;
  /** Budget for ONE container (quote, list, div, table): a huge container cannot starve later content. */
  containerCap: number;
}

const WS = /[\s ]+/g;
const collapse = (t: string) => t.replace(WS, ' ');

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'pre', 'li', 'div', 'td', 'th',
]);
/** Table structure is flattened: containers are unwrapped, each cell becomes a text block. */
const TABLE_CONTAINERS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'caption', 'colgroup']);
const INLINE_TAGS = new Set(['br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'a']);
const tagName = (n: DomNode) => (n.type === 'tag' ? (n.name ?? '').toLowerCase() : '');

/** Iterative (explicit stack) text extraction: safe for arbitrarily deep trees. */
function flattenText(nodes: DomNode[]): string {
  const out: string[] = [];
  const stack: DomNode[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push(nodes[i] as DomNode);
  let steps = 0;
  while (stack.length && steps++ < 200_000) {
    const n = stack.pop() as DomNode;
    if (n.type === 'text') {
      out.push(n.data ?? '');
      continue;
    }
    if (n.type !== 'tag') continue;
    const name = tagName(n);
    if (DROP_WITH_CONTENT.has(name)) continue;
    if (name === 'br') {
      out.push('\n');
      continue;
    }
    if (BLOCK_TAGS.has(name) || TABLE_CONTAINERS.has(name)) out.push(' ');
    const kids = n.children ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i] as DomNode);
  }
  return out.join('');
}

function collectInline(nodes: DomNode[], marks: Marks, out: Inline[], depth: number) {
  if (depth >= MAX_DEPTH) {
    const text = collapse(flattenText(nodes));
    if (text.trim()) out.push({ kind: 'text', text, ...marks });
    return;
  }
  for (const n of nodes) {
    if (n.type === 'text') {
      const text = collapse(n.data ?? '');
      if (text) out.push({ kind: 'text', text, ...marks });
      continue;
    }
    if (n.type !== 'tag') continue; // comments, cdata, script/style nodes
    const name = tagName(n);
    if (DROP_WITH_CONTENT.has(name)) continue;
    if (name === 'br') {
      out.push({ kind: 'break' });
      continue;
    }
    const next: Marks = { ...marks };
    if (name === 'strong' || name === 'b') next.bold = true;
    else if (name === 'em' || name === 'i') next.italic = true;
    else if (name === 'u') next.underline = true;
    else if (name === 's' || name === 'strike' || name === 'del') next.strike = true;
    else if (name === 'code') next.code = true;
    else if (name === 'a') {
      const href = normalizeUrl(n.attribs?.href);
      if (href) next.href = href;
    }
    collectInline(n.children ?? [], next, out, depth + 1);
  }
}

const isBlankInline = (children: Inline[]) =>
  children.every((c) => c.kind === 'break' || c.text.trim() === '');

function tidy(children: Inline[]): Inline[] {
  const out = children.slice();
  while (out.length && (out[0] as Inline).kind === 'break') out.shift();
  while (out.length && (out[out.length - 1] as Inline).kind === 'break') out.pop();
  const first = out[0];
  if (first && first.kind === 'text') first.text = first.text.replace(/^ +/, '');
  const last = out[out.length - 1];
  if (last && last.kind === 'text') last.text = last.text.replace(/ +$/, '');
  return out.filter((c) => c.kind === 'break' || c.text !== '');
}

function walkBlocks(nodes: DomNode[], depth: number, ctx: Ctx, limit: number): Block[] {
  const blocks: Block[] = [];
  let used = 0;
  /** Adds a leaf block if both the container budget and the document budget allow. */
  const add = (b: Block): boolean => {
    if (ctx.blocks >= ctx.maxBlocks || used >= limit) {
      ctx.truncated = true;
      return false;
    }
    ctx.blocks += 1;
    used += 1;
    blocks.push(b);
    return true;
  };
  /**
   * Containers are always kept when they hold something: their CHILDREN were
   * already budgeted, so the container itself never costs the content around it.
   */
  const addContainer = (b: Block) => {
    blocks.push(b);
  };
  const exhausted = () => used >= limit || ctx.blocks >= ctx.maxBlocks;

  if (depth >= MAX_DEPTH) {
    const text = collapse(flattenText(nodes)).trim();
    if (text) add({ kind: 'paragraph', children: [{ kind: 'text', text }] });
    return blocks;
  }

  const inner = (kids: DomNode[]) => walkBlocks(kids, depth + 1, ctx, Math.max(1, Math.min(limit - used, ctx.containerCap)));

  let run: DomNode[] = [];
  const flush = () => {
    if (!run.length) return;
    const inline: Inline[] = [];
    collectInline(run, {}, inline, depth + 1);
    const children = tidy(inline);
    if (!isBlankInline(children)) add({ kind: 'paragraph', children });
    run = [];
  };
  const inlineOf = (kids: DomNode[]) => {
    const inline: Inline[] = [];
    collectInline(kids, {}, inline, depth + 1);
    return tidy(inline);
  };

  for (const n of nodes) {
    if (exhausted()) {
      // This level is out of budget: keep what we have and flag it. A container's
      // own budget is separate, so LATER siblings of that container still render.
      ctx.truncated = true;
      break;
    }
    const name = tagName(n);
    if (n.type === 'tag' && DROP_WITH_CONTENT.has(name)) continue;

    if (n.type === 'tag' && TABLE_CONTAINERS.has(name)) {
      flush();
      for (const b of inner(n.children ?? [])) addContainer(b);
      continue;
    }

    if (n.type !== 'tag' || !BLOCK_TAGS.has(name)) {
      // Unknown wrapper (span, section...) that contains blocks: unwrap it.
      if (n.type === 'tag' && !INLINE_TAGS.has(name)) {
        const hasBlock = (n.children ?? []).some((c) => BLOCK_TAGS.has(tagName(c)) || TABLE_CONTAINERS.has(tagName(c)));
        if (hasBlock) {
          flush();
          for (const b of inner(n.children ?? [])) addContainer(b);
          continue;
        }
      }
      run.push(n);
      continue;
    }

    flush();
    const kids = n.children ?? [];
    switch (name) {
      case 'p':
      case 'li':
      case 'td':
      case 'th': {
        const children = inlineOf(kids);
        if (!isBlankInline(children)) add({ kind: 'paragraph', children });
        break;
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const children = inlineOf(kids);
        if (!isBlankInline(children)) {
          const level = name === 'h1' || name === 'h2' ? 2 : name === 'h3' ? 3 : 4;
          add({ kind: 'heading', level, children });
        }
        break;
      }
      case 'div': {
        // A div is a block: its own inline content becomes a paragraph and any
        // blocks inside it are kept in order.
        for (const b of inner(kids)) addContainer(b);
        break;
      }
      case 'blockquote': {
        const blocksInside = inner(kids);
        if (blocksInside.length) addContainer({ kind: 'quote', children: blocksInside });
        break;
      }
      case 'ul':
      case 'ol': {
        const items: Block[][] = [];
        for (const li of kids) {
          if (tagName(li) !== 'li') continue;
          if (exhausted() || items.length >= ctx.containerCap) {
            ctx.truncated = true;
            break;
          }
          const itemBlocks = inner(li.children ?? []);
          if (itemBlocks.length) items.push(itemBlocks);
          used += 1; // a list item costs one unit of this level's budget
          ctx.blocks += 1;
        }
        if (items.length) addContainer({ kind: 'list', ordered: name === 'ol', items });
        break;
      }
      case 'pre': {
        const text = flattenText(kids).replace(/^\n+|\n+$/g, '');
        if (text.trim()) add({ kind: 'code', text });
        break;
      }
    }
  }
  flush();
  return blocks;
}

/* ── HTML detection (linear) ─────────────────────────────────────────────── */

/**
 * Tags whose presence means "this is HTML". Deliberately only real tags that
 * the editor emits; a bare `a<b and c>d` is plain text, not markup.
 */
const DETECT_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ul', 'ol', 'li', 'a', 'blockquote', 'code',
  'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
]);

const isAlnum = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isWs = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

/**
 * Single left-to-right pass. A `<` or `</` + a whitelisted tag name counts as
 * HTML only if it is shaped like a tag: the name is followed directly by `>`
 * or `/>`, or by whitespace and an attribute list that contains `=` (or is
 * empty) before the closing `>`. So `<b>x</b>` and `<a href="..">` are HTML,
 * while `a<b and c>d` (no `=`) is plain text. Each `<` is checked within a
 * bounded window, so the total work stays linear.
 */
export function looksLikeHtml(input: string): boolean {
  const WINDOW = 200;
  let i = input.indexOf('<');
  while (i !== -1) {
    let j = i + 1;
    const closing = input.charCodeAt(j) === 47; // '/'
    if (closing) j += 1;
    const start = j;
    while (j < input.length && j - start < 12 && isAlnum(input.charCodeAt(j))) j += 1;
    if (j > start && DETECT_TAGS.has(input.slice(start, j).toLowerCase())) {
      const next = input.charCodeAt(j);
      if (next === 62) return true; // <b>
      if (next === 47 && input.charCodeAt(j + 1) === 62) return true; // <br/>
      if (isWs(next)) {
        const end = Math.min(input.length, j + WINDOW);
        let k = j;
        let hasEq = false;
        while (k < end && input.charCodeAt(k) !== 62 && input.charCodeAt(k) !== 60) {
          if (input.charCodeAt(k) === 61) hasEq = true;
          k += 1;
        }
        if (k < end && input.charCodeAt(k) === 62) {
          // `<p >`, `<br />` (only whitespace or "/") or an attribute list with "="
          const inner = input.slice(j, k);
          if (hasEq || inner.trim() === '' || inner.trim() === '/') return true;
        }
      }
    }
    i = input.indexOf('<', i + 1);
  }
  return input.includes('<!--');
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export interface RichTextResult {
  blocks: Block[];
  /** Input was cut at maxChars or the block cap was hit. */
  truncated: boolean;
}

/** Plain text path: never run through the HTML parser, so `a<b and c>d` survives. */
function parsePlain(input: string): Block[] {
  const escaped = input.replace(/</g, '&lt;');
  const doc = parseDocument(escaped) as unknown as DomNode;
  const text = flattenText(doc.children ?? []).replace(/ /g, ' ').trim();
  return text ? [{ kind: 'paragraph', children: [{ kind: 'text', text }] }] : [];
}

export function parseRichTextEx(
  input: string | null | undefined,
  opts: { maxChars?: number; maxBlocks?: number } = {},
): RichTextResult {
  if (!input || !input.trim()) return { blocks: [], truncated: false };
  const maxChars = Math.min(opts.maxChars ?? MAX_INPUT_CHARS, MAX_INPUT_CHARS);
  const cut = input.length > maxChars;
  const text = cut ? input.slice(0, maxChars) : input;

  if (!looksLikeHtml(text)) return { blocks: parsePlain(text), truncated: cut };

  const doc = parseDocument(text) as unknown as DomNode;
  const maxBlocks = Math.min(opts.maxBlocks ?? MAX_BLOCKS, MAX_BLOCKS);
  const ctx: Ctx = { blocks: 0, truncated: false, maxBlocks, containerCap: Math.max(1, Math.floor(maxBlocks / 4)) };
  const blocks = walkBlocks(doc.children ?? [], 0, ctx, maxBlocks);
  return { blocks, truncated: cut || ctx.truncated };
}

/**
 * Parses stored HTML (or plain text) into safe blocks. Empty content
 * (including '<p>&nbsp;</p>') yields []. Plain text keeps its newlines.
 */
export const parseRichText = (input: string | null | undefined, opts?: { maxChars?: number; maxBlocks?: number }): Block[] =>
  parseRichTextEx(input, opts).blocks;

/** Flattens blocks to text (previews, accessibility labels, tests). */
export function blocksToPlainText(blocks: readonly Block[]): string {
  const inline = (c: readonly Inline[]) => c.map((i) => (i.kind === 'break' ? '\n' : i.text)).join('');
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'paragraph':
        case 'heading':
          return inline(b.children);
        case 'quote':
          return blocksToPlainText(b.children);
        case 'list':
          return b.items.map((it) => blocksToPlainText(it)).join('\n');
        case 'code':
          return b.text;
      }
    })
    .join('\n');
}
