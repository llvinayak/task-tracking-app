import React, { useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { resolveColor } from '@/utils/color';

import { BottomSheet } from './BottomSheet';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Small coloured dot. Always paired with text, never the only signal. */
export function Dot({ color, size = 8 }: { color: string | null | undefined; size?: number }) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: resolveColor(color, t.colors.neutral.base),
      }}
    />
  );
}

const initialsOf = (name: string | null | undefined) => {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return (first + second).toUpperCase();
};

/**
 * Person avatar: up to two initials on a contrast-checked background (white text
 * passes AA). The role is never colour only: callers print "Dev"/"QA" text, and
 * the accessible name carries it too.
 */
export function Avatar({
  name,
  kind = 'dev',
  size = 28,
}: {
  name: string | null | undefined;
  kind?: 'dev' | 'qa';
  size?: number;
}) {
  const t = useTheme();
  const scaled = Math.round(size * Math.min(1.3, Math.max(1, PixelRatio.getFontScale())));
  return (
    <View
      accessibilityLabel={`${kind === 'qa' ? 'QA' : 'Dev'}: ${name ?? 'Unassigned'}`}
      accessible
      style={{
        width: scaled,
        height: scaled,
        borderRadius: scaled / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: kind === 'qa' ? t.colors.avatarQa : t.colors.avatarDev,
      }}
    >
      <Text size="2xs" weight="bold" tone="onBrand" maxFontScale={1.2}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/**
 * `semantic="progress"` colours by completion (green >= 75, amber >= 40, brand below);
 * `neutral` is always brand (burndown / time bars where "more" is not "better").
 * `markerPct` draws a thin tick (e.g. ideal remaining).
 */
export function ProgressBar({
  pct,
  label,
  semantic = 'progress',
  markerPct,
  height = 6,
}: {
  pct: number;
  label?: string;
  semantic?: 'progress' | 'neutral';
  markerPct?: number;
  height?: number;
}) {
  const t = useTheme();
  const value = Math.min(100, Math.max(0, Math.round(pct)));
  const color =
    semantic === 'neutral'
      ? t.colors.brand[500]
      : value >= 75
        ? t.colors.success.base
        : value >= 40
          ? t.colors.warning.base
          : t.colors.brand[500];
  const marker = markerPct === undefined ? null : Math.min(100, Math.max(0, markerPct));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Progress'}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={{ height, borderRadius: height / 2, backgroundColor: t.colors.lineStrong, overflow: 'hidden' }}
    >
      <View style={{ width: `${value}%`, height, backgroundColor: color }} />
      {marker !== null ? (
        <View
          style={{
            position: 'absolute',
            left: `${marker}%`,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: t.colors.fg,
          }}
        />
      ) : null}
    </View>
  );
}

const KPI_ICON: Record<string, IconName> = { danger: 'alert-circle', warning: 'warning', success: 'checkmark-circle' };

export function KpiCard({
  label,
  value,
  tone = 'default',
  hint,
  info,
  dense = false,
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'danger' | 'success' | 'warning';
  hint?: string;
  /** Explainer text; adds an "About {label}" info button that opens a small sheet. */
  info?: string;
  /** Compact tile: no hint, smaller value. */
  dense?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const iconName = tone === 'default' ? null : KPI_ICON[tone];
  const content = (
    <>
      <View style={styles.kpiValueRow}>
        {iconName ? <Icon name={iconName} size={16} tone={tone === 'default' ? 'default' : tone} /> : null}
        <Text size={dense ? '2xl' : '3xl'} weight="bold" numeric maxFontScale={1.3} tone={tone === 'default' ? 'default' : tone}>
          {value}
        </Text>
      </View>
      <Text size="xs" tone="muted" weight="medium">
        {label}
      </Text>
      {hint && !dense ? (
        <Text size="2xs" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </>
  );
  const name = `${label}: ${value}${hint && !dense ? `. ${hint}` : ''}`;
  if (!info) {
    return (
      <Card style={styles.kpi} accessible accessibilityLabel={name}>
        {content}
      </Card>
    );
  }
  return (
    <Card style={styles.kpi}>
      <View accessible accessibilityLabel={name} style={styles.kpiBody}>
        {content}
      </View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`About ${label}`}
        style={styles.kpiInfo}
      >
        <Icon name="information-circle-outline" size={20} tone="subtle" />
      </Pressable>
      <BottomSheet visible={open} title={`About ${label}`} onClose={() => setOpen(false)}>
        <Text tone="muted">{info}</Text>
      </BottomSheet>
    </Card>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function SectionHeader({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitle}>
        <Text size="lg" weight="semibold" accessibilityRole="header">
          {title}
        </Text>
        {count !== undefined ? (
          <Text size="sm" weight="semibold" tone="subtle">
            {count}
          </Text>
        ) : null}
      </View>
      {hint ? (
        <Text size="xs" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.segment, { backgroundColor: t.colors.subtle, borderRadius: t.radius.xl, borderWidth: 1, borderColor: t.colors.line }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={[
              styles.segmentItem,
              {
                minHeight: t.minTouch,
                borderRadius: t.radius.lg,
                backgroundColor: selected ? t.colors.surface : t.colors.transparent,
                borderWidth: 1,
                borderColor: selected ? t.colors.fieldBorder : t.colors.transparent,
              },
            ]}
          >
            <Text weight={selected ? 'semibold' : 'medium'} tone={selected ? 'brand' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  kpi: { flexGrow: 1, flexBasis: '45%', minWidth: 140, gap: 2 },
  kpiBody: { gap: 2, paddingRight: 28 },
  kpiValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kpiInfo: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionHeader: { marginTop: 24, marginBottom: 8, gap: 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segment: { flexDirection: 'row', padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
