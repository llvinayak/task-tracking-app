import { create } from 'zustand';

import * as authApi from '@/api/authApi';
import { isAppError } from '@/api/errors';
import { registerSessionBridge } from '@/api/session';
import type { ApiUser, LoginPayload } from '@/api/types';
import { queryClient } from '@/lib/queryClient';

import { useProjectStore } from './projectStore';
import { tokenStorage } from './tokenStorage';
import { useDirtyGuard, useTimerPromptStore } from './uiStores';

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  roleId: number;
  roleName: string;
  clientId: number | null;
}

/** Same precedence as the web Sidebar: userRole.name, then role_name. */
export const toSessionUser = (u: ApiUser): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  roleId: u.role_id,
  roleName: u.userRole?.name || u.role_name || 'Member',
  clientId: u.client_id ?? null,
});

export type AuthStatus =
  | 'loading' // reading keystore / validating token
  | 'authenticated'
  | 'unauthenticated'
  | 'error'; // could not validate the stored session (offline / server down)

/** Why the user is on the login screen without having pressed Sign out. */
export type AuthNotice = 'expired' | null;

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  /** In memory for the interceptor; persisted only via tokenStorage. */
  token: string | null;
  notice: AuthNotice;
  bootstrapError: string | null;
  /** True while a sign-out is running (guards double taps). */
  signingOut: boolean;
  /** Increments whenever the signed-in identity changes (login, logout, expiry). Async work captures it and bails if it moved. */
  epoch: number;

  bootstrap: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  /** Rejects if the token could not be removed; the user then stays signed in. */
  logout: () => Promise<void>;
  expireSession: () => Promise<void>;
  clearNotice: () => void;
}

const SIGNED_OUT = {
  user: null,
  token: null,
  status: 'unauthenticated' as const,
  bootstrapError: null,
  signingOut: false,
};

export const LOGOUT_FAILED_MESSAGE =
  "Couldn't sign you out securely on this device. Please try again.";

export const useAuthStore = create<AuthState>()((set, get) => {
  /** Drops everything the previous user could leak to the next one. */
  const wipeUserData = () => {
    queryClient.getMutationCache().clear();
    queryClient.clear();
    useProjectStore.getState().clear();
    // Nothing from the previous person may linger: a pending status prompt
    // would act on THEIR task, and a dirty guard would block the next user.
    useTimerPromptStore.getState().dismiss();
    useDirtyGuard.getState().reset();
    set((s) => ({ epoch: s.epoch + 1 }));
  };

  /**
   * Server said the session is dead (401 / account gone). The token is already
   * useless, so flip the UI immediately and remove it best-effort with
   * compare-and-delete; if that fails the next start sees a 401 and retries.
   */
  const dropSession = async (token: string | null, notice: AuthNotice) => {
    set({ ...SIGNED_OUT, notice });
    wipeUserData();
    if (token) {
      try {
        await tokenStorage.clearIf(token);
      } catch {
        // Stale token left behind is harmless: it will 401 and be cleared again.
      }
    }
  };

  return {
    status: 'loading',
    user: null,
    token: null,
    notice: null,
    bootstrapError: null,
    signingOut: false,
    epoch: 0,

    bootstrap: async () => {
      set({ status: 'loading', bootstrapError: null });
      const token = await tokenStorage.get();
      if (!token) {
        set({ ...SIGNED_OUT });
        return;
      }
      set({ token });
      try {
        const me = await authApi.getMe();
        // Ignore if the user logged out / session changed while we waited.
        if (get().token !== token) return;
        set({ user: toSessionUser(me), status: 'authenticated', notice: null });
      } catch (e) {
        if (get().token !== token) return;
        if (isAppError(e) && e.kind === 'unauthorized') {
          await dropSession(token, 'expired');
        } else {
          // ONLY 401 is a permanent session loss (the API answers 401 for
          // inactive or deleted users too). Everything else (403, 404, 5xx,
          // offline, timeout) shows the retry screen and keeps the token.
          set({
            status: 'error',
            bootstrapError: isAppError(e) ? e.message : 'Could not restore your session.',
          });
        }
      }
    },

    login: async (payload) => {
      const { user, token } = await authApi.login(payload);
      try {
        await tokenStorage.set(token);
      } catch {
        throw new Error("Couldn't save your session securely on this device.");
      }
      set({
        user: toSessionUser(user),
        token,
        status: 'authenticated',
        notice: null,
        bootstrapError: null,
        epoch: get().epoch + 1,
      });
    },

    logout: async () => {
      if (get().signingOut) return;
      const token = get().token;
      set({ signingOut: true });
      try {
        // Delete FIRST, flip state after: an app kill in between leaves the
        // user signed out, never "signed out in the UI but token still stored".
        if (token) await tokenStorage.clearIf(token);
        else await tokenStorage.clear();
      } catch {
        set({ signingOut: false });
        throw new Error(LOGOUT_FAILED_MESSAGE);
      }
      set({ ...SIGNED_OUT, notice: null });
      wipeUserData();
    },

    expireSession: async () => {
      // Idempotent: several in-flight requests may 401 at once.
      if (get().status !== 'authenticated') return;
      await dropSession(get().token, 'expired');
    },

    clearNotice: () => set({ notice: null }),
  };
});

registerSessionBridge({
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => {
    void useAuthStore.getState().expireSession();
  },
});
