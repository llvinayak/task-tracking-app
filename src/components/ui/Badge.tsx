import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

/**
 * 12px semibold pill. `outline` is a neutral bordered pill for secondary facts
 * (type, medium/low priority) so colour never carries the meaning alone.
 */
export function Badge({
  label,
  tone = 'neutral',
  icon,
  variant = 'soft',
}: {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  variant?: 'soft' | 'outline';
}) {
  const t = useTheme();
  const soft =
    tone === 'brand'
      ? { bg: t.colors.brand[50], fg: t.colors.brand[700] }
      : { bg: t.colors[tone].soft, fg: t.colors[tone].fg };
  const c = variant === 'outline' ? { bg: t.colors.transparent, fg: t.colors.neutral.fg } : soft;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing[1],
        minHeight: 22,
        backgroundColor: c.bg,
        borderRadius: t.radius.pill,
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: t.colors.fieldBorder,
        paddingHorizontal: t.spacing[2],
        paddingVertical: t.spacing[0.5],
      }}
    >
      {icon ? <Icon name={icon} size={12} color={c.fg} /> : null}
      <Text size="2xs" weight="semibold" numberOfLines={1} maxFontScale={1.3} style={{ color: c.fg, flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}
