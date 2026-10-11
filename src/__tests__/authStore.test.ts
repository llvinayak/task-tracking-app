import * as SecureStore from 'expo-secure-store';

import * as authApi from '@/api/authApi';
import { AppError } from '@/api/errors';
import type { ApiUser } from '@/api/types';
import { queryClient } from '@/lib/queryClient';
import { toSessionUser, useAuthStore } from '@/store/authStore';

jest.mock('@/api/authApi');
const api = authApi as jest.Mocked<typeof authApi>;

const KEY = 'tt.auth.token';
const apiUser: ApiUser = {
  id: 7,
  name: 'Grace Hopper',
  email: 'grace@x.io',
  role_id: 3,
  role_name: 'Tech Lead',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.deleteItemAsync(KEY);
  useAuthStore.setState({
    status: 'loading', user: null, token: null, notice: null, bootstrapError: null,
  });
  queryClient.clear();
});

describe('toSessionUser', () => {
  it('prefers userRole.name (from /auth/me) then role_name (from /auth/login)', () => {
    expect(toSessionUser({ ...apiUser, userRole: { id: 3, name: 'TL' } }).roleName).toBe('TL');
    expect(toSessionUser(apiUser).roleName).toBe('Tech Lead');
    expect(toSessionUser({ ...apiUser, role_name: undefined }).roleName).toBe('Member');
    expect(toSessionUser(apiUser).roleId).toBe(3);
  });
});

describe('authStore', () => {
  it('bootstrap without a stored token -> unauthenticated, no network call', async () => {
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it('bootstrap with a valid token restores the user', async () => {
    await SecureStore.setItemAsync(KEY, 'tok');
    api.getMe.mockResolvedValue(apiUser);
    await useAuthStore.getState().bootstrap();
    const s = useAuthStore.getState();
    expect(s.status).toBe('authenticated');
    expect(s.token).toBe('tok');
    expect(s.user?.name).toBe('Grace Hopper');
  });

  it('bootstrap with a rejected token clears it and flags expiry', async () => {
    await SecureStore.setItemAsync(KEY, 'stale');
    api.getMe.mockRejectedValue(new AppError({ kind: 'unauthorized', status: 401, message: 'Token expired' }));
    await useAuthStore.getState().bootstrap();
    const s = useAuthStore.getState();
    expect(s.status).toBe('unauthenticated');
    expect(s.notice).toBe('expired');
    expect(await SecureStore.getItemAsync(KEY)).toBeNull();
  });

  it('bootstrap on a network error keeps the token and shows the retry state', async () => {
    await SecureStore.setItemAsync(KEY, 'tok');
    api.getMe.mockRejectedValue(new AppError({ kind: 'network', message: 'offline' }));
    await useAuthStore.getState().bootstrap();
    const s = useAuthStore.getState();
    expect(s.status).toBe('error');
    expect(s.bootstrapError).toBe('offline');
    expect(await SecureStore.getItemAsync(KEY)).toBe('tok');

    api.getMe.mockResolvedValue(apiUser);
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('login persists the token in secure store and sets the user', async () => {
    api.login.mockResolvedValue({ user: apiUser, token: 'jwt-abc' });
    await useAuthStore.getState().login({ email: 'grace@x.io', password: 'pw' });
    const s = useAuthStore.getState();
    expect(s.status).toBe('authenticated');
    expect(s.token).toBe('jwt-abc');
    expect(await SecureStore.getItemAsync(KEY)).toBe('jwt-abc');
    expect(JSON.stringify(s.user)).not.toContain('jwt-abc');
  });

  it('login failure leaves the store signed out and nothing persisted', async () => {
    api.login.mockRejectedValue(new AppError({ kind: 'unauthorized', status: 401, message: 'Invalid email or password' }));
    await expect(useAuthStore.getState().login({ email: 'a@b.co', password: 'x' })).rejects.toThrow(
      'Invalid email or password',
    );
    expect(useAuthStore.getState().token).toBeNull();
    expect(await SecureStore.getItemAsync(KEY)).toBeNull();
  });

  it('logout clears secure token, state and the query cache', async () => {
    api.login.mockResolvedValue({ user: apiUser, token: 'jwt-abc' });
    await useAuthStore.getState().login({ email: 'grace@x.io', password: 'pw' });
    queryClient.setQueryData(['my-menus', 3], [{ id: 1 }]);

    await useAuthStore.getState().logout();

    const s = useAuthStore.getState();
    expect(s.status).toBe('unauthenticated');
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(s.notice).toBeNull();
    expect(await SecureStore.getItemAsync(KEY)).toBeNull();
    expect(queryClient.getQueryData(['my-menus', 3])).toBeUndefined();
  });

  it('expireSession is idempotent and only acts when authenticated', async () => {
    await useAuthStore.getState().expireSession();
    expect(useAuthStore.getState().notice).toBeNull();

    api.login.mockResolvedValue({ user: apiUser, token: 'jwt' });
    await useAuthStore.getState().login({ email: 'a@b.co', password: 'x' });
    await Promise.all([useAuthStore.getState().expireSession(), useAuthStore.getState().expireSession()]);
    expect(useAuthStore.getState().notice).toBe('expired');
  });
});
