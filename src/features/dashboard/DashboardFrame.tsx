import type { UseQueryResult } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { Banner, ErrorState, LoadingState } from '@/components/ui';
import { DASHBOARD_POLL_MS } from '@/config/dashboardRoles';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Poll interval for a dashboard: only while this screen is focused. TanStack's
 * focusManager (wired to AppState in App.tsx) additionally pauses it while the
 * app is in the background.
 */
export function usePollInterval(enabled: boolean): number | false {
  const focused = useIsFocused();
  return enabled && focused ? DASHBOARD_POLL_MS : false;
}

/**
 * Shared loading / error-with-retry / pull-to-refresh frame. The web renders
 * nothing when a dashboard request fails; here the user always sees why.
 */
export function DashboardFrame<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
}) {
  const t = useTheme();
  if (query.isLoading) return <LoadingState label="Loading dashboard..." />;
  if (query.isError && query.data === undefined) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) return <LoadingState label="Loading dashboard..." />;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={t.colors.brand[500]}
        />
      }
    >
      {query.isError ? (
        <View style={styles.stale}>
          <Banner tone="warning" message={`Couldn't refresh: ${getErrorMessage(query.error)} Showing the last data.`} />
        </View>
      ) : null}
      {children(query.data)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 4 },
  stale: { marginBottom: 12 },
});
