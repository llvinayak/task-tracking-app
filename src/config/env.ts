/**
 * Runtime configuration. EXPO_PUBLIC_* values are inlined at bundle time, so
 * they must be referenced as literal `process.env.EXPO_PUBLIC_X` expressions.
 */
const raw = process.env.EXPO_PUBLIC_API_BASE_URL;

/** Normalized base URL (no trailing slash) or '' when not configured. */
export const API_BASE_URL: string = (raw ?? '').trim().replace(/\/+$/, '');

/**
 * Returns a human-readable problem with the API URL, or null when usable.
 * Production (non-dev) builds must use https: the JWT and every response
 * would otherwise cross the network in clear text.
 */
export function validateApiBaseUrl(url: string, isDev: boolean): string | null {
  if (!url) {
    return 'EXPO_PUBLIC_API_BASE_URL is not set. Copy .env.example to .env, set the API URL and restart the bundler.';
  }
  if (!/^https?:\/\//i.test(url)) {
    return 'EXPO_PUBLIC_API_BASE_URL must start with https:// (or http:// in development).';
  }
  if (!isDev && !/^https:\/\//i.test(url)) {
    return 'This build requires an https:// API URL (EXPO_PUBLIC_API_BASE_URL). Plain http is only allowed in development builds.';
  }
  return null;
}

/**
 * Optional explicit URL for the server's GET /health, used only to decide
 * online/offline. By default it is derived as "<origin of the API URL>/health".
 * PREFIX CAVEAT: if the API sits behind a reverse-proxy path prefix
 * (https://host/tasktracking/api), /health at the origin root may not be routed to the
 * app; set EXPO_PUBLIC_HEALTH_URL to the real one (https://host/tasktracking/health).
 */
export const HEALTH_URL_OVERRIDE: string = (process.env.EXPO_PUBLIC_HEALTH_URL ?? '').trim();

/** Null when the override is empty or usable (https required outside development). */
export function validateHealthUrl(url: string, isDev: boolean): string | null {
  if (!url) return null;
  if (!/^https?:\/\/[^\s/?#]+/i.test(url)) return 'EXPO_PUBLIC_HEALTH_URL must be a full http(s) URL.';
  if (!isDev && !/^https:\/\//i.test(url)) return 'EXPO_PUBLIC_HEALTH_URL must be https:// in non-development builds.';
  return null;
}

export const getApiConfigError = (): string | null => validateApiBaseUrl(API_BASE_URL, __DEV__);
export const isApiConfigured = (): boolean => getApiConfigError() === null;

/** Attachment/link schemes the app may open: plain http only while developing. */
export const attachmentSchemes = (isDev: boolean = __DEV__): readonly string[] =>
  isDev ? ['https', 'http'] : ['https'];

export const REQUEST_TIMEOUT_MS = 15_000;
