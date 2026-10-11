import { useMutation, type DefaultError, type UseMutationOptions } from '@tanstack/react-query';

import { useAuthStore } from '@/store/authStore';

/** Session counter: bumped by wipeUserData (logout, 401, user switch). */
export const currentEpoch = () => useAuthStore.getState().epoch;

/** True when `epoch` (captured earlier) belongs to a previous session. Undefined = nothing captured = not stale. */
export const isEpochStale = (epoch: number | undefined): boolean => epoch !== undefined && epoch !== currentEpoch();

/**
 * For call sites that continue after an awaited mutateAsync (navigate, close a sheet,
 * clear a form, toast). Capture BEFORE the await, test AFTER it:
 *
 *   const alive = captureSession();
 *   await m.mutateAsync(v);
 *   if (!alive()) return;   // signed out / another user: do nothing more
 *
 * (Mutation-level onSuccess/onError are already skipped by useSessionMutation; this
 * covers the code that runs after the promise resolves or rejects.)
 */
export const captureSession = (): (() => boolean) => {
  const epoch = currentEpoch();
  return () => currentEpoch() === epoch;
};

type Epoch = { __epoch: number };

/** True when the mutation was started in an earlier session than the current one. */
export const isStaleSession = (ctx: unknown): boolean => {
  const e = (ctx as Partial<Epoch> | undefined)?.__epoch;
  return e !== undefined && e !== currentEpoch();
};

/**
 * useMutation whose onSuccess / onError are skipped when the user logged out (or
 * another user signed in) while the request was in flight, so a late response can
 * never write the previous user's data into the new session's cache, show their
 * toasts, or navigate. onSettled still runs (locks and pending flags must release).
 *
 * The session epoch rides along in the onMutate context (spread into it), so
 * existing context shapes (rollback functions, previous values) keep working.
 */
export function useSessionMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
) {
  const { onMutate, onSuccess, onError, ...rest } = options;
  return useMutation<TData, TError, TVariables, TContext & Epoch>({
    ...(rest as UseMutationOptions<TData, TError, TVariables, TContext & Epoch>),
    onMutate: async (vars, ...more) => {
      const inner = onMutate ? await (onMutate as (v: TVariables, ...m: unknown[]) => Promise<TContext> | TContext)(vars, ...more) : undefined;
      return { ...(inner as object | undefined), __epoch: currentEpoch() } as TContext & Epoch;
    },
    onSuccess: (data, vars, ctx, ...more) => {
      if (isStaleSession(ctx)) return;
      return (onSuccess as ((d: TData, v: TVariables, c: TContext | undefined, ...m: unknown[]) => unknown) | undefined)?.(data, vars, ctx, ...more);
    },
    onError: (err, vars, ctx, ...more) => {
      if (isStaleSession(ctx)) return;
      return (onError as ((e: TError, v: TVariables, c: TContext | undefined, ...m: unknown[]) => unknown) | undefined)?.(err, vars, ctx, ...more);
    },
  });
}
