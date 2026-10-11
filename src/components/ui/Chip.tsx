import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

/** Selectable filter chip. 44pt tall hit area; state is announced, not color-only. */
export function Chip({
  label,
  count,
  selected,
  onPress,
  testID,
  disabled = false,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  const name = count === undefined ? label : `${label}, ${count}`;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected, disabled }}
      style={{ minHeight: t.minTouch, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: t.radius.pill,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? t.colors.brand[500] : t.colors.lineStrong,
          backgroundColor: selected ? t.colors.brand[50] : t.colors.surface,
        }}
      >
        {selected ? <Text size="xs" weight="bold" tone="brand">✓</Text> : null}
        <Text size="sm" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'brand' : 'muted'}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text size="xs" weight="semibold" tone="subtle">
            {count}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
