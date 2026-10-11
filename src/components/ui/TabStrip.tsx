import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ANDROID_TOUCH } from '@/theme/tokens';

import { Text } from './Text';

export interface TabStripItem<K extends string> {
  key: K;
  label: string;
  badge?: number | string;
}

/**
 * Underlined view tabs (Task Detail sections). Selected = 3dp indicator +
 * semibold + brand text. Always a horizontal ScrollView whose content fills the
 * width: tabs share the space evenly on wide screens and scroll (never clip) at
 * 320dp or large text.
 */
export function TabStrip<K extends string>({
  tabs,
  value,
  onChange,
  bleed = 0,
}: {
  tabs: readonly TabStripItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Negative horizontal margin = the parent's horizontal padding, so the strip runs edge to edge (no gutters). */
  bleed?: number;
}) {
  const t = useTheme();
  const scroller = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  // When the strip scrolls, keep the selected tab in view (the cut-off tab is the "there is more" cue).
  useEffect(() => {
    const l = layouts.current[value];
    if (l) scroller.current?.scrollTo({ x: Math.max(0, l.x - 16), animated: true });
  }, [value]);
  return (
    <View
      accessibilityRole="tablist"
      style={{ backgroundColor: t.colors.surface, borderBottomColor: t.colors.line, borderBottomWidth: 1, marginHorizontal: -bleed }}
    >
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {tabs.map((tab) => {
          const selected = tab.key === value;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              onLayout={(e) => {
                layouts.current[tab.key] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
              }}
              accessibilityRole="tab"
              accessibilityLabel={tab.badge !== undefined ? `${tab.label}, ${tab.badge}` : tab.label}
              accessibilityState={{ selected }}
              style={[styles.tab, { minHeight: ANDROID_TOUCH, paddingHorizontal: t.spacing[3] }]}
            >
              <View style={styles.labelRow}>
                <Text size="sm" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'brand' : 'subtle'} numberOfLines={1}>
                  {tab.label}
                </Text>
                {tab.badge !== undefined ? (
                  <Text size="2xs" weight="semibold" tone="subtle">
                    {tab.badge}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.indicator, { backgroundColor: selected ? t.colors.indicator : t.colors.transparent }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 1 },
  tab: { flexGrow: 1, flexShrink: 0, alignItems: 'center', justifyContent: 'flex-end' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 12 },
  indicator: { height: 3, alignSelf: 'stretch', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
});
