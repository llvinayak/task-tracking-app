import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { resolveColor } from '@/utils/color';

import { Badge } from './Badge';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Status = coloured dot (data colour) + text label, so it never relies on colour alone. */
export function StatusBadge({
  label,
  color,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  color?: string | null;
  /** When set (task-move) a chevron is shown and the whole badge is a 44dp touch target. */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const body = (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing[1],
        minHeight: 22,
        paddingHorizontal: t.spacing[2],
        paddingVertical: t.spacing[0.5],
        borderWidth: 1,
        borderColor: t.colors.line,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.subtle,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: resolveColor(color, t.colors.neutral.base) }}
      />
      <Text size="2xs" weight="semibold" tone="muted" numberOfLines={1} maxFontScale={1.3}>
        {label}
      </Text>
      {onPress ? <Icon name="chevron-down" size={12} tone="muted" /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 11, bottom: 11 }}
      style={{ alignSelf: 'flex-start' }}
    >
      {body}
    </Pressable>
  );
}

const PRIORITY_ICON: Record<string, IconName> = {
  CRITICAL: 'alert-circle',
  HIGH: 'arrow-up',
  MEDIUM: 'remove',
  LOW: 'arrow-down',
};
const PRIORITY_TONE_MAP = { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'info', LOW: 'neutral' } as const;

/**
 * Priority = icon + word. In cards (`compact`) High/Critical are tone badges and
 * Medium/Low are neutral outlines, so the level is never carried by colour.
 */
export function PriorityBadge({ priority, label, compact = false }: { priority: string; label: string; compact?: boolean }) {
  const key = priority.toUpperCase() as keyof typeof PRIORITY_TONE_MAP;
  const tone = PRIORITY_TONE_MAP[key] ?? 'neutral';
  const loud = key === 'CRITICAL' || key === 'HIGH';
  return (
    <Badge
      label={label}
      icon={PRIORITY_ICON[key] ?? 'remove'}
      tone={compact && !loud ? 'neutral' : tone}
      variant={compact && !loud ? 'outline' : 'soft'}
    />
  );
}

/** One flag row at the top of a card: icon + text in the tone colour. */
export function FlagLine({ label, tone = 'danger' }: { label: string; tone?: 'danger' | 'warning' }) {
  const t = useTheme();
  const c = t.colors[tone].fg;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[1] }}>
      <Icon name={tone === 'danger' ? 'alert-circle' : 'warning'} size={16} color={c} />
      <Text size="sm" weight="semibold" style={{ color: c }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
