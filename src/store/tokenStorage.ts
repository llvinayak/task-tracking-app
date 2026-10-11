import * as SecureStore from 'expo-secure-store';

/** The JWT lives only in the OS keystore (Keychain / Keystore). */
const TOKEN_KEY = 'tt.auth.token';

/**
 * Every keystore operation runs through ONE queue, in call order. Without it a
 * slow delete from an old logout could land after a newer login's write and
 * silently remove the new token.
 */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => undefined);
  return run;
}

/** Deletes with one retry. Rejects if the token could not be removed. */
async function deleteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export const tokenStorage = {
  /** Unreadable keystore entry is treated as signed out, never a crash. */
  get: (): Promise<string | null> =>
    enqueue(async () => {
      try {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      } catch {
        return null;
      }
    }),

  /** Rejects when the token cannot be stored (caller must not continue). */
  set: (token: string): Promise<void> =>
    enqueue(async () => {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    }),

  /** Unconditional delete. Rejects if the delete fails twice. */
  clear: (): Promise<void> => enqueue(deleteToken),

  /**
   * Compare-and-delete: removes the stored token only if it is still `token`.
   * A stale cleanup can therefore never remove a newer login's token.
   * An unreadable entry is deleted (the caller wants it gone).
   */
  clearIf: (token: string): Promise<boolean> =>
    enqueue(async () => {
      let current: string | null = token;
      try {
        current = await SecureStore.getItemAsync(TOKEN_KEY);
      } catch {
        current = token;
      }
      if (current === null || current !== token) return false;
      await deleteToken();
      return true;
    }),
};
