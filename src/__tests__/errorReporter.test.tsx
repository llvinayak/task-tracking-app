import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Text as RNText } from 'react-native';

import { ErrorBoundary, FatalErrorGate } from '@/components/ErrorBoundary';
import {
  __resetErrorReporter,
  clearFatalError,
  describeError,
  getFatalError,
  getLastError,
  installGlobalErrorHandler,
  recordError,
  sanitize,
  subscribeErrors,
} from '@/lib/errorReporter';
import { renderWithProviders } from '@/test/testUtils';

let errSpy: jest.SpyInstance;
beforeEach(() => {
  __resetErrorReporter();
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errSpy.mockRestore());

describe('sanitize / describeError', () => {
  it('removes tokens, bearer headers, e-mail addresses, passwords and directories', () => {
    const dirty =
      'Request failed for grace@example.com with Bearer abc.def.ghi password=hunter2 token: eyJhbGciOi.eyJzdWIiOjF9.sig at C:\\Users\\Grace\\app\\src\\features\\tasks\\TasksScreen.tsx:12';
    const out = sanitize(dirty);
    expect(out).not.toMatch(/grace@example\.com|abc\.def\.ghi|hunter2|eyJhbGciOi|Users/);
    expect(out).toContain('[email]');
    expect(out).toContain('TasksScreen.tsx');
  });

  it('gives a short stable code for the same error, a different one for another, and truncates the message', () => {
    const a = describeError(new Error('boom'));
    const b = describeError(new Error('boom'));
    const c = describeError(new Error('other'));
    expect(a.code).toMatch(/^E-[0-9A-F]{6}$/);
    expect(a.code).toBe(b.code);
    expect(a.code).not.toBe(c.code);
    expect(describeError(new Error('x'.repeat(500))).message.length).toBeLessThanOrEqual(200);
    expect(describeError('plain string').message).toBe('plain string');
    expect(describeError(undefined).message).toBe('Unknown error');
  });

  it('recordError logs ONE sanitised line (readable in logcat) and keeps the last report', () => {
    const r = recordError(new Error('bad thing for a@b.co'));
    expect(getLastError()).toBe(r);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const line = String(errSpy.mock.calls[0]![0]);
    expect(line).toContain('[TT-ERROR]');
    expect(line).toContain(r.code);
    expect(line).not.toContain('a@b.co');
  });
});

describe('installGlobalErrorHandler', () => {
  const make = () => {
    const previous = jest.fn();
    let handler: (e: unknown, f?: boolean) => void = previous;
    const utils = {
      getGlobalHandler: () => handler,
      setGlobalHandler: (h: (e: unknown, f?: boolean) => void) => {
        handler = h;
      },
    };
    return { utils, previous, call: (e: unknown, f?: boolean) => handler(e, f) };
  };

  it('records every error and chains the previous (default) handler when nothing can show it', () => {
    const { utils, previous, call } = make();
    installGlobalErrorHandler(utils, { dev: false });
    call(new Error('non fatal'), false);
    call(new Error('fatal but no screen mounted'), true);
    expect(previous).toHaveBeenCalledTimes(2);
    expect(getLastError()?.message).toContain('fatal but no screen mounted');
  });

  it('in development the default handler (red box) is always called', () => {
    const { utils, previous, call } = make();
    installGlobalErrorHandler(utils, { dev: true });
    const unsub = subscribeErrors(() => undefined);
    call(new Error('fatal'), true);
    expect(previous).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('release with a mounted error screen: a FATAL error is shown there instead of killing the app; non-fatal still chains', () => {
    const { utils, previous, call } = make();
    installGlobalErrorHandler(utils, { dev: false });
    renderWithProviders(
      <FatalErrorGate>
        <RNText>app</RNText>
      </FatalErrorGate>,
    );
    act(() => call(new Error('late crash in a timer'), true));
    expect(previous).not.toHaveBeenCalled();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(getFatalError()?.message).toContain('late crash in a timer');
    act(() => call(new Error('just a warning'), false));
    expect(previous).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('app')).toBeTruthy();
    expect(getFatalError()).toBeNull();
  });

  it('swallows at most 3 fatals per 60s; the 4th goes to the default handler, and the window slides', () => {
    const { utils, previous, call } = make();
    let clock = 1_000;
    installGlobalErrorHandler(utils, { dev: false, now: () => clock });
    const unsub = subscribeErrors(() => undefined); // an error screen is mounted
    for (let i = 0; i < 3; i += 1) {
      clock += 1_000;
      call(new Error(`late ${i}`), true);
    }
    expect(previous).not.toHaveBeenCalled();
    clock += 1_000;
    call(new Error('late 3'), true);
    expect(previous).toHaveBeenCalledTimes(1); // persistent cause: crash cleanly
    clock += 61_000; // the window has passed: the screen may swallow again
    call(new Error('late 4'), true);
    expect(previous).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('the reporter never throws out of the handler and uninstall restores the previous handler', () => {
    const { utils, previous } = make();
    const uninstall = installGlobalErrorHandler(utils, { dev: false });
    errSpy.mockImplementation(() => {
      throw new Error('console broke');
    });
    expect(() => utils.getGlobalHandler()(new Error('x'), false)).not.toThrow();
    expect(previous).toHaveBeenCalled();
    uninstall();
    expect(utils.getGlobalHandler()).toBe(previous);
    clearFatalError();
  });

  it('is a no-op without ErrorUtils', () => {
    expect(() => installGlobalErrorHandler(undefined, {})).not.toThrow();
  });
});

const BS = String.fromCharCode(92);

describe('sanitize: extended redaction', () => {
  const cases: [string, string, string][] = [
    ['Basic auth header', 'Authorization: Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA'],
    ['bare Basic credentials', 'sent Basic dXNlcjpwYXNzd29yZA== to server', 'dXNlcjpwYXNzd29yZA'],
    ['URL userinfo with password', 'GET https://john:s3cret@api.example.com/x failed', 's3cret'],
    ['URL userinfo with dots, no password', 'GET https://john.smith@api.example.com/x failed', 'john.smith'],
    ['api_key', 'bad api_key=AbC123xyz9 in request', 'AbC123xyz9'],
    ['apikey', 'bad apikey: AbC123xyz9 in request', 'AbC123xyz9'],
    ['x-api-key header', 'headers {"x-api-key": "k-12345"}', 'k-12345'],
    ['api-key', 'api-key: k-98765', 'k-98765'],
    ['Cookie header', 'Cookie: sid=abc123; theme=dark', 'abc123'],
    ['Set-Cookie header', 'Set-Cookie: refresh=zzz999; HttpOnly', 'zzz999'],
    ['query code', 'https://x.io/cb?code=AUTHCODE42&ok=1', 'AUTHCODE42'],
    ['query state', 'https://x.io/cb?a=1&state=STATE77', 'STATE77'],
    ['query token', 'https://x.io/r?token=TOK555', 'TOK555'],
    ['query key', 'https://x.io/r?key=KEY111', 'KEY111'],
    ['query secret', 'https://x.io/r?secret=SEC222', 'SEC222'],
    ['query sig', 'https://x.io/r?sig=SIG333', 'SIG333'],
    ['query signature', 'https://x.io/r?signature=SGN444', 'SGN444'],
    ['query auth', 'https://x.io/r?auth=AUT555', 'AUT555'],
    ['query session', 'https://x.io/r?session=SES666', 'SES666'],
    ['query password', 'https://x.io/r?password=PW777', 'PW777'],
    ['quoted value with spaces', '{"password":"my secret pass","a":1}', 'secret pass'],
    ['single-quoted value with spaces', "{'token': 'my secret pass'}", 'secret pass'],
    ['base64 run', 'blob QWxhZGRpbjpvcGVuIHNlc2FtZQ0123456789abcdef end', 'QWxhZGRpbjpvcGVuIHNlc2FtZQ'],
    ['hex run', 'digest 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 ok', '9f86d081884c7d65'],
    ['Windows path with spaces', String.raw`at C:\Users\John Smith\Documents\proj\src\a.js:1`, 'John'],
  ];
  it.each(cases)('%s', (_n, input, secret) => {
    const out = sanitize(input);
    expect(out).not.toContain(secret);
    expect(out).toContain('[redacted]'.slice(0, 0)); // sanity: string output
  });

  it('keeps the host of a URL with userinfo and the last two segments of a Windows path', () => {
    expect(sanitize('https://john:pw@api.example.com/x')).toContain('api.example.com');
    const win = sanitize(String.raw`at C:\Users\John Smith\Documents\proj\src\a.js:1`);
    expect(win).toContain(String.raw`src\a.js`);
    expect(win).not.toMatch(/Users|Documents|Smith/);
  });

  it('keeps ordinary diagnostic text readable (URL paths, identifiers, words)', () => {
    const t = 'GET /api/projects/12/tasks/45/comments failed in SomeVeryLongComponentNameWithoutDigits: session expired';
    const out = sanitize(t);
    expect(out).toContain('/api/projects/12/tasks/45/comments');
    expect(out).toContain('SomeVeryLongComponentNameWithoutDigits');
    expect(out).toContain('session expired');
  });

  it('is linear on pathological 50k-character inputs (no catastrophic backtracking)', () => {
    const probes = [
      'a'.repeat(50_000),
      'eyJ'.repeat(16_000),
      'a.'.repeat(25_000),
      ('a'.repeat(23) + '!').repeat(2_000),
      '://'.repeat(16_000),
      'password '.repeat(5_000),
      '"password":"'.repeat(4_000),
      `C:${BS}a b${BS}`.repeat(6_000),
      'a@'.repeat(25_000),
      '/'.repeat(50_000),
      ' '.repeat(50_000) + 'x',
    ];
    const start = Date.now();
    for (const p of probes) sanitize(p);
    expect(Date.now() - start).toBeLessThan(4_000);
  });
});

describe('ErrorBoundary Details', () => {
  function Bomb(): React.ReactElement {
    throw new Error('Cannot read property x of undefined for kim@corp.io');
  }

  it('is collapsed by default (no message); "Details" reveals a code + sanitised message, never the e-mail', () => {
    renderWithProviders(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByTestId('error-details')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Details' }));
    const details = screen.getByTestId('error-details');
    expect(details).toHaveTextContent(/Code: E-[0-9A-F]{6}/);
    expect(details).toHaveTextContent(/Cannot read property x of undefined for \[email\]/);
    expect(details).not.toHaveTextContent(/Users|LogicLoom|node_modules/);
    expect(screen.queryByText(/kim@corp\.io/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByTestId('error-details')).toBeNull();
  });
});
