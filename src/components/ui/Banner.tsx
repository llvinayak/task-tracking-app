import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export type BannerTone = 'danger' | 'warning' | 'info' | 'success';

/** Shown above stale data when a background refetch failed (never replaces the data). */
export function StaleBanner({ message, testID = 'stale-banner' }: { message: string; testID?: string }) {
  return <Banner testID={testID} tone="warning" message={`Couldn't refresh: ${message} Showing the last data.`} />;
}

/** Inline feedback (form errors, session-expired notice). */
export function Banner({
  message,
  tone = 'danger',
  testID,
}: {
  message: string;
  tone?: BannerTone;
  testID?: string;
}) {
  const t = useTheme();
  const c = t.colors[tone];
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessible
      style={{
        backgroundColor: c.soft,
        borderColor: c.base,
        borderWidth: 1,
        borderRadius: t.radius.xl,
        padding: t.spacing[3],
      }}
    >
      <Text size="sm" style={{ color: c.fg }}>
        {message}
      </Text>
    </View>
  );
}
