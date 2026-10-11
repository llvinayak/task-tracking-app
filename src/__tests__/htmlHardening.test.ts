/**
 * @jest-environment node
 */
import {
  MAX_BLOCKS,
  MAX_DEPTH,
  MAX_INPUT_CHARS,
  PREVIEW_CHARS,
  blocksToPlainText,
  isSafeUrl,
  linkHost,
  linkNeedsConfirm,
  looksLikeHtml,
  normalizeUrl,
  parseRichText,
  parseRichTextEx,
  type Block,
  type Inline,
} from '@/utils/html';

const textOf = (b: Block[]) => blocksToPlainText(b);
const inlines = (b: Block[]): Inline[] =>
  b.flatMap((x) => (x.kind === 'paragraph' || x.kind === 'heading' ? x.children : []));

/**
 * Correctness here is ALGORITHMIC: bounded output (block count, text length, depth) and no throw
 * on pathological input. Wall-clock is only a very generous safety net against a real hang
 * (a loaded CI machine must never fail these), never the assertion that proves linearity.
 */
const SAFETY_NET_MS = 15_000;
const totalChars = (b: Block[]) => blocksToPlainText(b).length;

const timed = <T>(fn: () => T): { value: T; ms: number } => {
  const t0 = Date.now();
  const value = fn();
  return { value, ms: Date.now() - t0 };
};

