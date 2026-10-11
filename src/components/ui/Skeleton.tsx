import React, { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { animationsEnabled } from '@/lib/motion';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

/**
 * ONE shared pulse value for every skeleton on screen. The loop starts with the
 * first mounted skeleton and stops with the last one, so nothing keeps running
 * after a screen finishes loading. Static (opacity 0.8) under reduce-motion and Jest.
 */
const pulse = new Animated.Value(1);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function usePulse(): Animated.Value | number {
  const reduced = useReducedMotion();
  const animate = animationsEnabled() && !reduced;
  useEffect(() => {
    if (!animate) return;
    users += 1;
    if (users === 1) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.55, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
    }
    return () => {
      users -= 1;
      if (users === 0) {
        loop?.stop();
        loop = null;
        pulse.setValue(1);
      }
    };
  }, [animate]);
  return animate ? pulse : 0.8;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const t = useTheme();
  const opacity = usePulse();
  return (
    <Animated.View
      style={{
        width,
        height,
        opacity,
        borderRadius: radius ?? t.radius.lg,
        backgroundColor: t.colors.subtle,
        borderWidth: 1,
        borderColor: t.colors.line,
      }}
    />
  );
}

export function SkeletonText({ lines = 2, lastWidth = '60%' }: { lines?: number; lastWidth?: DimensionValue }) {
  return (
    <View style={styles.text}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </View>
  );
}

/**
 * Loading wrapper with the same accessible name and findable text the old
 * spinner had ("Loading tasks..."). The Text is visually hidden.
 */
export function SkeletonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={styles.group}>
      <Text style={styles.hiddenLabel}>
        {label}
      </Text>
      {children}
    </View>
  );
}

type CardVariant = 'task' | 'ticket' | 'sprint' | 'row';

function SkeletonCard({ variant }: { variant: CardVariant }) {
  const t = useTheme();
  if (variant === 'row') {
    return (
      <View style={[styles.row, { borderBottomColor: t.colors.divider }]}>
        <Skeleton width={40} height={40} radius={t.radius.pill} />
        <View style={styles.flex1}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={12} width="45%" />
        </View>
      </View>
    );
  }
  const lines = variant === 'task' ? 3 : 2;
  return (
    <View style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.line, borderRadius: t.radius.xl }]}>
      <Skeleton height={12} width="35%" />
      <Skeleton height={18} width="90%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === 0 ? '55%' : '75%'} />
      ))}
    </View>
  );
}

export function SkeletonCards({
  count = 4,
  variant = 'task',
  label,
}: {
  count?: number;
  variant?: CardVariant;
  label: string;
}) {
  return (
    <SkeletonGroup label={label}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} variant={variant} />
      ))}
    </SkeletonGroup>
  );
}

export function SkeletonKpiGrid({ count = 4, label }: { count?: number; label: string }) {
  return (
    <SkeletonGroup label={label}>
      <View style={styles.kpis}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={styles.kpi}>
            <Skeleton height={56} radius={12} />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

/** Dashboard-style first load: a KPI strip then two list sections (one accessible loading group). */
export function SkeletonSections({ label, sections = 2 }: { label: string; sections?: number }) {
  return (
    <SkeletonGroup label={label}>
      <View style={styles.kpis}>
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={styles.kpi}>
            <Skeleton height={56} radius={12} />
          </View>
        ))}
      </View>
      {Array.from({ length: sections }, (_, i) => (
        <View key={i} style={styles.group}>
          <Skeleton height={18} width="40%" />
          <SkeletonCard variant="row" />
          <SkeletonCard variant="row" />
        </View>
      ))}
    </SkeletonGroup>
  );
}

export function SkeletonDetailHeader({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label}>
      <Skeleton height={12} width="30%" />
      <Skeleton height={22} width="85%" />
      <View style={styles.badges}>
        <Skeleton height={22} width={80} radius={999} />
        <Skeleton height={22} width={64} radius={999} />
      </View>
      <Skeleton height={44} radius={12} />
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  text: { gap: 8 },
  hiddenLabel: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  card: { borderWidth: 1, padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  flex1: { flex: 1, gap: 8 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexGrow: 1, flexBasis: '45%' },
  badges: { flexDirection: 'row', gap: 8 },
});
