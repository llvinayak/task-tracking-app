import { isAxiosError, type AxiosError } from 'axios';

export type AppErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'conflict' // 409
  | 'validation' // 400 / 422
  | 'rate_limited' // 429
  | 'server' // 5xx
  | 'unknown';

export interface FieldError {
  field?: string;
  message: string;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly fieldErrors: FieldError[];
  /** Seconds, from the Retry-After header on 429. */
  readonly retryAfterSeconds?: number;

  constructor(init: {
    kind: AppErrorKind;
    message: string;
    status?: number;
    fieldErrors?: FieldError[];
    retryAfterSeconds?: number;
  }) {
    super(init.message);
    this.name = 'AppError';
    this.kind = init.kind;
    if (init.status !== undefined) this.status = init.status;
    this.fieldErrors = init.fieldErrors ?? [];
    if (init.retryAfterSeconds !== undefined) this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

const MESSAGES = {
  network: "Can't reach the server. Check your connection and try again.",
  timeout: 'The server took too long to respond. Please try again.',
  server: 'Something went wrong on our side. Please try again in a moment.',
  unknown: 'Something went wrong. Please try again.',
  forbidden: "You don't have permission to do that.",
  notFound: "We couldn't find what you were looking for.",
  conflict: 'This conflicts with existing data.',
  rateLimited: 'Too many attempts. Please wait a moment and try again.',
  unauthorized: 'Your session is no longer valid. Please sign in again.',
  validation: 'Please check your input and try again.',
} as const;

interface ErrorBody {
  message?: unknown;
  errors?: unknown;
}

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * Server shapes (task-tracking-api middleware/validate.js + errorHandler.js):
 *   { success:false, message, errors?: [{ field, message }] }
 * We read `errors[].message` and never `errors[].msg`.
 */
function parseFieldErrors(errors: unknown): FieldError[] {
  if (!Array.isArray(errors)) return [];
  const out: FieldError[] = [];
  for (const e of errors) {
    if (e && typeof e === 'object') {
      const o = e as { field?: unknown; path?: unknown; message?: unknown };
      const message = asString(o.message);
      if (!message) continue;
      const field = asString(o.field) ?? asString(o.path);
      out.push(field ? { field, message } : { message });
    }
  }
  return out;
}

function parseRetryAfter(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as Record<string, unknown> & { get?: (k: string) => unknown };
  const v = typeof h.get === 'function' ? h.get('retry-after') : h['retry-after'];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : undefined;
}

/** Turns anything thrown by axios (or elsewhere) into an AppError. */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (isAxiosError(error)) {
    const err = error as AxiosError<ErrorBody>;

    if (!err.response) {
      const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      return new AppError({
        kind: timedOut ? 'timeout' : 'network',
        message: timedOut ? MESSAGES.timeout : MESSAGES.network,
      });
    }

    const { status, data, headers } = err.response;
    const body: ErrorBody = data && typeof data === 'object' ? data : {};
    const serverMessage = asString(body.message);
    const fieldErrors = parseFieldErrors(body.errors);

    if (status >= 500) {
      // Server may include raw exception text outside production: never show it.
      return new AppError({ kind: 'server', status, message: MESSAGES.server });
    }

    switch (status) {
      case 400:
      case 422: {
        // Prefer the first specific field message; fall back to the summary.
        const message = fieldErrors[0]?.message ?? serverMessage ?? MESSAGES.validation;
        return new AppError({ kind: 'validation', status, message, fieldErrors });
      }
      case 401:
        return new AppError({
          kind: 'unauthorized',
          status,
          message: serverMessage ?? MESSAGES.unauthorized,
        });
      case 403:
        return new AppError({
          kind: 'forbidden',
          status,
          message: serverMessage ?? MESSAGES.forbidden,
        });
      case 404:
        return new AppError({
          kind: 'not_found',
          status,
          message: serverMessage ?? MESSAGES.notFound,
        });
      case 409:
        return new AppError({
          kind: 'conflict',
          status,
          message: fieldErrors[0]?.message ?? serverMessage ?? MESSAGES.conflict,
          fieldErrors,
        });
      case 429: {
        const retryAfterSeconds = parseRetryAfter(headers);
        return new AppError({
          kind: 'rate_limited',
          status,
          message: serverMessage ?? MESSAGES.rateLimited,
          ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
        });
      }
      default:
        return new AppError({
          kind: 'unknown',
          status,
          message: serverMessage ?? MESSAGES.unknown,
          fieldErrors,
        });
    }
  }

  return new AppError({
    kind: 'unknown',
    message: error instanceof Error && error.message ? error.message : MESSAGES.unknown,
  });
}

/** Safe message for UI from any thrown value. */
export const getErrorMessage = (error: unknown): string => normalizeError(error).message;
