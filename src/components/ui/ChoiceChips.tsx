import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip } from './Chip';

/** Single-select group (severity, role, view mode). Items are `radio`s inside a `radiogroup`. */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string; testID?: string; accessibilityLabel?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  accessibilityLabel?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          role="radio"
          label={o.label}
          testID={o.testID}
          {...(o.accessibilityLabel ? { accessibilityLabel: o.accessibilityLabel } : {})}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 } });
