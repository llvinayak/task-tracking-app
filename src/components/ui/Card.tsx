import React from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon } from './Icon';

export interface CardProps extends ViewProps {
  padded?: boolean;
  /** plain: shadow in light, border in dark. flat: border only. interactive: pressable (needs onPress). */
  variant?: 'plain' | 'interactive' | 'flat';
  onPress?: PressableProps['onPress'];
  /** Trailing chevron for interactive cards. */
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ padded = true, variant = 'plain', onPress, chevron = false, style, children, ...rest }: CardProps) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.line,
    borderWidth: 1,
    borderRadius: t.radius.xl,
    padding: padded ? t.spacing[4] : 0,
    // Unpadded cards host rows: a pressed row's background must not bleed past the rounded corners.
    ...(padded ? null : { overflow: 'hidden' as const }),
  };
  // Black shadows are invisible on dark surfaces: dark cards rely on the border.
  const shadow = variant === 'plain' && t.scheme === 'light' ? t.elevation('xs') : null;

  if (variant === 'interactive') {
    const { accessibilityRole, ...pressRest } = rest as ViewProps & PressableProps;
    return (
      <Pressable
        {...pressRest}
        onPress={onPress}
        accessibilityRole={accessibilityRole ?? 'button'}
        style={({ pressed }) => [base, shadow, { backgroundColor: pressed ? t.colors.hover : t.colors.surface }, style as StyleProp<ViewStyle>]}
      >
        {chevron ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
            <View style={{ flex: 1 }}>{children as React.ReactNode}</View>
            <Icon name="chevron-forward" size={20} tone="subtle" />
          </View>
        ) : (
          (children as React.ReactNode)
        )}
      </Pressable>
    );
  }
  return (
    <View {...rest} style={[base, shadow, style]}>
      {children}
    </View>
  );
}
