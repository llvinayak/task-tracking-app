import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui';
import { createQueryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/theme/ThemeProvider';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function renderWithProviders(ui: React.ReactElement, opts: { navigation?: boolean } = {}) {
  // No retries and no 5-minute GC timers: nothing keeps the Jest worker alive.
  const queryClient = createQueryClient({ retry: false, gcTime: 0, staleTime: 0 }, { gcTime: 0 });
  const content = opts.navigation ? <NavigationContainer>{ui}</NavigationContainer> : ui;
  const utils = render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{content}</ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, queryClient };
}

/** Builds an AxiosError carrying an HTTP response, as axios would on a 4xx/5xx. */
export function httpError(
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
  url = '/x',
  requestHeaders: Record<string, string> = {},
): AxiosError {
  const config = { url, headers: requestHeaders } as unknown as InternalAxiosRequestConfig;
  const response = { status, data, headers, config, statusText: '' } as AxiosResponse;
  return new AxiosError(`status ${status}`, 'ERR_BAD_REQUEST', config, {}, response);
}

export function networkError(code = 'ERR_NETWORK'): AxiosError {
  return new AxiosError('Network Error', code, { url: '/x' } as InternalAxiosRequestConfig);
}
