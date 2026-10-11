/**
 * Integration: REAL axios instance + REAL interceptors + REAL auth store + REAL
 * secure-store wrapper (mocked native module). Only the transport adapter is
 * faked, so every behaviour below runs through the production code path.
 */
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

import { http } from '@/api/client';
import { getMyMenus } from '@/api/menuApi';
import { getProjects } from '@/api/projectsApi';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

const ss = jest.mocked(SecureStore);
const KEY = 'tt.auth.token';
const store = () => (ss as unknown as { __store: Map<string, string> }).__store;

type Handler = (config: InternalAxiosRequestConfig) => Promise<{ status: number; data: unknown }>;
let handler: Handler;
const sent: { url: string; auth: string | undefined }[] = [];

const ok = (data: unknown) => ({ status: 200, data: { success: true, data } });
const fail = (config: InternalAxiosRequestConfig, status: number, data: unknown): never => {
  throw new AxiosError(`status ${status}`, 'ERR_BAD_REQUEST', config, {}, {
    status,
    data,
    headers: {},
    config,
    statusText: '',
  });
};
const authOf = (c: InternalAxiosRequestConfig) => (c.headers.get('Authorization') as string | undefined) ?? undefined;

beforeAll(() => {
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    sent.push({ url: config.url ?? '', auth: authOf(config) });
    const r = await handler(config);
    return { ...r, statusText: 'OK', headers: {}, config };
  }) as never;
});

const loginAs = async (token: string) => {
  const prev = handler;
  handler = async (c) =>
    c.url === '/auth/login'
      ? ok({ user: { id: 7, name: 'Grace Hopper', email: 'g@x.io', role_id: 5, role_name: 'Developer' }, token })
      : prev(c);
  await useAuthStore.getState().login({ email: 'g@x.io', password: 'pw' });
  handler = prev;
};

const settle = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  jest.clearAllMocks();
  sent.length = 0;
  store().clear();
  handler = async () => ok(null);
  useAuthStore.setState({
    status: 'unauthenticated', user: null, token: null, notice: null, bootstrapError: null, signingOut: false,
  });
  useProjectStore.setState({ selected: null });
  queryClient.clear();
});

describe('login -> 401 -> full clear (through the real interceptor)', () => {
  it('attaches the bearer token, then a 401 on a normal route wipes everything', async () => {
    await loginAs('jwt-A');
    expect(store().get(KEY)).toBe('jwt-A');
    useProjectStore.getState().select({ id: 3, name: 'P', color: null, status: null, product_id: null });
    queryClient.setQueryData(['tasks', {}], [{ id: 1 }]);

    handler = async (c) => fail(c, 401, { success: false, message: 'Token expired' });
    await expect(getProjects()).rejects.toMatchObject({ kind: 'unauthorized' });
    await settle();

    expect(sent.at(-1)).toEqual({ url: '/projects', auth: 'Bearer jwt-A' });
    const s = useAuthStore.getState();
    expect(s).toMatchObject({ status: 'unauthenticated', user: null, token: null, notice: 'expired' });
    expect(store().has(KEY)).toBe(false);
    expect(queryClient.getQueryData(['tasks', {}])).toBeUndefined();
    expect(useProjectStore.getState().selected).toBeNull();
  });

  it('a 401 from /auth/login is a credentials error, not a session expiry', async () => {
    handler = async (c) => fail(c, 401, { success: false, message: 'Invalid email or password' });
    await expect(useAuthStore.getState().login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
    expect(useAuthStore.getState().notice).toBeNull();
  });

  it('403 and 5xx from normal routes keep the session', async () => {
    await loginAs('jwt-A');
    for (const status of [403, 500, 503]) {
      handler = async (c) => fail(c, status, { message: 'x' });
      await expect(getProjects()).rejects.toBeDefined();
    }
    await settle();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(store().get(KEY)).toBe('jwt-A');
  });
});

describe('concurrent and stale 401s', () => {
  it('several simultaneous 401s end the session exactly once', async () => {
    await loginAs('jwt-A');
    ss.deleteItemAsync.mockClear();
    handler = async (c) => fail(c, 401, { message: 'Token expired' });

    const results = await Promise.allSettled([getProjects(), getMyMenus(), getProjects(), getMyMenus()]);
    await settle();

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(ss.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', notice: 'expired' });
  });

  it('a late 401 for the OLD token after re-login does not log the new session out', async () => {
    await loginAs('jwt-A');

    let respondOld!: () => void;
    handler = (c) =>
      new Promise((_resolve, reject) => {
        respondOld = () => reject(new AxiosError('401', 'ERR_BAD_REQUEST', c, {}, {
          status: 401, data: { message: 'Token expired' }, headers: {}, config: c, statusText: '',
        }));
      });
    const inFlight = getProjects(); // sent with jwt-A, response still pending
    inFlight.catch(() => undefined);
    await settle();
    expect(sent.at(-1)?.auth).toBe('Bearer jwt-A');

    // User signs out and signs in again as someone else while it is pending.
    await useAuthStore.getState().logout();
    await loginAs('jwt-B');
    expect(useAuthStore.getState().status).toBe('authenticated');

    respondOld();
    await expect(inFlight).rejects.toMatchObject({ kind: 'unauthorized' });
    await settle();

    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', token: 'jwt-B', notice: null });
    expect(store().get(KEY)).toBe('jwt-B');
  });
});

describe('timeout path', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a request that outlives the 15s client timeout becomes a "timeout" AppError and keeps the session', async () => {
    await loginAs('jwt-A');
    // Faithful to what the xhr/http adapters do: reject with ECONNABORTED after config.timeout.
    // (Transport-level behaviour on a real network is NOT covered here.)
    handler = (c) =>
      new Promise((_resolve, reject) => {
        setTimeout(
          () => reject(new AxiosError(`timeout of ${c.timeout}ms exceeded`, 'ECONNABORTED', c)),
          c.timeout,
        );
      });

    const p = getProjects();
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(14_999);
    await jest.advanceTimersByTimeAsync(2);
    await assertion;
    await expect(p).rejects.toThrow('took too long');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});
