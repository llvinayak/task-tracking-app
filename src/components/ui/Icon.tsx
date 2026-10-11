import { Ionicons } from '@expo/vector-icons';
import React from 'react';

import { useTheme } from '@/theme/ThemeProvider';

/** Every glyph the app uses (verified against the installed Ionicons glyph map by a test). */
export const ICON_NAMES = [
  'grid', 'grid-outline', 'list', 'list-outline', 'today', 'today-outline',
  'shield-checkmark', 'shield-checkmark-outline', 'ticket', 'ticket-outline', 'flash', 'flash-outline',
  'ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline', 'menu', 'menu-outline', 'log-out-outline',
  'play', 'stop', 'swap-horizontal', 'add', 'search', 'options-outline',
  'chevron-back', 'chevron-forward', 'chevron-down', 'chevron-up', 'close', 'checkmark',
  'calendar-outline', 'time-outline', 'timer-outline', 'alert-circle', 'alert-circle-outline', 'warning',
  'information-circle', 'information-circle-outline', 'checkmark-circle', 'checkmark-circle-outline',
  'checkmark-done-outline', 'lock-closed-outline', 'cloud-offline-outline', 'person-outline', 'bug-outline',
  'globe-outline', 'remove-circle-outline', 'remove', 'arrow-up', 'arrow-down', 'refresh',
  'create-outline', 'close-circle',
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export type IconTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'brand'
  | 'danger'
  | 'warning'
  | 'success'
  | 'info'
  | 'onBrand';

/**
 * Vector icon. Decorative by default (hidden from screen readers; the parent
 * control carries the label). With `label` it becomes an image with that name.
 * Never touchable on its own.
 */
export function Icon({
  name,
  size = 20,
  tone = 'default',
  color,
  label,
}: {
  name: IconName;
  size?: number;
  tone?: IconTone;
  color?: string;
  label?: string;
}) {
  const t = useTheme();
  const byTone: Record<IconTone, string> = {
    default: t.colors.fg,
    muted: t.colors.fgMuted,
    subtle: t.colors.fgSubtle,
    brand: t.colors.brand[600],
    danger: t.colors.danger.fg,
    warning: t.colors.warning.fg,
    success: t.colors.success.fg,
    info: t.colors.info.fg,
    onBrand: t.colors.onBrand,
  };
  const a11y = label
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);
  return <Ionicons name={name} size={size} color={color ?? byTone[tone]} {...a11y} />;
}
