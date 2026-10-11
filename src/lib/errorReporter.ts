/**
 * Small global error reporter. Goals: (1) a crash is DIAGNOSABLE without a debugger (a short code and a
 * sanitised message the user can read out), (2) a fatal JS error outside React rendering can still show the
 * friendly screen instead of killing the app silently. Nothing here is sent anywhere: it logs to the console
 * (visible in `adb logcat` as ReactNativeJS) and keeps the last report in memory.
 */

export interface ErrorReport {
  /** Short stable code derived from the message and top frame, e.g. "E-3FA21C". Safe to read aloud. */
  code: string;
  /** Sanitised, truncated message. Never a token, e-mail address or password. */
  message: string;
  /** A few sanitised frames / component names (no file paths with user data). */
  where: string;
  fatal: boolean;
  at: number;
}

const MAX_MESSAGE = 200;
const MAX_WHERE = 400;

const SENSITIVE_KEY =
  'password|passwd|pwd|token|secret|authorization|x-api-key|api[_-]?key|cookie|set-cookie|session|signature|credential';
// Narrower list for free-text "key value" pairs (a word like "session expired" must stay readable).
const KV_KEY = 'password|passwd|pwd|token|secret|authorization|x-api-key|api[_-]?key';

// Every rule is linear-time on adversarial input: each one starts at a literal, or is anchored to the start of a
// "word" via a captured boundary character, and no rule has nested open-ended quantifiers.
const RULES: readonly (readonly [RegExp, string | ((...m: string[]) => string)])[] = [
  // JSON-ish values, quoted, may contain spaces: "password":"my secret pass"
  [
    new RegExp(String.raw`("[\w-]{0,30}(?:${SENSITIVE_KEY})[\w-]{0,30}"\s*:\s*)"(?:[^"\\]|\\.)*"`, 'gi'),
    '$1"[redacted]"',
  ],
  [
    new RegExp(String.raw`('[\w-]{0,30}(?:${SENSITIVE_KEY})[\w-]{0,30}'\s*:\s*)'(?:[^'\\]|\\.)*'`, 'gi'),
    "$1'[redacted]'",
  ],
  // URL userinfo (scheme://user:pass@host, user with or without dots): keep the host.
  [/(:\/\/)[^\s/@:?#]+(?::[^\s/@?#]*)?@/g, '$1[redacted]@'],
  // Cookie / Set-Cookie header values run to the end of the line (or the closing quote).
  [/((?:set-)?cookie["']?\s*[:=]\s*)[^\r\n"']+/gi, '$1[redacted]'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/Basic\s+[A-Za-z0-9+/=_-]{6,}/g, 'Basic [redacted]'],
  [/(^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '$1[token]'],
  // Secrets in query strings
  [
    /([?&;](?:code|state|token|key|secret|sig|signature|auth|session|session_?id|password|passwd|(?:access|id|refresh)_?token|api[_-]?key|apikey|client_?secret)=)[^&\s#"']*/gi,
    '$1[redacted]',
  ],
  // key: value / key=value
  [new RegExp(String.raw`((?:${KV_KEY})["'\s:=]+)[^\s"',;}]+`, 'gi'), '$1[redacted]'],
  // Windows drive paths (directories may contain spaces): keep only the last two segments. The ellipsis keeps the
  // result from being matched again by the basename rule below.
  [/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]*\\)+[^\s\\/:*?"<>|]+/g, (m: string) => `…\\${m.split('\\').slice(-2).join('\\')}`],
  // Other paths to source files: basename only. Anchored to a word boundary so a long run stays linear.
  [/(^|[^\w.@~\\/…-])(?:[A-Za-z]:)?(?:[\w.@~-]*[\\/])+([\w.@~-]+\.(?:tsx?|jsx?|bundle|js|json)\b)/g, '$1$2'],
  [/(^|[^\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '$1[email]'],
  // Long base64 / base64url / hex runs. '/' is not part of the run so URL paths survive; a run needs a digit or
  // base64 punctuation so long plain identifiers are not mistaken for secrets.
  [
    /(^|[^A-Za-z0-9+_=-])([A-Za-z0-9+_-]{24,}={0,2})/g,
    (_m: string, pre: string, run: string) => (/[0-9+=]/.test(run) ? `${pre}[redacted]` : `${pre}${run}`),
  ],
];

/** Redacts things that must never appear in a report. Linear time in the input length. */
export function sanitize(input: unknown): string {
  let s = typeof input === 'string' ? input : input instanceof Error ? input.message : String(input ?? '');
  for (const [re, to] of RULES) s = typeof to === 'string' ? s.replace(re, to) : s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
}

/** First few frames, reduced to "function (file:line)" with directories stripped. */
function frames(stack: string | undefined, limit = 3): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('at ') || /@/.test(l))
    .slice(0, limit)
    .map((l) => sanitize(l.replace(/\(?[^()\s]*[\\/]([^\\/()\s]+)\)?/g, '($1)')))
    .join(' | ');
}

/** Component names from a React component stack ("in Foo (at File.tsx:12)"). */
function components(componentStack: string | undefined, limit = 4): string {
  if (!componentStack) return '';
  return componentStack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((l) =>
      sanitize(
        l
          .replace(/\s*\(at .*\)$/, '')
          .replace(/^at\s+/, '')
          .replace(/^in\s+/, ''),
      ),
    )
    .join(' < ');
}

export function describeError(error: unknown, opts: { fatal?: boolean; componentStack?: string } = {}): ErrorReport {
  const err = error instanceof Error ? error : undefined;
  const message =
    sanitize(err ? `${err.name}: ${err.message}` : String(error ?? 'Unknown error')).slice(0, MAX_MESSAGE) ||
    'Unknown error';
  const where = [components(opts.componentStack), frames(err?.stack)].filter(Boolean).join(' || ').slice(0, MAX_WHERE);
  return {
    code: `E-${hash(message)}`,
    message,
    where,
    fatal: !!opts.fatal,
    at: Date.now(),
  };
}

type Listener = () => void;
let last: ErrorReport | null = null;
let fatal: ErrorReport | null = null;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export const getLastError = () => last;
export const getFatalError = () => fatal;
export const subscribeErrors = (l: Listener) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const hasErrorUi = () => listeners.size > 0;

/** Records a report and logs it (never the raw error object, which may carry request data). */
export function recordError(error: unknown, opts: { fatal?: boolean; componentStack?: string } = {}): ErrorReport {
  const report = describeError(error, opts);
  last = report;
  if (opts.fatal) fatal = report;
  // One sanitised line: readable in `adb logcat -s ReactNativeJS:E`.
  console.error(`[TT-ERROR] ${report.code} ${report.fatal ? 'FATAL ' : ''}${report.message} :: ${report.where}`);
  notify();
  return report;
}

export function clearFatalError() {
  fatal = null;
  notify();
}

/** Test helper. */
export function __resetErrorReporter() {
  last = null;
  fatal = null;
  listeners.clear();
}

/** At most this many fatal errors are shown on the error screen per window; further ones go to the default handler. */
const SWALLOW_MAX = 3;
const SWALLOW_WINDOW_MS = 60_000;

interface ErrorUtilsLike {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => void;
}

/**
 * Wraps the global JS error handler. The previous (default) handler is always preserved: it is called for every
 * non-fatal error, in development, and whenever no error screen is mounted. In a RELEASE build a FATAL error
 * while the error screen IS mounted is shown there instead of being passed on, because the default handler would
 * kill the app before anyone could read the code. That is capped (3 fatals per 60 seconds): beyond it the default
 * handler runs, so a persistent cause crashes cleanly instead of leaving a zombie app. Returns an uninstall function.
 */
export function installGlobalErrorHandler(
  utils: ErrorUtilsLike | undefined = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils,
  opts: { dev?: boolean; maxSwallowed?: number; windowMs?: number; now?: () => number } = {},
): () => void {
  if (!utils) return () => undefined;
  const dev = opts.dev ?? (typeof __DEV__ !== 'undefined' && __DEV__);
  const maxSwallowed = opts.maxSwallowed ?? SWALLOW_MAX;
  const windowMs = opts.windowMs ?? SWALLOW_WINDOW_MS;
  const now = opts.now ?? Date.now;
  const swallowedAt: number[] = [];
  const previous = utils.getGlobalHandler();
  const handler = (error: unknown, isFatal?: boolean) => {
    try {
      recordError(error, { fatal: !!isFatal });
    } catch {
      // the reporter must never throw out of the handler
    }
    if (isFatal && !dev && hasErrorUi()) {
      // Show the friendly screen instead of dying, but only for a few fatals in a row: a persistent cause (a timer
      // that throws every second) must end in a clean crash, not a zombie app that keeps failing behind the screen.
      const t = now();
      while (swallowedAt.length && t - swallowedAt[0]! >= windowMs) swallowedAt.shift();
      if (swallowedAt.length < maxSwallowed) {
        swallowedAt.push(t);
        return;
      }
    }
    previous(error, isFatal);
  };
  utils.setGlobalHandler(handler);
  return () => {
    if (utils.getGlobalHandler() === handler) utils.setGlobalHandler(previous);
  };
}
