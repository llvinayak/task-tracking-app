import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Toggle FILTER chip (not a tab, not an action). 44pt hit area around a 36pt pill;
 * the selected state is a thicker border + check icon + semibold, never colour only.
 */
export function Chip({
  label,
  count,
  selected,
  onPress,
  testID,
  disabled = false,
  role = 'button',
  accessibilityLabel,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  /** `radio` when used inside ChoiceChips (single-select group). */
  role?: 'button' | 'radio';
  /** Longer accessible name; must contain the visible label (Label in Name). */
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const name = count === undefined ? label : `${label}, ${count}`;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? name}
      // Radio-style chips must expose `checked` (selected alone is not announced as a radio state).
      accessibilityState={role === 'radio' ? { selected, checked: selected, disabled } : { selected, disabled }}
      style={{ minHeight: t.minTouch, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={[
          styles.pill,
          {
            borderRadius: t.radius.pill,
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? t.colors.brand[500] : t.colors.fieldBorder,
            backgroundColor: selected ? t.colors.brand[50] : t.colors.surface,
          },
        ]}
      >
        {selected ? <Icon name="checkmark" size={16} tone="brand" /> : null}
        <Text size="sm" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'brand' : 'muted'}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text size="xs" weight="semibold" tone={selected ? 'brand' : 'subtle'}>
            {count}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12 },
});
