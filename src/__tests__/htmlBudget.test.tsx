import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import { RichText } from '@/components/RichText';
import { renderWithProviders } from '@/test/testUtils';
import {
  MAX_BLOCKS,
  PREVIEW_BLOCKS,
  blocksToPlainText,
  isIdnLike,
  linkNeedsConfirm,
  looksLikeHtml,
  parseRichText,
  parseRichTextEx,
  type Block,
} from '@/utils/html';

const text = (b: Block[]) => blocksToPlainText(b);

describe('M3-12: any whitelisted tag alone is HTML', () => {
  it.each(['<b>x</b>', '<i>x</i>', 'see <strong>this</strong>', '<em class="x">y</em>', '<u>u</u>', '<s>s</s>', '<code>c</code>', '<span>s</span>', '<td>x</td>'])(
    '%s is detected',
    (html) => {
      expect(looksLikeHtml(html)).toBe(true);
    },
  );

  it('but prose with angle brackets stays plain text', () => {
    for (const plain of ['a<b and c>d', 'x<i and y>z', 'if a<b then c>d', 'List<String>', '<3 you']) {
      expect(looksLikeHtml(plain)).toBe(false);
      expect(text(parseRichText(plain))).toBe(plain);
    }
  });

  it('bold and italic aliases render with their marks', () => {
    const inline = (parseRichText('<p><b>bold</b> <i>it</i></p>')[0] as { children: { kind: string; bold?: boolean; italic?: boolean; text?: string }[] }).children;
    expect(inline.find((c) => c.text === 'bold')).toMatchObject({ bold: true });
    expect(inline.find((c) => c.text === 'it')).toMatchObject({ italic: true });
  });

  it('tables flatten to text blocks, one per cell, order preserved, content after the table kept', () => {
    const html =
      '<table><thead><tr><th>Head</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table><p>after</p>';
    const blocks = parseRichText(html);
    expect(text(blocks)).toBe('Head\nA\nB\nC\nD\nafter');
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('table cells with rich content keep their text; nested tables do not crash', () => {
    expect(text(parseRichText('<table><tr><td><strong>x</strong> y<table><tr><td>inner</td></tr></table></td></tr></table>'))).toContain('inner');
  });
});

describe('M3-13: a container over the block budget degrades gracefully', () => {
  const lis = (n: number) => '<li>item</li>'.repeat(n);

  it('a huge list is truncated INSIDE the list: the list and the content after it survive', () => {
    const r = parseRichTextEx(`<p>before</p><ul>${lis(3000)}</ul><p>later</p>`, {});
    expect(r.truncated).toBe(true);
    const kinds = r.blocks.map((b) => b.kind);
    expect(kinds[0]).toBe('paragraph');
    expect(kinds).toContain('list');
    expect(text(r.blocks).endsWith('later')).toBe(true); // content AFTER the container is not lost
    const list = r.blocks.find((b) => b.kind === 'list') as { items: unknown[] };
    expect(list.items.length).toBeLessThan(3000);
    expect(list.items.length).toBeGreaterThan(0);
  });

  it('a huge div / blockquote keeps later siblings', () => {
    const many = '<p>x</p>'.repeat(1500);
    for (const wrap of ['div', 'blockquote']) {
      const r = parseRichTextEx(`<${wrap}>${many}</${wrap}><p>tail</p>`, {});
      expect(r.truncated).toBe(true);
      expect(text(r.blocks).endsWith('tail')).toBe(true);
    }
  });

  it('the document budget still bounds total work', () => {
    const r = parseRichTextEx('<p>x</p>'.repeat(5000), {});
    expect(r.truncated).toBe(true);
    expect(r.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
  });

  it('a smaller preview budget truncates sooner than the full one', () => {
    const html = '<p>line of text</p>'.repeat(1000);
    const preview = parseRichTextEx(html, { maxBlocks: PREVIEW_BLOCKS });
    const full = parseRichTextEx(html, {});
    expect(preview.truncated).toBe(true);
    expect(preview.blocks.length).toBeLessThanOrEqual(PREVIEW_BLOCKS);
    expect(full.truncated).toBe(false);
    expect(full.blocks).toHaveLength(1000);
  });

  it('RichText shows a preview with "Show more", and expands on press', () => {
    const html = Array.from({ length: 800 }, (_, i) => `<p>row ${i}</p>`).join('');
    renderWithProviders(<RichText html={html} />);
    expect(screen.getByText('row 0')).toBeTruthy();
    expect(screen.queryByText('row 700')).toBeNull(); // beyond the preview budget
    fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText('row 700')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('when even the full view is cut, it says so instead of hiding it', () => {
    const html = '<p>x</p>'.repeat(3000);
    renderWithProviders(<RichText html={html} />);
    fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByTestId('rich-text-truncated')).toBeTruthy();
  });
});

describe('M3-03: link text vs real host', () => {
  it.each([
    // [visible text, href, needs confirm]
    ['https://example.com/docs', 'https://example.com/docs', false],
    ['example.com', 'https://example.com', false],
    ['www.example.com', 'https://example.com/a', false], // www is stripped on both sides
    ['example.com', 'https://www.example.com/a', false],
    ['example.com', 'https://docs.example.com/a', false], // parent domain on a label boundary
    ['EXAMPLE.COM', 'https://example.com', false],
    ['example.com:8443/x', 'https://example.com:8443/x', false],
    // Never substring: these all USED to be accepted.
    ['box.com', 'https://x.co', true],
    ['x.co', 'https://box.com', true], // "x.co" is a substring of "box.com"
    ['bank.com', 'https://bank.com.evil.io/login', true],
    ['bank.com', 'https://notbank.com', true],
    ['login.bank.com', 'https://bank.com', true], // text claims a subdomain it is not
    ['https://bank.com', 'https://evil.io', true],
    ['https://example.com@evil.io/', 'https://evil.io/', true],
    // Plain words never vouch for a destination: show the host and ask.
    ['click here', 'https://example.com', true],
    ['', 'https://example.com', true],
    ['read the docs', 'https://example.com/docs', true],
  ])('text %p -> %s : confirm=%s', (label, href, expected) => {
    expect(linkNeedsConfirm(label, href)).toBe(expected);
  });

  it('IDN / punycode look-alikes always confirm, even when the text matches', () => {
    const cyr = 'pаypal.com'; // Cyrillic "a"
    expect(isIdnLike(cyr)).toBe(true);
    expect(isIdnLike('xn--pypal-4ve.com')).toBe(true);
    expect(isIdnLike('paypal.com')).toBe(false);
    expect(linkNeedsConfirm(cyr, `https://${cyr}`)).toBe(true);
    expect(linkNeedsConfirm('paypal.com', `https://${cyr}`)).toBe(true);
    expect(linkNeedsConfirm('paypal.com', 'https://xn--pypal-4ve.com')).toBe(true);
    expect(linkNeedsConfirm(cyr, 'https://paypal.com')).toBe(true);
  });

  it('mail links compare the mailbox', () => {
    expect(linkNeedsConfirm('me@x.io', 'mailto:me@x.io')).toBe(true); // not a host-looking text: ask (cheap and safe)
  });
});
