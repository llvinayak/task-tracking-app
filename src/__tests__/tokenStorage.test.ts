import * as SecureStore from 'expo-secure-store';

import { tokenStorage } from '@/store/tokenStorage';

const KEY = 'tt.auth.token';
const ss = jest.mocked(SecureStore);

beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.deleteItemAsync(KEY);
  jest.clearAllMocks();
});

describe('tokenStorage failure paths', () => {
  it('get: an unreadable keystore entry is treated as signed out (no throw)', async () => {
    ss.getItemAsync.mockRejectedValueOnce(new Error('keystore locked'));
    await expect(tokenStorage.get()).resolves.toBeNull();
  });

  it('set: rejects when the token cannot be stored', async () => {
    ss.setItemAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(tokenStorage.set('t')).rejects.toThrow('disk full');
    expect(await tokenStorage.get()).toBeNull();
  });

  it('clear: retries once and succeeds', async () => {
    await tokenStorage.set('t');
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('transient'));
    await expect(tokenStorage.clear()).resolves.toBeUndefined();
    expect(ss.deleteItemAsync).toHaveBeenCalledTimes(2);
    expect(await tokenStorage.get()).toBeNull();
  });

  it('clear: rejects when the delete fails twice (token still stored)', async () => {
    await tokenStorage.set('t');
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b'));
    await expect(tokenStorage.clear()).rejects.toThrow('b');
    expect(await tokenStorage.get()).toBe('t');
  });

  it('a failed operation does not poison the queue', async () => {
    ss.setItemAsync.mockRejectedValueOnce(new Error('boom'));
    const failed = tokenStorage.set('x');
    const ok = tokenStorage.set('y');
    await expect(failed).rejects.toThrow('boom');
    await expect(ok).resolves.toBeUndefined();
    expect(await tokenStorage.get()).toBe('y');
  });
});

describe('tokenStorage serialization (late logout cannot remove a newer token)', () => {
  it('runs operations strictly in call order even when an earlier one is slow', async () => {
    await tokenStorage.set('old');
    const order: string[] = [];
    let releaseDelete!: () => void;
    ss.deleteItemAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseDelete = () => {
            order.push('delete-done');
            resolve();
          };
        }),
    );
    const del = tokenStorage.clear();
    const set = tokenStorage.set('new').then(() => order.push('set-done'));
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]); // set is queued behind the slow delete
    releaseDelete();
    await Promise.all([del, set]);
    expect(order).toEqual(['delete-done', 'set-done']);
    expect(await tokenStorage.get()).toBe('new');
  });

  it('clearIf only deletes when the stored token still matches', async () => {
    await tokenStorage.set('new');
    await expect(tokenStorage.clearIf('old')).resolves.toBe(false);
    expect(await tokenStorage.get()).toBe('new');
    await expect(tokenStorage.clearIf('new')).resolves.toBe(true);
    expect(await tokenStorage.get()).toBeNull();
  });

  it('a stale clearIf queued AFTER a newer login leaves the new token alone', async () => {
    await tokenStorage.set('old');
    const staleCleanup = tokenStorage.clearIf('old');
    const login = tokenStorage.set('new');
    await Promise.all([staleCleanup, login]);
    // cleanup ran first (removed old), then login stored new
    expect(await tokenStorage.get()).toBe('new');

    const lateCleanup = tokenStorage.clearIf('old'); // arrives after re-login
    await expect(lateCleanup).resolves.toBe(false);
    expect(await tokenStorage.get()).toBe('new');
  });

  it('clearIf deletes an unreadable entry (caller wants it gone)', async () => {
    await tokenStorage.set('t');
    ss.getItemAsync.mockRejectedValueOnce(new Error('unreadable'));
    await expect(tokenStorage.clearIf('t')).resolves.toBe(true);
  });

  it('clearIf rejects if the delete itself fails', async () => {
    await tokenStorage.set('t');
    ss.deleteItemAsync.mockRejectedValue(new Error('nope'));
    await expect(tokenStorage.clearIf('t')).rejects.toThrow('nope');
    ss.deleteItemAsync.mockReset();
    ss.deleteItemAsync.mockImplementation(async () => {
      (ss as unknown as { __store: Map<string, string> }).__store.delete(KEY);
    });
  });
});
