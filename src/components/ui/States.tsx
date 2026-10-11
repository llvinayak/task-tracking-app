import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Text } from './Text';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={t.colors.brand[500]} />
      <Text tone="muted">{label}</Text>
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.center} accessible>
      <Text size="xl" weight="semibold" style={styles.centerText}>
        {title}
      </Text>
      {message ? (
        <Text tone="muted" style={styles.centerText}>
          {message}
        </Text>
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
        <Text size="xl" weight="semibold" style={styles.centerText}>
          {title}
        </Text>
        <Text tone="muted" style={styles.centerText}>
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
  centerText: { textAlign: 'center' },
});
