import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const t = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: t.colors.brand[600], fg: t.colors.onBrand, border: t.colors.brand[600] },
    secondary: { bg: t.colors.surface, fg: t.colors.fg, border: t.colors.lineStrong },
    danger: { bg: t.colors.danger.base, fg: t.colors.onBrand, border: t.colors.danger.base },
    ghost: { bg: t.colors.transparent, fg: t.colors.brand[600], border: t.colors.transparent },
  }[variant];

  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: t.minTouch,
          borderRadius: t.radius.xl,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} accessibilityLabel="Loading" />
      ) : (
        <Text size="lg" weight="semibold" style={{ color: palette.fg }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
});
