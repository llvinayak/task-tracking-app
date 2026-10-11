import { NavigationRouteContext, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useContext } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StripBanner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Dot } from '@/components/ui/Misc';
import { Text } from '@/components/ui/Text';
import { useElapsedSeconds, useRunningTimer, useTimerActions } from '@/hooks/timer';
import type { RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme/ThemeProvider';
import { formatClock } from '@/utils/time';

/**
 * Running-timer strip shown under every screen header. The 1s tick runs only
 * while this component is mounted AND a timer exists. Screen readers hear the
 * static label (task + project); the clock is hidden from them so it is never
 * announced every second. Start/stop are announced by the mutations.
 */
export function RunningTimerBanner() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useContext(NavigationRouteContext);
  const { data: timer } = useRunningTimer();
  const actions = useTimerActions();
  const seconds = useElapsedSeconds(timer);
  if (!timer) return null;

  // Already looking at this task: the row is not a link.
  const onThisTask =
    route?.name === 'TaskDetail' && (route.params as { taskId?: number } | undefined)?.taskId === timer.task.id;

  return (
    <StripBanner tone="brand" testID="running-timer-banner" style={styles.strip}>
      <Pressable
        onPress={() => nav.navigate('TaskDetail', { taskId: timer.task.id })}
        disabled={onThisTask}
        accessibilityRole="button"
        accessibilityLabel={`Timer running on ${timer.task.title}${timer.task.project ? `, ${timer.task.project.name}` : ''}. Open task`}
        accessibilityState={{ disabled: onThisTask }}
        style={styles.info}
      >
        <View style={styles.titleRow}>
          <Dot color={t.colors.brand[600]} size={8} />
          <Text weight="semibold" numberOfLines={1} style={styles.flex1}>
            {timer.task.title}
          </Text>
        </View>
        {timer.task.project ? (
          <Text size="xs" tone="muted" numberOfLines={1}>
            {timer.task.project.name}
          </Text>
        ) : null}
      </Pressable>
      <Text
        testID="running-timer-clock"
        weight="bold"
        numeric
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {formatClock(seconds)}
      </Text>
      <Button
        label="Stop"
        accessibilityLabel={`Stop timer on ${timer.task.title}`}
        variant="danger"
        size="compact"
        fullWidth={false}
        style={styles.stop}
        loading={actions.stopping}
        disabled={actions.busy}
        onPress={() => actions.stopTimer(timer)}
      />
    </StripBanner>
  );
}

const styles = StyleSheet.create({
  strip: { minHeight: 52, gap: 12 },
  info: { flex: 1, justifyContent: 'center', minHeight: 44 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  stop: { alignSelf: 'center' },
});
