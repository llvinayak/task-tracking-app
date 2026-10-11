import React from 'react';

import { useIsOnline } from '@/lib/connectivity';
import { useTheme } from '@/theme/ThemeProvider';

import { StripBanner } from './ui/Banner';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

/** Offline strip. There is no offline write queue: edits fail with a clear message. */
export function OfflineBanner() {
  const online = useIsOnline();
  const t = useTheme();
  if (online) return null;
  return (
    <StripBanner tone="warning" testID="offline-banner" accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="cloud-offline-outline" size={16} color={t.colors.warning.fg} />
      <Text size="xs" weight="semibold" style={{ color: t.colors.warning.fg, flex: 1 }}>
        Offline. Changes can&apos;t be saved until you reconnect.
      </Text>
    </StripBanner>
  );
}
