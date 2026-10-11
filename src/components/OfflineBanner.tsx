import React from 'react';
import { View } from 'react-native';

import { useIsOnline } from '@/lib/connectivity';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './ui/Text';

/** Small "Offline" strip. There is no offline write queue: edits fail with a clear message. */
export function OfflineBanner() {
  const online = useIsOnline();
  const t = useTheme();
  if (online) return null;
  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessible
      style={{ backgroundColor: t.colors.warning.soft, borderTopColor: t.colors.warning.base, borderTopWidth: 1, paddingVertical: 6, paddingHorizontal: 16 }}
    >
      <Text size="xs" weight="semibold" style={{ color: t.colors.warning.fg }}>
        Offline. Showing saved data; changes can&apos;t be saved until you reconnect.
      </Text>
    </View>
  );
}
