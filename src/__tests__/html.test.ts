import { blocksToPlainText, isSafeUrl, parseRichText, type Block, type Inline } from '@/utils/html';

const textOf = (b: Block[]) => blocksToPlainText(b);
const inlines = (b: Block[]): Inline[] =>
  b.flatMap((x) => (x.kind === 'paragraph' || x.kind === 'heading' ? x.children : []));

describe('parseRichText whitelist', () => {
  it('renders allowed formatting', () => {
    const b = parseRichText('<p>Hello <strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <code>c</code></p>');
    const t = inlines(b);
    expect(t.find((i) => i.kind === 'text' && i.text === 'bold')).toMatchObject({ bold: true });
    expect(t.find((i) => i.kind === 'text' && i.text === 'it')).toMatchObject({ italic: true });
    expect(t.find((i) => i.kind === 'text' && i.text === 'u')).toMatchObject({ underline: true });
    expect(t.find((i) => i.kind === 'text' && i.text === 's')).toMatchObject({ strike: true });
    expect(t.find((i) => i.kind === 'text' && i.text === 'c')).toMatchObject({ code: true });
  });

  it('supports headings, lists, blockquote and pre', () => {
    const b = parseRichText(
      '<h2>Title</h2><ul><li>a</li><li>b</li></ul><ol><li>1</li></ol><blockquote><p>q</p></blockquote><pre>x = 1\ny = 2</pre><h3>h3</h3><h4>h4</h4>',
    );
    expect(b.map((x) => x.kind)).toEqual(['heading', 'list', 'list', 'quote', 'code', 'heading', 'heading']);
    expect(b[1]).toMatchObject({ kind: 'list', ordered: false });
    expect(b[2]).toMatchObject({ kind: 'list', ordered: true });
    expect(b[4]).toMatchObject({ kind: 'code', text: 'x = 1\ny = 2' });
  });

  it('drops script and style WITH their content', () => {
    const b = parseRichText('<p>safe</p><script>alert(1)</script><style>p{color:red}</style><p>after</p>');
    expect(textOf(b)).toBe('safe\nafter');
  });

  it('drops images, iframes, forms and their attributes entirely', () => {
    const b = parseRichText(
      '<p>a<img src="http://x/y.png" onerror="alert(1)">b</p><iframe src="http://evil"></iframe><form><input value="z"></form>',
    );
    expect(textOf(b)).toBe('ab');
    expect(JSON.stringify(b)).not.toMatch(/img|src|onerror|iframe|evil/);
  });

  it('strips styles, classes, event handlers and unknown attributes', () => {
    const b = parseRichText('<p style="color:red" class="x" onclick="alert(1)" data-a="1">hi</p>');
    expect(JSON.stringify(b)).not.toMatch(/style|class|onclick|data-a|color/);
    expect(textOf(b)).toBe('hi');
  });

  it('unwraps harmless unknown wrappers but keeps their text', () => {
    expect(textOf(parseRichText('<div><span>keep</span> me</div>'))).toBe('keep me');
    expect(textOf(parseRichText('<div><p>one</p><p>two</p></div>'))).toBe('one\ntwo');
  });

  it('keeps http, https and mailto links only', () => {
    const link = (href: string) =>
      inlines(parseRichText(`<p><a href="${href}">go</a></p>`)).find((i) => i.kind === 'text') as {
        href?: string;
        text: string;
      };
    expect(link('https://example.com/a?b=1').href).toBe('https://example.com/a?b=1');
    expect(link('http://example.com').href).toBe('http://example.com');
    expect(link('mailto:a@b.co').href).toBe('mailto:a@b.co');
    const bad = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java&#9;script:alert(1)',
      'data:text/html;base64,AAAA',
      'vbscript:x',
      'file:///etc/passwd',
      '//evil.com',
      '/relative',
      'tel:123',
    ];
    for (const b of bad) {
      const l = link(b);
      expect(l.href).toBeUndefined();
      expect(l.text).toBe('go'); // text kept, link dropped
    }
  });

  it('isSafeUrl handles control characters and non-strings', () => {
    expect(isSafeUrl('https://a.b')).toBe(true);
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false);
    expect(isSafeUrl('\u0000javascript:alert(1)')).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl('https://a.b', ['https'])).toBe(true);
    expect(isSafeUrl('http://a.b', ['https'])).toBe(false);
  });

  it('decodes entities', () => {
    expect(textOf(parseRichText('<p>Tom &amp; Jerry &lt;3 &quot;quoted&quot; &#169; &nbsp;x</p>'))).toBe(
      'Tom & Jerry <3 "quoted" © x',
    );
  });

  it('falls back to plain text (entities decoded, newlines preserved)', () => {
    const b = parseRichText('Line one\nLine two &amp; more');
    expect(b).toHaveLength(1);
    expect(textOf(b)).toBe('Line one\nLine two & more');
  });

  it.each([[''], ['   '], [null], [undefined], ['<p>&nbsp;</p>'], ['<p> </p><p><br></p>'], ['<p>&nbsp;</p><p>&nbsp;</p>']])(
    'treats %p as empty',
    (v) => {
      expect(parseRichText(v as string | null | undefined)).toEqual([]);
    },
  );

  it('keeps comparison characters in plain text', () => {
    expect(textOf(parseRichText('1 < 2 and 3 > 2'))).toBe('1 < 2 and 3 > 2');
  });

  it('keeps <br> as a break inside a paragraph', () => {
    const c = inlines(parseRichText('<p>a<br>b</p>'));
    expect(c.map((i) => i.kind)).toEqual(['text', 'break', 'text']);
  });
});
