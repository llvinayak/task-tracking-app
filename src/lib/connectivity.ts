import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { API_BASE_URL, HEALTH_URL_OVERRIDE, validateHealthUrl } from '@/config/env';

/**
 * "Online" = a network connection exists AND the internet is not known to be
 * unreachable (isInternetReachable is null while still probing, which counts
 * as online so we never show a false Offline banner at start-up).
 */
export const isOnlineState = (s: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  s.isConnected !== false && s.isInternetReachable !== false;

/**
 * The server exposes GET /health at the HOST ROOT (task-tracking-api server.js:
 * app.get('/health')), outside the /api prefix. "https://host/api" -> "https://host/health".
 * Behind a proxy path prefix set EXPO_PUBLIC_HEALTH_URL (see config/env.ts).
 */
export function healthUrl(apiBaseUrl: string, override: string = HEALTH_URL_OVERRIDE, isDev: boolean = __DEV__): string | null {
  // EXPO_PUBLIC_HEALTH_URL wins when valid (needed behind a path prefix); an invalid one is ignored, not trusted.
  if (override && validateHealthUrl(override, isDev) === null) return override;
  const m = /^(https?:\/\/[^/]+)/i.exec(apiBaseUrl.trim());
  return m ? `${m[1]}/health` : null;
}

/**
 * Reachability must be decided against OUR server, not a Google endpoint that
 * some corporate or regional networks block (which would show a false
 * "Offline"). Native OS reachability is therefore switched off.
 */
export function configureNetInfo(apiBaseUrl: string = API_BASE_URL): void {
  const url = healthUrl(apiBaseUrl);
  if (!url) return;
  NetInfo.configure({
    reachabilityUrl: url,
    reachabilityTest: async (response) => response.status >= 200 && response.status < 400,
    reachabilityLongTimeout: 60_000,
    reachabilityShortTimeout: 5_000,
    reachabilityRequestTimeout: 15_000,
    reachabilityShouldRun: () => true,
    useNativeReachability: false,
  });
}

/** Wire TanStack's onlineManager to NetInfo. Reconnect triggers refetches. */
export function wireNetInfo(): void {
  configureNetInfo();
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineState(state))),
  );
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
