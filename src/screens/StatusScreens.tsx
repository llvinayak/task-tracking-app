import React from 'react';

import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { getApiConfigError } from '@/config/env';
import { useAuthStore } from '@/store/authStore';

export function SplashScreen() {
  return (
    <Screen>
      <LoadingState label="Loading your workspace..." />
    </Screen>
  );
}

/** Shown when a stored session could not be validated (offline / server down). */
export function SessionRestoreErrorScreen() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const logout = useAuthStore((s) => s.logout);
  const message = useAuthStore((s) => s.bootstrapError);
  return (
    <Screen>
      <ErrorState
        title="Couldn't restore your session"
        message={message ?? 'Please check your connection and try again.'}
        onRetry={() => void bootstrap()}
        secondary={{ label: 'Sign out', onPress: () => void logout() }}
      />
    </Screen>
  );
}

export function ConfigErrorScreen() {
  return (
    <Screen>
      <ErrorState
        title="App is not configured"
        message={getApiConfigError() ?? "The app is not configured."}
      />
    </Screen>
  );
}
