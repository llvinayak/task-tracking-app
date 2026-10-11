import React from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ANDROID_TOUCH } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Standard list row: leading slot, 2-line title, 1-line subtitle, optional meta
 * and trailing content, hairline divider. 56dp minimum.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  onPress,
  chevron = false,
  accessibilityLabel,
  testID,
  selected,
  divider = true,
  style,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  selected?: boolean;
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const body = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text weight="medium" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta}
      </View>
      {trailing}
      {chevron ? <Icon name="chevron-forward" size={20} tone="subtle" /> : null}
    </>
  );
  const rowStyle = {
    minHeight: 56,
    borderBottomColor: t.colors.divider,
    borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
  };
  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        style={[styles.row, rowStyle, style]}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.row, rowStyle, pressed && { backgroundColor: t.colors.hover }, style]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Shared card shell for Task/Ticket/Sprint/QA cards: 4dp accent bar, header slot
 * (code + flag), title (2 lines), meta rows, footer slot. The main area is ONE
 * Pressable; footer actions are siblings, never nested inside it.
 */
export function EntityCard({
  accent = 'neutral',
  header,
  title,
  meta,
  footer,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  accent?: 'neutral' | 'brand' | 'danger' | 'warning' | 'success' | 'info';
  header?: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  footer?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const t = useTheme();
  const accentColor = accent === 'brand' ? t.colors.brand[500] : t.colors[accent].base;
  const main = (
    <View style={styles.cardBody}>
      {header}
      <Text size="lg" weight="semibold" numberOfLines={2}>
        {title}
      </Text>
      {meta}
    </View>
  );
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: t.colors.surface,
          borderColor: t.colors.line,
          borderRadius: t.radius.xl,
        },
        t.scheme === 'light' ? t.elevation('xs') : null,
      ]}
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.cardContent}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            style={({ pressed }) => pressed && { backgroundColor: t.colors.hover }}
          >
            {main}
          </Pressable>
        ) : (
          main
        )}
        {footer}
      </View>
    </View>
  );
}

/**
 * Single-select row for pickers (project, assignee, status). Selected = trailing
 * check icon + visible "Selected" text + semibold label (never colour only).
 */
export function OptionRow({
  label,
  description,
  leading,
  selected,
  onPress,
  disabled = false,
  testID,
  accessibilityLabel,
  role = 'radio',
}: {
  label: string;
  description?: string;
  leading?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  /** `button` for pickers whose choice is an immediate action (e.g. Move to). */
  role?: 'radio' | 'button';
}) {
  const t = useTheme();
  const minHeight = Platform.OS === 'android' ? ANDROID_TOUCH : t.minTouch;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={role === 'radio' ? { selected, checked: selected, disabled } : { selected, disabled }}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight,
          borderBottomColor: t.colors.divider,
          borderBottomWidth: StyleSheet.hairlineWidth,
          opacity: disabled ? 0.5 : 1,
          backgroundColor: pressed ? t.colors.hover : t.colors.transparent,
        },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text weight={selected ? 'semibold' : 'medium'}>{label}</Text>
        {description ? (
          <Text size="xs" tone="subtle">
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        // The state is announced through accessibilityState (selected/checked): the visible word is not read twice.
        <View style={styles.selected} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="checkmark" size={20} tone="brand" />
          <Text size="sm" weight="semibold" tone="brand">
            Selected
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  leading: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  accent: { width: 4 },
  cardContent: { flex: 1 },
  cardBody: { padding: 12, gap: 8 },
});
