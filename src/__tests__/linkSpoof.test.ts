import { isSafeUrl, linkHasUserinfo, linkHost, linkNeedsConfirm, normalizeUrl } from '@/utils/html';

const BS = String.fromCharCode(92); // a single backslash

describe('H1: backslash / userinfo / invisible-character link spoofing', () => {
  it.each([
    `https://evil.com${BS}@good.com`,
    `http://evil.com${BS}.good.com`,
    `https://good.com${BS}.evil.com/path`,
    `http://good.com/ok${BS}x`,
  ])('rejects http(s) URL with a backslash: %s', (u) => {
    expect(normalizeUrl(u)).toBeNull();
    expect(isSafeUrl(u)).toBe(false);
    // even if some caller skips normalizeUrl, the confirm check says yes
    expect(linkNeedsConfirm('good.com', u)).toBe(true);
  });

  it('linkHost reads the host the way a WHATWG parser does', () => {
    expect(linkHost(`https://evil.com${BS}@good.com`)).toBe('evil.com');
    expect(linkHost(`http://evil.com${BS}.good.com`)).toBe('evil.com');
    expect(linkHost('https://good.com@evil.com/x')).toBe('evil.com');
    expect(linkHost('https://a@b@evil.com')).toBe('evil.com');
    expect(linkHost('https://user:pw@evil.com:8443/x')).toBe('evil.com');
    expect(linkHost('mailto:me@x.io?subject=hi')).toBe('me@x.io');
  });

  it('userinfo always confirms, even when the text names the real host', () => {
    expect(linkHasUserinfo('https://good.com@evil.com')).toBe(true);
    expect(linkHasUserinfo('https://good.com/@x')).toBe(false);
    expect(linkNeedsConfirm('evil.com', 'https://good.com@evil.com')).toBe(true);
    expect(linkNeedsConfirm('https://evil.com', 'https://user@evil.com')).toBe(true);
    expect(linkNeedsConfirm('good.com', 'https://good.com/@x')).toBe(false);
  });

  it.each([
    ['ZWSP', 0x200b], ['ZWNJ', 0x200c], ['ZWJ', 0x200d], ['LRM', 0x200e], ['RLM', 0x200f],
    ['LRE', 0x202a], ['RLO', 0x202e], ['WORD JOINER', 0x2060], ['BOM', 0xfeff], ['LRI', 0x2066], ['SHY', 0xad],
  ])('rejects %s inside a URL', (_n, code) => {
    const ch = String.fromCharCode(code);
    expect(normalizeUrl(`https://good${ch}.com/x`)).toBeNull();
    expect(normalizeUrl(`https://good.com/${ch}a`)).toBeNull();
    expect(normalizeUrl(`htt${ch}ps://good.com`)).toBeNull();
  });

  it('public-suffix lookalikes confirm; ordinary parent domains and equal hosts do not', () => {
    expect(linkNeedsConfirm('co.uk', 'https://evil.co.uk')).toBe(true);
    expect(linkNeedsConfirm('com.au', 'https://evil.com.au')).toBe(true);
    expect(linkNeedsConfirm('github.io', 'https://evil.github.io')).toBe(true);
    expect(linkNeedsConfirm('example.co.uk', 'https://docs.example.co.uk')).toBe(false);
    expect(linkNeedsConfirm('example.com', 'https://docs.example.com')).toBe(false);
    expect(linkNeedsConfirm('www.example.com', 'https://example.com/a')).toBe(false);
    expect(linkNeedsConfirm('example.com', 'https://example.com.evil.io')).toBe(true);
  });

  it('text with a backslash never vouches for a link', () => {
    expect(linkNeedsConfirm(`good.com${BS}x`, 'https://good.com')).toBe(true);
  });

  it('flags a scheme downgrade (text https://, link http://)', () => {
    expect(linkNeedsConfirm('https://example.com', 'http://example.com')).toBe(true);
    expect(linkNeedsConfirm('HTTPS://example.com/a', 'http://example.com/a')).toBe(true);
    expect(linkNeedsConfirm('https://example.com', 'https://example.com')).toBe(false);
    expect(linkNeedsConfirm('http://example.com', 'http://example.com')).toBe(false);
    expect(linkNeedsConfirm('example.com', 'http://example.com')).toBe(false); // no scheme promised
  });

  it.each([
    ['pp.ua', 'https://evil.pp.ua'],
    ['amazonaws.com', 'https://evil.amazonaws.com'],
    ['s3.amazonaws.com', 'https://bucket.s3.amazonaws.com'],
    ['cloudfront.net', 'https://evil.cloudfront.net'],
    ['azurewebsites.net', 'https://evil.azurewebsites.net'],
    ['vercel.app', 'https://evil.vercel.app'],
    ['netlify.app', 'https://evil.netlify.app'],
    ['pages.dev', 'https://evil.pages.dev'],
    ['web.app', 'https://evil.web.app'],
    ['firebaseapp.com', 'https://evil.firebaseapp.com'],
  ])('shared host %s does not vouch for a tenant: %s confirms', (text, href) => {
    expect(linkNeedsConfirm(text, href)).toBe(true);
  });

  it('a tenant that names itself exactly does not confirm', () => {
    expect(linkNeedsConfirm('app.vercel.app', 'https://app.vercel.app/x')).toBe(false);
  });
});
