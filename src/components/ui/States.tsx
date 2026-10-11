import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Small inline regions (comments, sheet lists). First load of a list/detail uses a Skeleton. */
export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={t.colors.brand[500]} />
      <Text tone="muted">{label}</Text>
    </View>
  );
}

function IconCircle({ name, tone }: { name: IconName; tone?: 'danger' | 'subtle' }) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { backgroundColor: tone === 'danger' ? t.colors.danger.soft : t.colors.subtle }]}
    >
      <Icon name={name} size={40} tone={tone === 'danger' ? 'danger' : 'subtle'} />
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
  secondary,
}: {
  title: string;
  message?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <View accessible style={styles.group}>
        {icon ? <IconCircle name={icon} /> : null}
        <Text size="lg" weight="semibold" style={styles.centerText}>
          {title}
        </Text>
        {message ? (
          <Text size="sm" tone="muted" style={styles.centerText}>
            {message}
          </Text>
        ) : null}
      </View>
      {action ? <Button label={action.label} onPress={action.onPress} size="compact" fullWidth={false} /> : null}
      {secondary ? (
        <Button label={secondary.label} onPress={secondary.onPress} variant="ghost" size="compact" fullWidth={false} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  secondary,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <View accessibilityRole="alert" accessible style={styles.group}>
        <IconCircle name="alert-circle" tone="danger" />
        <Text size="lg" weight="semibold" style={styles.centerText}>
          {title}
        </Text>
        <Text size="sm" tone="muted" style={styles.centerText}>
          {message}
        </Text>
      </View>
      {onRetry ? <Button label={retryLabel} onPress={onRetry} fullWidth={false} /> : null}
      {secondary ? (
        <Button label={secondary.label} onPress={secondary.onPress} variant="ghost" fullWidth={false} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  group: { gap: 8, alignItems: 'center' },
  circle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
});
