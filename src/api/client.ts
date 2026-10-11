import { create as createAxios, isAxiosError, AxiosHeaders, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '@/config/env';

import { AppError, normalizeError } from './errors';
import { noteServerDate } from './serverClock';
import { getSessionBridge } from './session';

/** Standard envelope: { success, data?, message?, errors? }. */
export interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/** The single axios instance for the whole app. */
export const http = createAxios({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

// NOTE for later multipart uploads: pass FormData and do NOT set Content-Type
// manually - the runtime must add the multipart boundary itself.

const bearer = (token: string) => `Bearer ${token}`;

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getSessionBridge().getToken();
  if (token) config.headers.set('Authorization', bearer(token));
  return config;
});

const isAuthRoute = (url?: string) => !!url && /^\/?auth(\/|$|\?)/.test(url);

http.interceptors.response.use(
  (res) => {
    noteServerDate(res.headers ? AxiosHeaders.from(res.headers as never).get('date') : undefined);
    return res;
  },
  (error: unknown) => {
    const appError = normalizeError(error);

    if (appError.kind === 'unauthorized' && isAxiosError(error)) {
      const sent = error.config?.headers ? AxiosHeaders.from(error.config.headers).get('Authorization') : undefined;
      const { getToken, onUnauthorized } = getSessionBridge();
      const current = getToken();
      // Only react if this response belongs to the live session: ignore late
      // 401s from a previous (already cleared / replaced) token, and
      // /auth/* calls, which handle their own 401.
      if (!isAuthRoute(error.config?.url) && current && sent === bearer(current)) {
        onUnauthorized();
      }
    }
    return Promise.reject(appError);
  },
);

/** Full envelope: top-level fields such as `warning` and `message` are kept. */
export interface FullResponse<T> {
  data: T;
  warning: string | null;
  message: string | null;
}

export async function requestFull<T>(config: AxiosRequestConfig): Promise<FullResponse<T>> {
  const res = await http.request<Envelope<T> & { warning?: unknown }>(config);
  const body = res.data;
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success === false) {
      throw new AppError({
        kind: 'unknown',
        status: res.status,
        message: body.message ?? 'Request failed',
      });
    }
    return {
      data: body.data as T,
      warning: typeof body.warning === 'string' && body.warning ? body.warning : null,
      message: typeof body.message === 'string' && body.message ? body.message : null,
    };
  }
  // ASSUMPTION: every endpoint wraps payloads as { success, data }. A bare body
  // is returned as-is rather than faked.
  return { data: body as unknown as T, warning: null, message: null };
}

/**
 * Performs a request and returns the unwrapped `data` of the envelope.
 * Throws AppError for transport errors, non-2xx, and `success:false` bodies.
 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  return (await requestFull<T>(config)).data;
}

export const get = <T>(url: string, config?: AxiosRequestConfig) =>
  request<T>({ ...config, url, method: 'GET' });
export const post = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  request<T>({ ...config, url, method: 'POST', data });
export const patch = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  request<T>({ ...config, url, method: 'PATCH', data });
export const del = <T>(url: string, config?: AxiosRequestConfig) =>
  request<T>({ ...config, url, method: 'DELETE' });
export const put = <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  request<T>({ ...config, url, method: 'PUT', data });