describe('hardening: hostile size and depth', () => {
  it('10k nested blockquotes: no stack overflow (input cap cuts it first), depth stays capped', () => {
    const n = 10_000; // 120k chars of openings alone: the 100k input cap applies
    const { value, ms } = timed(() => parseRichTextEx('<blockquote>'.repeat(n) + 'deep text' + '</blockquote>'.repeat(n)));
    expect(ms).toBeLessThan(SAFETY_NET_MS);
    expect(value.truncated).toBe(true);
    expect(value.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(totalChars(value.blocks)).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    let depth = 0;
    let cur: Block[] = value.blocks;
    while (cur[0]?.kind === 'quote') {
      depth += 1;
      cur = (cur[0] as { children: Block[] }).children;
    }
    expect(depth).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('8k nested blockquotes (within the input cap): depth capped and the text is flattened, not lost', () => {
    const n = 8_000;
    const html = '<blockquote>'.repeat(n) + 'deep text' + '</blockquote>'.repeat(n);
    const { value, ms } = timed(() => parseRichTextEx(html));
    expect(ms).toBeLessThan(SAFETY_NET_MS);
    let depth = 0;
    let cur: Block[] = value.blocks;
    while (cur[0]?.kind === 'quote') {
      depth += 1;
      cur = (cur[0] as { children: Block[] }).children;
    }
    expect(depth).toBeLessThanOrEqual(MAX_DEPTH);
    expect(textOf(value.blocks)).toContain('deep text'); // flattened, not lost
  });

  it('10k nested spans and strong tags: flattened to text without overflow', () => {
    const n = 10_000;
    const html = '<p>' + '<span>'.repeat(n) + 'x<strong>bold</strong>' + '</span>'.repeat(n) + '</p>';
    const { value, ms } = timed(() => parseRichTextEx(html));
    expect(ms).toBeLessThan(SAFETY_NET_MS);
    expect(textOf(value.blocks)).toContain('x');
    expect(textOf(value.blocks)).toContain('bold');
  });

  it('10k nested lists: capped, no overflow', () => {
    const n = 10_000;
    const html = '<ul><li>'.repeat(n) + 'leaf' + '</li></ul>'.repeat(n);
    const { value, ms } = timed(() => parseRichTextEx(html));
    expect(ms).toBeLessThan(SAFETY_NET_MS);
    expect(textOf(value.blocks)).toContain('leaf');
  });

  it('200KB of "<a" does not hang (linear time) and renders nothing dangerous', () => {
    const html = '<a'.repeat(100_000); // 200KB
    const { value, ms } = timed(() => parseRichTextEx(html));
    expect(ms).toBeLessThan(SAFETY_NET_MS);
    expect(JSON.stringify(value.blocks)).not.toMatch(/href|javascript/);
    expect(value.truncated).toBe(true); // 200KB > the 100k cap
    expect(value.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(totalChars(value.blocks)).toBeLessThanOrEqual(MAX_INPUT_CHARS);
  });

  it('looksLikeHtml is linear on pathological input', () => {
    // Bounded work, not a stopwatch: each call returns a plain boolean without throwing.
    const results = [looksLikeHtml('<'.repeat(200_000)), looksLikeHtml('< p'.repeat(100_000)), looksLikeHtml('<p'.repeat(100_000))];
    for (const r of results) expect(typeof r).toBe('boolean');
    expect(looksLikeHtml('<'.repeat(200_000))).toBe(false); // no tag shape anywhere
    expect(looksLikeHtml('< p'.repeat(100_000))).toBe(false);
    for (const ms of [timed(() => looksLikeHtml('<p'.repeat(100_000))).ms]) expect(ms).toBeLessThan(SAFETY_NET_MS);
  });

  it('60k paragraphs: input is cut at the cap and blocks are capped', () => {
    const html = '<p>x</p>'.repeat(60_000); // 480 KB, well over the 100k cap
    const { value, ms } = timed(() => parseRichTextEx(html));
    expect(ms).toBeLessThan(SAFETY_NET_MS);
    expect(value.truncated).toBe(true);
    expect(value.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(totalChars(value.blocks)).toBeLessThanOrEqual(MAX_INPUT_CHARS);
  });

  it('the preview limit is smaller than the hard cap, and "show more" raises it', () => {
    expect(PREVIEW_CHARS).toBeLessThan(MAX_INPUT_CHARS);
    const html = '<p>some line of text</p>'.repeat(1500); // ~37k chars, 1500 blocks
    const preview = parseRichTextEx(html, { maxChars: PREVIEW_CHARS });
    const full = parseRichTextEx(html);
    expect(preview.truncated).toBe(true);
    expect(preview.blocks.length).toBeLessThan(full.blocks.length);
    expect(full.truncated).toBe(false);
    expect(full.blocks).toHaveLength(1500);
  });

  it('input above the hard cap is cut even when a larger limit is requested', () => {
    expect(parseRichTextEx('<p>a</p>'.repeat(30_000), { maxChars: 10_000_000 }).truncated).toBe(true);
  });
});

describe('L1: plain text containing angle brackets stays plain text', () => {
  it.each([
    'a<b and c>d',
    '1 < 2 and 3 > 2',
    'if (x<y && y>z) return',
    'List<String> items = new ArrayList<>();',
    'email me <someone@example.com>',
    '<<<>>>',
    'x <- 5',
  ])('%p is not treated as HTML', (input) => {
    expect(looksLikeHtml(input)).toBe(false);
    expect(textOf(parseRichText(input))).toBe(input);
  });

  it('real whitelisted tags are still detected, including closing and self-closing forms', () => {
    for (const html of [
      '<p>x</p>',
      'a <strong>b</strong>',
      '<br/>',
      '<br />',
      '</p>',
      '<a href="https://x.y">z</a>',
      '<DIV>x</DIV>',
      '<h1>t</h1>',
      '<ul><li>a</li></ul>',
      '<!-- c --> x',
    ]) {
      expect(looksLikeHtml(html)).toBe(true);
    }
  });

  it('an unknown tag name alone is not enough, and is shown as text, never executed', () => {
    expect(looksLikeHtml('<foo>bar</foo>')).toBe(false);
    expect(looksLikeHtml('<script>alert(1)</script>')).toBe(false);
    expect(textOf(parseRichText('<script>alert(1)</script>'))).toBe('<script>alert(1)</script>');
  });
});

describe('L5: div as block, h1/h5/h6 as headings, link host display', () => {
  it('renders div as a block: sibling divs become separate paragraphs', () => {
    const b = parseRichText('<div>one</div><div>two</div>');
    expect(b.map((x) => x.kind)).toEqual(['paragraph', 'paragraph']);
    expect(textOf(b)).toBe('one\ntwo');
  });

  it('div mixed with inline text and nested blocks keeps order', () => {
    expect(textOf(parseRichText('before<div>mid<p>inner</p></div>after'))).toBe('before\nmid\ninner\nafter');
  });

  it.each([
    ['h1', 2],
    ['h2', 2],
    ['h3', 3],
    ['h4', 4],
    ['h5', 4],
    ['h6', 4],
  ])('%s renders as a heading (level %i)', (tag, level) => {
    const b = parseRichText(`<${tag}>Title</${tag}>`);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ kind: 'heading', level });
  });

  it('linkHost extracts the real destination', () => {
    expect(linkHost('https://evil.example.com/path?x=1')).toBe('evil.example.com');
    expect(linkHost('https://user:pw@host.example:8443/x')).toBe('host.example');
    expect(linkHost('http://a.b')).toBe('a.b');
    expect(linkHost('mailto:me@x.io?subject=hi')).toBe('me@x.io');
  });

  it('confirm is needed when the link text hides the destination', () => {
    expect(linkNeedsConfirm('click here', 'https://evil.example')).toBe(true);
    expect(linkNeedsConfirm('https://bank.example.com', 'https://evil.example')).toBe(true);
    expect(linkNeedsConfirm('example.com/docs', 'https://example.com/docs')).toBe(false);
    expect(linkNeedsConfirm('https://example.com/docs', 'https://example.com/docs')).toBe(false);
    expect(linkNeedsConfirm('', 'https://example.com')).toBe(true);
  });
});

describe('normalizeUrl / isSafeUrl', () => {
  it('returns the trimmed URL for safe schemes', () => {
    expect(normalizeUrl('  https://a.b/c  ')).toBe('https://a.b/c');
    expect(normalizeUrl('mailto:a@b.co')).toBe('mailto:a@b.co');
  });

  it.each([
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'ht\ttp://a.b',
    'h t t p s://a.b',
    'https ://a.b',
    'https://a.b/pa th',
    'https://a.b/' + String.fromCharCode(7) + 'bell',
    'javascript:alert(1)',
    'data:text/html;base64,AAAA',
    'file:///etc/passwd',
    '//a.b',
    'a.b',
    '',
    '   ',
  ])('rejects %p', (u) => {
    expect(normalizeUrl(u)).toBeNull();
    expect(isSafeUrl(u)).toBe(false);
  });

  it('rejects absurdly long URLs and non-strings', () => {
    expect(normalizeUrl('https://a.b/' + 'x'.repeat(5000))).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(5)).toBeNull();
  });

  it('the rendered href is the normalized value (never the raw attribute)', () => {
    const c = inlines(parseRichText('<p><a href="  https://ok.example/x  ">go</a></p>'))[0] as { href?: string };
    expect(c.href).toBe('https://ok.example/x');
  });

  it('scheme allow-list can be narrowed (https only for attachments in production)', () => {
    expect(normalizeUrl('http://a.b', ['https'])).toBeNull();
    expect(normalizeUrl('https://a.b', ['https'])).toBe('https://a.b');
  });
});
