import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { FontWeight, TypeSize } from '@/theme/tokens';

export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'faint'
  | 'brand'
  | 'danger'
  | 'success'
  | 'warning'
  | 'info'
  | 'onBrand';

export interface TextProps extends RNTextProps {
  size?: TypeSize;
  weight?: FontWeight;
  tone?: TextTone;
}

export function Text({ size = 'base', weight = 'regular', tone = 'default', style, ...rest }: TextProps) {
  const t = useTheme();
  const colorByTone: Record<TextTone, string> = {
    default: t.colors.fg,
    muted: t.colors.fgMuted,
    subtle: t.colors.fgSubtle,
    faint: t.colors.fgFaint,
    brand: t.colors.brand[600],
    danger: t.colors.danger.fg,
    success: t.colors.success.fg,
    warning: t.colors.warning.fg,
    info: t.colors.info.fg,
    onBrand: t.colors.onBrand,
  };
  return (
    <RNText
      {...rest}
      style={[
        { color: colorByTone[tone], fontWeight: t.fontWeights[weight], ...t.typography[size] },
        style,
      ]}
    />
  );
}
