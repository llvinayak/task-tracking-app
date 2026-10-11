import * as SecureStore from 'expo-secure-store';

import * as authApi from '@/api/authApi';
import { AppError } from '@/api/errors';
import type { ApiUser } from '@/api/types';
import { queryClient } from '@/lib/queryClient';
import { LOGOUT_FAILED_MESSAGE, useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { tokenStorage } from '@/store/tokenStorage';

jest.mock('@/api/authApi');
const api = authApi as jest.Mocked<typeof authApi>;
const ss = jest.mocked(SecureStore);
const KEY = 'tt.auth.token';
const store = () => (ss as unknown as { __store: Map<string, string> }).__store;

const apiUser: ApiUser = { id: 7, name: 'Grace', email: 'g@x.io', role_id: 3, role_name: 'Tech Lead' };

const signIn = async (token = 'jwt-1') => {
  api.login.mockResolvedValueOnce({ user: apiUser, token });
  await useAuthStore.getState().login({ email: 'g@x.io', password: 'pw' });
};

beforeEach(async () => {
  jest.clearAllMocks();
  store().clear();
  useAuthStore.setState({
    status: 'unauthenticated', user: null, token: null, notice: null, bootstrapError: null, signingOut: false,
  });
  useProjectStore.setState({ selected: null });
  queryClient.clear();
});

describe('logout (delete first, then flip state)', () => {
  it('does NOT report signed-out when the token delete fails; user stays signed in and can retry', async () => {
    await signIn();
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b'));

    await expect(useAuthStore.getState().logout()).rejects.toThrow(LOGOUT_FAILED_MESSAGE);

    const s = useAuthStore.getState();
    expect(s.status).toBe('authenticated');
    expect(s.token).toBe('jwt-1');
    expect(s.signingOut).toBe(false);
    expect(store().get(KEY)).toBe('jwt-1'); // really still stored, and we said so

    await useAuthStore.getState().logout(); // retry succeeds
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(store().has(KEY)).toBe(false);
  });

  it('state flips only AFTER the delete resolved (an app kill in between is safe)', async () => {
    await signIn();
    let release!: () => void;
    ss.deleteItemAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            store().delete(KEY);
            resolve();
          };
        }),
    );
    const p = useAuthStore.getState().logout();
    await new Promise((r) => setTimeout(r, 5));
    // Mid-flight: still authenticated, token still in the keystore, busy flag set.
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().signingOut).toBe(true);
    expect(store().get(KEY)).toBe('jwt-1');
    release();
    await p;
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(store().has(KEY)).toBe(false);
  });

  it('a second tap while signing out is ignored (pending guard)', async () => {
    await signIn();
    const a = useAuthStore.getState().logout();
    const b = useAuthStore.getState().logout();
    await Promise.all([a, b]);
    expect(ss.deleteItemAsync).toHaveBeenCalledTimes(1);
  });

  it('clears the selected project, the query cache and user data', async () => {
    await signIn();
    useProjectStore.getState().select({ id: 9, name: 'Secret', color: null, status: null, product_id: null });
    queryClient.setQueryData(['tasks', {}], [{ id: 1 }]);

    await useAuthStore.getState().logout();

    expect(useProjectStore.getState().selected).toBeNull();
    expect(queryClient.getQueryData(['tasks', {}])).toBeUndefined();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('a late logout cannot remove a NEWER login token (M2)', async () => {
    await signIn('old-token');
    // Slow delete for the old session...
    let release!: () => void;
    ss.deleteItemAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            store().delete(KEY);
            resolve();
          };
        }),
    );
    const logout = useAuthStore.getState().logout();
    // ...and a new login's write is queued behind it.
    const write = tokenStorage.set('new-token');
    await new Promise((r) => setTimeout(r, 5)); // let the delete start (it is waiting on us)
    release();
    await Promise.all([logout, write]);
    expect(store().get(KEY)).toBe('new-token');
  });
});

describe('session end by the server', () => {
  it('expireSession: flips immediately, wipes caches, removes only its own token', async () => {
    await signIn('old-token');
    useProjectStore.getState().select({ id: 9, name: 'X', color: null, status: null, product_id: null });
    await useAuthStore.getState().expireSession();
    expect(useAuthStore.getState().notice).toBe('expired');
    expect(useProjectStore.getState().selected).toBeNull();
    expect(store().has(KEY)).toBe(false);
  });

  it('expireSession with a failing delete still signs the UI out (token is dead anyway)', async () => {
    await signIn('old-token');
    ss.deleteItemAsync.mockRejectedValue(new Error('locked'));
    await useAuthStore.getState().expireSession();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().notice).toBe('expired');
    ss.deleteItemAsync.mockImplementation(async (k: string) => {
      store().delete(k);
    });
  });

  it('a stale expireSession cleanup does not delete a newer login token', async () => {
    await signIn('old-token');
    const expire = useAuthStore.getState().expireSession();
    // New login completes while the old cleanup is still queued.
    api.login.mockResolvedValueOnce({ user: apiUser, token: 'new-token' });
    const login = useAuthStore.getState().login({ email: 'g@x.io', password: 'pw' });
    await Promise.all([expire, login]);
    expect(store().get(KEY)).toBe('new-token');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});

describe('restore failures (L6): ONLY 401 is a permanent session loss', () => {
  it('401 from /auth/me clears the session and flags expiry', async () => {
    store().set(KEY, 'tok');
    api.getMe.mockRejectedValue(new AppError({ kind: 'unauthorized', status: 401, message: 'User not found or inactive' }));
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', notice: 'expired' });
    expect(store().has(KEY)).toBe(false);
  });

  it.each([
    ['forbidden', 403],
    ['not_found', 404],
  ] as const)('%s (%i) from /auth/me shows the retry screen and keeps the token', async (kind, status) => {
    store().set(KEY, 'tok');
    api.getMe.mockRejectedValue(new AppError({ kind, status, message: 'Nope' }));
    await useAuthStore.getState().bootstrap();
    const s = useAuthStore.getState();
    expect(s.status).toBe('error');
    expect(s.bootstrapError).toBe('Nope');
    expect(store().get(KEY)).toBe('tok');
    expect(s.notice).toBeNull();
  });

  it.each([
    ['network', undefined],
    ['timeout', undefined],
    ['server', 503],
  ] as const)('transient %s keeps the token and offers retry', async (kind, status) => {
    store().set(KEY, 'tok');
    api.getMe.mockRejectedValue(new AppError({ kind, ...(status ? { status } : {}), message: 'down' }));
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('error');
    expect(store().get(KEY)).toBe('tok');
  });

  it('login fails cleanly when the token cannot be stored securely', async () => {
    api.login.mockResolvedValue({ user: apiUser, token: 'jwt' });
    ss.setItemAsync.mockRejectedValueOnce(new Error('keystore full'));
    await expect(useAuthStore.getState().login({ email: 'g@x.io', password: 'pw' })).rejects.toThrow(
      "Couldn't save your session securely",
    );
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('bootstrap treats an unreadable keystore as signed out', async () => {
    ss.getItemAsync.mockRejectedValueOnce(new Error('locked'));
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(api.getMe).not.toHaveBeenCalled();
  });
});
