import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type BannerTone = 'danger' | 'warning' | 'info' | 'success';

const DEFAULT_ICON: Record<BannerTone, IconName> = {
  danger: 'alert-circle',
  warning: 'warning',
  info: 'information-circle',
  success: 'checkmark-circle',
};

/** Shown above stale data when a background refetch failed (never replaces the data). */
export function StaleBanner({ message, testID = 'stale-banner' }: { message: string; testID?: string }) {
  return <Banner testID={testID} tone="warning" message={`Couldn't refresh: ${message} Showing the last data.`} />;
}

/** Why an edit action is missing: info banner with a lock. */
export function ReadOnlyNotice({ message, testID }: { message: string; testID?: string }) {
  return <Banner testID={testID} tone="info" icon="lock-closed-outline" message={message} />;
}

/**
 * Inline feedback (form errors, session-expired notice, stale data, read-only).
 * Icon + text so the tone is never colour only. With an action/dismiss the
 * message row is the live region and the buttons stay separately focusable.
 */
export function Banner({
  message,
  tone = 'danger',
  testID,
  icon,
  action,
  onDismiss,
}: {
  message: string;
  tone?: BannerTone;
  testID?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
}) {
  const t = useTheme();
  const c = t.colors[tone];
  const interactive = !!action || !!onDismiss;
  // iOS has no live regions: assertive (danger) banners are spoken when they appear or change.
  useEffect(() => {
    if (tone === 'danger' && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility?.(message);
  }, [tone, message]);
  const a11y = {
    accessibilityRole: 'alert' as const,
    accessibilityLiveRegion: (tone === 'danger' ? 'assertive' : 'polite') as 'assertive' | 'polite',
    accessible: true,
  };
  const row = (
    <View style={styles.row} {...(interactive ? a11y : {})}>
      <Icon name={icon ?? DEFAULT_ICON[tone]} size={20} color={c.fg} />
      <Text size="sm" style={[styles.flex1, { color: c.fg }]}>
        {message}
      </Text>
    </View>
  );
  return (
    <View
      testID={testID}
      {...(interactive ? {} : a11y)}
      style={{
        backgroundColor: c.soft,
        borderColor: c.base,
        borderWidth: 1,
        borderRadius: t.radius.xl,
        padding: t.spacing[3],
        gap: t.spacing[2],
      }}
    >
      {row}
      {interactive ? (
        <View style={styles.actions}>
          {action ? <Button label={action.label} variant="secondary" size="compact" fullWidth={false} onPress={action.onPress} /> : null}
          {onDismiss ? (
            <Button label="Dismiss" variant="ghost" size="compact" fullWidth={false} onPress={onDismiss} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Full-width status strip (offline / running timer) shared shell: no radius,
 * border-bottom, 12x8 padding, icon slot. Content decides its own a11y.
 */
export function StripBanner({
  tone,
  testID,
  children,
  style,
  ...a11y
}: {
  tone: 'warning' | 'brand';
  testID?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessible?: boolean;
  accessibilityRole?: 'alert';
  accessibilityLiveRegion?: 'polite' | 'assertive';
}) {
  const t = useTheme();
  const colors =
    tone === 'warning'
      ? { bg: t.colors.warning.soft, border: t.colors.warning.base }
      : { bg: t.colors.brand[50], border: t.colors.brand[300] };
  return (
    <View
      testID={testID}
      {...a11y}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing[2],
          paddingHorizontal: t.spacing[3],
          paddingVertical: t.spacing[2],
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex1: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
