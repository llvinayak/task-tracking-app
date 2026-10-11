import { QueryClient, onlineManager, type DefaultOptions } from '@tanstack/react-query';

import { isAppError } from '@/api/errors';

/** Retry once for transient failures only; never for 4xx-style outcomes. */
const shouldRetry = (failureCount: number, error: unknown) => {
  if (failureCount >= 1 || !onlineManager.isOnline()) return false;
  if (!isAppError(error)) return true;
  return error.kind === 'network' || error.kind === 'timeout' || error.kind === 'server';
};

export const createQueryClient = (
  queryOverrides: DefaultOptions['queries'] = {},
  mutationOverrides: DefaultOptions['mutations'] = {},
) =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Offline: attempt once and fail fast with a network error (clear message + retry)
        // instead of pausing forever. There is no offline write queue.
        networkMode: 'offlineFirst',
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        ...queryOverrides,
      },
      mutations: { retry: false, networkMode: 'always', ...mutationOverrides },
    },
  });

export const queryClient = createQueryClient();
