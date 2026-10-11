import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect, useMemo } from 'react';
import { AppState, Platform, View, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isApiConfigured } from '@/config/env';
import { wireNetInfo } from '@/lib/connectivity';
import { ToastProvider } from '@/components/ui';
import { queryClient } from '@/lib/queryClient';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ConfigErrorScreen } from '@/screens/StatusScreens';
import { useAuthStore } from '@/store/authStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { hideSplash, useAppFonts } from '@/theme/useAppFonts';

/**
 * TanStack Query focus = app in the foreground. Refetch-on-focus and the
 * dashboard polling both pause while the app is backgrounded.
 * onlineManager is wired to NetInfo (approved dependency) so reconnecting refetches.
 */
function useAppStateFocus() {
  useEffect(() => {
    wireNetInfo();
    if (Platform.OS === 'web') return;
    const onChange = (s: AppStateStatus) => focusManager.setFocused(s === 'active');
    focusManager.setFocused(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);
}

function Shell() {
  useAppStateFocus();
  const t = useTheme();
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Root/window background follows the theme so there is no white flash in dark mode.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.colors.app).catch(() => undefined);
  }, [t.colors.app]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const navTheme: NavTheme = useMemo(
    () => ({
      ...(t.scheme === 'dark' ? DarkTheme : DefaultTheme),
      colors: {
        ...(t.scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
        primary: t.colors.brand[600],
        background: t.colors.app,
        card: t.colors.surface,
        text: t.colors.fg,
        border: t.colors.line,
        notification: t.colors.danger.base,
      },
    }),
    [t],
  );

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const { fontsLoaded, ready } = useAppFonts();
  // The native splash stays visible until fonts are ready (or 2.5s elapse).
  if (!ready) return null;
  return (
    <View style={{ flex: 1 }} onLayout={hideSplash}>
    <SafeAreaProvider>
      <ThemeProvider fontsLoaded={fontsLoaded}>
        <ErrorBoundary>
          {isApiConfigured() ? (
            <QueryClientProvider client={queryClient}>
              <ToastProvider>
                <Shell />
              </ToastProvider>
            </QueryClientProvider>
          ) : (
            <ConfigErrorScreen />
          )}
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
    </View>
  );
}
