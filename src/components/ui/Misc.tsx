import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { resolveColor } from '@/utils/color';

import { Card } from './Card';
import { Text } from './Text';

/** Small colored dot. Always paired with text, never the only signal. */
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

export function Avatar({ name, kind = 'dev' }: { name: string | null | undefined; kind?: 'dev' | 'qa' }) {
  const t = useTheme();
  const letter = name?.trim() ? name.trim().charAt(0).toUpperCase() : '?';
  return (
    <View
      accessibilityLabel={`${kind === 'qa' ? 'QA' : 'Dev'}: ${name ?? 'Unassigned'}`}
      accessible
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: kind === 'qa' ? t.colors.success.base : t.colors.brand[600],
      }}
    >
      <Text size="2xs" weight="bold" tone="onBrand">
        {letter}
      </Text>
    </View>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  const t = useTheme();
  const value = Math.min(100, Math.max(0, Math.round(pct)));
  const color = value >= 75 ? t.colors.success.base : value >= 40 ? t.colors.warning.base : t.colors.brand[500];
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Progress'}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={{ height: 6, borderRadius: 3, backgroundColor: t.colors.subtle, overflow: 'hidden' }}
    >
      <View style={{ width: `${value}%`, height: 6, backgroundColor: color }} />
    </View>
  );
}

export function KpiCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'danger' | 'success' | 'warning';
  hint?: string;
}) {
  return (
    <Card style={styles.kpi} accessible accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ''}`}>
      <Text size="3xl" weight="bold" tone={tone === 'default' ? 'default' : tone}>
        {value}
      </Text>
      <Text size="xs" tone="muted" weight="medium">
        {label}
      </Text>
      {hint ? (
        <Text size="2xs" tone="subtle">
          {hint}
        </Text>
      ) : null}
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
      style={[styles.segment, { backgroundColor: t.colors.subtle, borderRadius: t.radius.xl }]}
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
              },
              selected && t.elevation('xs'),
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
  kpi: { flexGrow: 1, flexBasis: '45%', gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionHeader: { marginTop: 24, marginBottom: 8, gap: 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segment: { flexDirection: 'row', padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
