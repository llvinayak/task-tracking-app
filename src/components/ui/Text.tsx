import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useFontsLoaded, useTheme } from '@/theme/ThemeProvider';
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
  /** `faint` is for disabled labels and decorative glyphs only; it never carries content. */
  tone?: TextTone;
  /** Caps system font scaling for tight elements (tab labels 1.15, badges 1.3 ...). */
  maxFontScale?: number;
  /** Tabular figures for clocks, durations, KPI values. */
  numeric?: boolean;
}

/** Font face for a weight: Inter family once loaded (Android: no fontWeight), else system font + fontWeight. */
export function useFontFace(weight: FontWeight = 'regular') {
  const t = useTheme();
  const fontsLoaded = useFontsLoaded();
  return fontsLoaded ? { fontFamily: t.fontFamilies[weight] } : { fontWeight: t.fontWeights[weight] };
}

export function Text({
  size = 'base',
  weight = 'regular',
  tone = 'default',
  maxFontScale,
  numeric = false,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();
  const face = useFontFace(weight);
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
  // Android needs one family per weight; setting fontWeight on top would synthesise bold.
  return (
    <RNText
      {...rest}
      {...(maxFontScale !== undefined ? { maxFontSizeMultiplier: maxFontScale } : {})}
      style={[
        { color: colorByTone[tone], ...face, ...t.typography[size] },
        numeric && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
