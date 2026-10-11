import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  /** Adds a show/hide toggle (for passwords). */
  secureToggle?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, secureToggle = false, onFocus, onBlur, ...rest },
  ref,
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  const borderColor = error
    ? t.colors.danger.base
    : focused
      ? t.colors.brand[500]
      : t.colors.lineStrong;

  return (
    <View style={styles.wrap}>
      <Text size="sm" weight="medium" tone="muted" nativeID={`${label}-label`}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            minHeight: t.minTouch,
            borderRadius: t.radius.xl,
            borderColor,
            backgroundColor: t.colors.surface,
          },
          focused && { borderWidth: 2 },
        ]}
      >
        <TextInput
          ref={ref}
          {...rest}
          accessibilityLabel={label}
          accessibilityHint={error}
          secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
          placeholderTextColor={t.colors.fgFaint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: t.colors.fg, fontSize: t.typography.lg.fontSize }]}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={8}
            style={[styles.toggle, { minHeight: t.minTouch, minWidth: t.minTouch }]}
          >
            <Text size="sm" weight="semibold" tone="brand">
              {hidden ? 'Show' : 'Hide'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text size="xs" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingLeft: 12 },
  input: { flex: 1, paddingVertical: 10 },
  toggle: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
