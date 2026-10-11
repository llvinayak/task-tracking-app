import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const t = useTheme();
  const c =
    tone === 'brand'
      ? { bg: t.colors.brand[50], fg: t.colors.brand[700] }
      : { bg: t.colors[tone].soft, fg: t.colors[tone].fg };
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderRadius: t.radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text size="2xs" weight="semibold" style={{ color: c.fg }}>
        {label}
      </Text>
    </View>
  );
}
