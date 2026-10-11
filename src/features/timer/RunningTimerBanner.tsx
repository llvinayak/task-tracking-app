import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Dot, Text } from '@/components/ui';
import { useElapsedSeconds, useRunningTimer, useTimerActions } from '@/hooks/timer';
import type { RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme/ThemeProvider';
import { formatClock } from '@/utils/time';

/**
 * Persistent running-timer strip above the tab bar. The 1s tick runs only while
 * this component is mounted AND a timer exists. Screen readers hear the static
 * label (task + project); the clock is hidden from them so it is never
 * announced every second. Start/stop are announced by the mutations.
 */
export function RunningTimerBanner() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: timer } = useRunningTimer();
  const actions = useTimerActions();
  const seconds = useElapsedSeconds(timer);
  if (!timer) return null;

  return (
    <View
      testID="running-timer-banner"
      style={[styles.bar, { backgroundColor: t.colors.brand[50], borderTopColor: t.colors.brand[300], minHeight: t.minTouch + 8 }]}
    >
      <Pressable
        onPress={() => nav.navigate('TaskDetail', { taskId: timer.task.id })}
        accessibilityRole="button"
        accessibilityLabel={`Timer running on ${timer.task.title}${timer.task.project ? `, ${timer.task.project.name}` : ''}. Open task`}
        style={[styles.info, { minHeight: t.minTouch }]}
      >
        <Text weight="semibold" numberOfLines={1}>
          {timer.task.title}
        </Text>
        <View style={styles.meta}>
          {timer.task.project ? <Dot color={timer.task.project.color} size={6} /> : null}
          {timer.task.project ? (
            <Text size="2xs" tone="subtle" numberOfLines={1} style={styles.project}>
              {timer.task.project.name}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Text
        testID="running-timer-clock"
        weight="bold"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.clock}
      >
        {formatClock(seconds)}
      </Text>
      <Pressable
        onPress={() => actions.stopTimer(timer)}
        disabled={actions.busy}
        accessibilityRole="button"
        accessibilityLabel={`Stop timer on ${timer.task.title}`}
        accessibilityState={{ disabled: actions.busy, busy: actions.stopping }}
        style={[
          styles.stop,
          { minHeight: t.minTouch, minWidth: t.minTouch, backgroundColor: t.colors.danger.base, borderRadius: t.radius.xl, opacity: actions.busy ? 0.6 : 1 },
        ]}
      >
        <Text weight="bold" tone="onBrand">
          {actions.stopping ? '...' : 'Stop'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 4, borderTopWidth: 1 },
  info: { flex: 1, justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  project: { flexShrink: 1 },
  clock: { fontVariant: ['tabular-nums'] },
  stop: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
});
