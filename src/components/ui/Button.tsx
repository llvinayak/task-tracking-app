import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'ghost';

interface ButtonBase {
  /** Static visible text (<= 24 chars, never an object name). Put the object in `accessibilityLabel`. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'compact';
  icon?: IconName;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Sits inside a row: no self alignment (the row's alignItems decides), instead of top-aligning. */
  inline?: boolean;
  /** Accessible name. Must start with / contain the visible `label` (Label in Name). Defaults to `label`. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Icon-only buttons have no visible text, so the accessible name is REQUIRED (type-level). */
export type ButtonProps = ButtonBase &
  ({ iconOnly?: false } | { iconOnly: true; accessibilityLabel: string });

export function Button(props: ButtonProps) {
  return <ButtonImpl {...props} />;
}

function ButtonImpl({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'start',
  iconOnly = false,
  loading = false,
  disabled = false,
  fullWidth = true,
  inline = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonBase & { iconOnly?: boolean }) {
  if (__DEV__ && iconOnly && !accessibilityLabel) {
    console.warn('Button iconOnly needs an accessibilityLabel');
  }
  const t = useTheme();
  const inactive = disabled || loading;
  const compact = size === 'compact';

  const palette = {
    primary: { bg: t.colors.brand[600], pressed: t.colors.brand[700], ripple: t.colors.rippleOnBrand, fg: t.colors.onBrand, border: t.colors.brand[600] },
    secondary: { bg: t.colors.surface, pressed: t.colors.hover, ripple: t.colors.ripple, fg: t.colors.fg, border: t.colors.fieldBorder },
    danger: { bg: t.colors.danger.base, pressed: t.colors.danger.fg, ripple: t.colors.rippleOnBrand, fg: t.colors.onBrand, border: t.colors.danger.base },
    dangerOutline: { bg: t.colors.transparent, pressed: t.colors.danger.soft, ripple: t.colors.ripple, fg: t.colors.danger.fg, border: t.colors.danger.base },
    ghost: { bg: t.colors.transparent, pressed: t.colors.hover, ripple: t.colors.ripple, fg: t.colors.brand[600], border: t.colors.transparent },
  }[variant];

  const textSize = compact ? 'sm' : 'lg';
  const iconSize = compact ? 16 : 20;
  const iconTone = variant === 'primary' || variant === 'danger' ? 'onBrand' : variant === 'dangerOutline' ? 'danger' : variant === 'ghost' ? 'brand' : 'default';

  const glyph = icon ? <Icon name={icon} size={iconSize} tone={iconTone} /> : null;
  const labelNode = (
    <Text size={textSize} weight="semibold" numberOfLines={1} maxFontScale={compact ? 1.3 : undefined} style={{ color: palette.fg }}>
      {label}
    </Text>
  );

  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      // Compact buttons are 36dp tall; hitSlop restores the 44dp touch area (all sides when icon-only).
      hitSlop={compact ? (iconOnly ? { top: 4, bottom: 4, left: 4, right: 4 } : { top: 4, bottom: 4 }) : undefined}
      // Alpha ripple on Android (the control colour stays visible); iOS uses the pressed background.
      android_ripple={Platform.OS === 'android' ? { color: palette.ripple, borderless: false } : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: compact ? 36 : t.minTouch,
          minWidth: iconOnly ? (compact ? 36 : t.minTouch) : undefined,
          borderRadius: t.radius.xl,
          backgroundColor: pressed && !inactive && Platform.OS !== 'android' ? palette.pressed : palette.bg,
          borderColor: palette.border,
          // Only DISABLED fades; loading keeps full strength so a busy primary action does not look unavailable.
          opacity: disabled ? 0.55 : 1,
          paddingHorizontal: iconOnly ? 0 : compact ? t.spacing[3] : t.spacing[4],
          paddingVertical: compact ? t.spacing[1] : t.spacing[3] - 2,
          alignSelf: inline ? undefined : fullWidth && !iconOnly ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {/* Keep the width while loading: the content stays laid out, hidden, under the spinner. */}
      <View style={[styles.content, loading && styles.hidden]}>
        {iconOnly ? (
          glyph
        ) : (
          <>
            {iconPosition === 'start' ? glyph : null}
            {labelNode}
            {iconPosition === 'end' ? glyph : null}
          </>
        )}
      </View>
      {loading ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.spinner}>
            <ActivityIndicator color={palette.fg} accessibilityLabel="Loading" />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hidden: { opacity: 0 },
  spinner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
