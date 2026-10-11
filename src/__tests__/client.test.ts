import * as SecureStore from 'expo-secure-store';

import { http, get } from '@/api/client';
import { AppError } from '@/api/errors';
import { useAuthStore, type SessionUser } from '@/store/authStore';

import { httpError } from '@/test/testUtils';

const user: SessionUser = { id: 1, name: 'Ada', email: 'a@x.io', roleId: 5, roleName: 'Developer', clientId: null };

type Adapter = NonNullable<typeof http.defaults.adapter>;
const setAdapter = (fn: (config: Parameters<Extract<Adapter, (...a: never[]) => unknown>>[0]) => Promise<unknown>) => {
  http.defaults.adapter = fn as unknown as Adapter;
};

const authenticate = (token = 'tok-1') =>
  useAuthStore.setState({ status: 'authenticated', user, token, notice: null });

beforeEach(async () => {
  useAuthStore.setState({ status: 'unauthenticated', user: null, token: null, notice: null });
  await SecureStore.setItemAsync('tt.auth.token', 'tok-1');
});

describe('api client', () => {
  it('uses a 15s timeout and attaches the bearer token', async () => {
    expect(http.defaults.timeout).toBe(15000);
    authenticate();
    let auth: unknown;
    setAdapter(async (config) => {
      auth = config.headers.get('Authorization');
      return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true, data: [1, 2] } };
    });
    await expect(get<number[]>('/menu-access/my')).resolves.toEqual([1, 2]);
    expect(auth).toBe('Bearer tok-1');
  });

  it('sends no Authorization header when signed out', async () => {
    let auth: unknown = 'unset';
    setAdapter(async (config) => {
      auth = config.headers.get('Authorization');
      return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true, data: null } };
    });
    await get('/x');
    expect(auth).toBeFalsy();
  });

  it('throws AppError for success:false envelopes', async () => {
    setAdapter(async (config) => ({
      status: 200, statusText: 'OK', headers: {}, config, data: { success: false, message: 'Nope' },
    }));
    await expect(get('/x')).rejects.toMatchObject({ name: 'AppError', message: 'Nope' });
  });

  it('401 on a normal route clears the session, token and flags expiry', async () => {
    authenticate();
    setAdapter(async (config) => {
      throw httpError(401, { success: false, message: 'Token expired' }, {}, '/projects', {
        Authorization: String(config.headers.get('Authorization')),
      });
    });
    await expect(get('/projects')).rejects.toBeInstanceOf(AppError);
    await new Promise((r) => setTimeout(r, 0));

    const s = useAuthStore.getState();
    expect(s.status).toBe('unauthenticated');
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(s.notice).toBe('expired');
    expect(await SecureStore.getItemAsync('tt.auth.token')).toBeNull();
  });

  it('401 on /auth/* does not clear the session', async () => {
    authenticate();
    setAdapter(async (config) => {
      throw httpError(401, { message: 'Invalid email or password' }, {}, '/auth/login', {
        Authorization: String(config.headers.get('Authorization')),
      });
    });
    await expect(get('/auth/login')).rejects.toMatchObject({ kind: 'unauthorized' });
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().notice).toBeNull();
  });

  it('ignores a late 401 that belongs to an older token', async () => {
    authenticate('tok-new');
    setAdapter(async () => {
      throw httpError(401, { message: 'Token expired' }, {}, '/tasks', { Authorization: 'Bearer tok-old' });
    });
    await expect(get('/tasks')).rejects.toBeInstanceOf(AppError);
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('does not clear the session for 403 or 5xx', async () => {
    authenticate();
    for (const status of [403, 500]) {
      setAdapter(async (config) => {
        throw httpError(status, { message: 'x' }, {}, '/tasks', {
          Authorization: String(config.headers.get('Authorization')),
        });
      });
      await expect(get('/tasks')).rejects.toBeInstanceOf(AppError);
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});
