import { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { http } from '@/api/client';

export interface Call {
  method: string;
  url: string;
  params?: unknown;
  body?: unknown;
  contentType?: unknown;
}

type Result = { status?: number; data?: unknown; headers?: Record<string, string> };
export type Handler = (call: Call, config: InternalAxiosRequestConfig) => Result | Promise<Result>;

export const calls: Call[] = [];
let handler: Handler = () => ({ data: { success: true, data: null } });

export const ok = (data: unknown, extra: Record<string, unknown> = {}): Result => ({
  status: 200,
  data: { success: true, data, ...extra },
});
export const created = (data: unknown, extra: Record<string, unknown> = {}): Result => ({
  status: 201,
  data: { success: true, data, ...extra },
});
export const fail = (status: number, message: string, errors?: unknown): Result => ({
  status,
  data: { success: false, message, ...(errors ? { errors } : {}) },
});

/** Routes every request of the REAL axios instance through `fn` (no network). */
export function useHttp(fn: Handler) {
  handler = fn;
}

export function installHttpAdapter() {
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    let body: unknown = config.data;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // keep raw
      }
    }
    const call: Call = {
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
      params: config.params,
      body,
      contentType: config.headers.get('Content-Type'),
    };
    calls.push(call);
    const r = await handler(call, config);
    const status = r.status ?? 200;
    const response = { status, statusText: String(status), headers: r.headers ?? {}, config, data: r.data };
    if (status >= 400) {
      throw new AxiosError(`status ${status}`, 'ERR_BAD_REQUEST', config, {}, response as never);
    }
    return response;
  }) as never;
}

export function resetHttp() {
  calls.length = 0;
  handler = () => ({ data: { success: true, data: null } });
}
