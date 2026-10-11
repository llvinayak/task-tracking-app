import React, { forwardRef, useId, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon, type IconName } from './Icon';
import { Text, useFontFace } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  /** Adds a show/hide toggle (for passwords). */
  secureToggle?: boolean;
  /** Visual " (optional)" mark after the label; the accessible name stays `label`. */
  optional?: boolean;
  helper?: string;
  /** `true` uses `maxLength`; a number sets the limit. Shown once >= 80% of the limit. */
  counter?: boolean | number;
  leadingIcon?: IconName;
  trailing?: React.ReactNode;
  /** Minimum visible lines for multiline fields (default 3). */
  numberOfLinesMin?: number;
  /** Keep the label for screen readers but do not draw it (compact toolbars: the placeholder says what the field is). */
  hideLabel?: boolean;
}

const LINE = 22;

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    secureToggle = false,
    optional = false,
    helper,
    counter,
    leadingIcon,
    trailing,
    numberOfLinesMin = 3,
    hideLabel = false,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const t = useTheme();
  const labelId = useId();
  const face = useFontFace('regular');
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  const editable = rest.editable !== false;
  const bw = focused || error ? 2 : 1;
  // Focus/error thickens the border from 1 to 2dp; the padding gives that dp back so text never shifts.
  const pad = t.spacing[3] + 1 - bw;
  const borderColor = !editable
    ? t.colors.line
    : error
      ? t.colors.danger.base
      : focused
        ? t.colors.fieldBorderFocus
        : t.colors.fieldBorder;
  const hasTail = secureToggle || !!trailing;
  const limit = typeof counter === 'number' ? counter : counter ? rest.maxLength : undefined;
  const length = rest.value?.length ?? 0;
  const showCounter = limit !== undefined && length >= limit * 0.8;
  const multiline = !!rest.multiline;

  return (
    <View style={styles.wrap}>
      <View style={[styles.labelRow, hideLabel && styles.hidden]}>
        <Text size="sm" weight="medium" tone="muted" nativeID={labelId}>
          {label}
        </Text>
        {optional ? (
          <Text size="sm" tone="subtle">
            (optional)
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.field,
          {
            minHeight: multiline ? numberOfLinesMin * LINE + 20 : t.minTouch,
            borderRadius: t.radius.xl,
            borderColor,
            borderWidth: bw,
            paddingLeft: pad,
            paddingRight: hasTail ? 0 : pad,
            backgroundColor: editable ? t.colors.surface : t.colors.subtle,
          },
          multiline && styles.fieldMultiline,
        ]}
      >
        {leadingIcon ? (
          <View style={styles.leading}>
            <Icon name={leadingIcon} size={20} tone="subtle" />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          {...rest}
          accessibilityLabel={label}
          accessibilityHint={error}
          secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
          placeholderTextColor={t.colors.placeholder}
          selectionColor={t.colors.brand[500]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: editable ? t.colors.fg : t.colors.fgMuted,
              fontSize: t.typography.lg.fontSize,
              lineHeight: t.typography.lg.lineHeight,
              paddingVertical: t.spacing[3] - 2 - bw,
              ...face,
            },
            multiline && { maxHeight: 160, textAlignVertical: 'top' },
          ]}
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
        {trailing}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Icon name="alert-circle" size={16} tone="danger" />
          <Text size="xs" tone="danger" accessibilityLiveRegion="polite" style={styles.flex1}>
            {error}
          </Text>
        </View>
      ) : null}
      {helper && !error ? (
        <Text size="xs" tone="subtle">
          {helper}
        </Text>
      ) : null}
      {showCounter ? (
        <Text size="xs" tone={length >= (limit ?? Infinity) ? 'danger' : 'subtle'} style={styles.counter}>
          {length}/{limit}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hidden: { height: 0, overflow: 'hidden' },
  field: { flexDirection: 'row', alignItems: 'center' },
  fieldMultiline: { alignItems: 'flex-start' },
  leading: { paddingRight: 8 },
  input: { flex: 1 },
  toggle: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flex1: { flex: 1 },
  counter: { textAlign: 'right' },
});
