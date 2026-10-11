import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { TaskDetail } from '@/api/models';
import { Button, Card, Dot, EmptyState, ErrorState, LoadingState, ProgressBar, Text } from '@/components/ui';
import { getErrorMessage } from '@/api/errors';
import { isAssignedToTask, useRunningTimer, useTaskSessions, useTimerActions } from '@/hooks/timer';
import { useTaskAssignees } from '@/hooks/queries';
import { useAuthStore } from '@/store/authStore';
import { formatDuration } from '@/utils/time';

export const NOT_ASSIGNED_MESSAGE = "You're not assigned to this task, so you can't track time on it.";

/** Start / Stop for one task. Only people assigned to the task can track time on it. */
export function TimerControl({ task }: { task: TaskDetail }) {
  const me = useAuthStore((s) => s.user);
  const running = useRunningTimer();
  const assignees = useTaskAssignees(task.id);
  const actions = useTimerActions();

  const isOwner = isAssignedToTask(task, me?.id, undefined);
  const assigned = isAssignedToTask(task, me?.id, assignees.data);
  // Named owners need no lookup; everyone else waits for the assignees list.
  if (!isOwner && assignees.isLoading) return null;
  if (!assigned) {
    return (
      <Text size="sm" tone="muted" testID="timer-not-assigned">
        {NOT_ASSIGNED_MESSAGE}
      </Text>
    );
  }

  const timer = running.data ?? null;
  const onThisTask = timer?.task.id === task.id;
  if (onThisTask && timer) {
    return (
      <Button
        label="Stop timer"
        variant="danger"
        fullWidth={false}
        loading={actions.stopping}
        disabled={actions.busy}
        onPress={() => actions.stopTimer(timer)}
      />
    );
  }
  return (
    <View style={styles.col}>
      <Button
        label="Start timer"
        fullWidth={false}
        loading={actions.starting}
        disabled={actions.busy}
        accessibilityHint={timer ? `Starting here stops the timer running on ${timer.task.title}` : undefined}
        onPress={() => actions.startTask(task)}
      />
      {timer ? (
        <Text size="2xs" tone="subtle">
          Starting here stops the timer on &quot;{timer.task.title}&quot;.
        </Text>
      ) : null}
    </View>
  );
}

/** Per-task time: total, per person bars, a "now" marker for people with a running timer. */
export function TaskTimePanel({ taskId }: { taskId: number }) {
  const nav = useNavigation();
  const sessions = useTaskSessions(taskId);
  if (sessions.isLoading) return <LoadingState label="Loading time..." />;
  if (sessions.isError && !sessions.data) {
    return <ErrorState message={getErrorMessage(sessions.error)} onRetry={() => void sessions.refetch()} />;
  }
  const d = sessions.data;
  if (!d || d.byUser.length === 0) {
    return <EmptyState title="No time tracked yet" message="Time appears here once someone starts a timer." />;
  }
  const max = Math.max(1, ...d.byUser.map((u) => u.minutes));
  return (
    <Card style={styles.col} testID="task-time-panel">
      <Button
        label="Open my timesheet"
        variant="secondary"
        fullWidth={false}
        onPress={() => (nav as unknown as { navigate: (n: string) => void }).navigate('Timesheet')}
      />
      <Text size="xs" tone="subtle" weight="semibold">
        TIME TRACKED
      </Text>
      <Text size="2xl" weight="bold">
        {formatDuration(d.totalMinutes)}
      </Text>
      {d.byUser.map((u) => (
        <View key={u.user_id} style={styles.col} testID={`time-user-${u.user_id}`}>
          <View style={styles.between}>
            <View style={styles.row}>
              <Text weight="medium">{u.name}</Text>
              {u.running ? (
                <View style={styles.row} accessible accessibilityLabel={`${u.name} has a timer running now`}>
                  <Dot color={null} size={8} />
                  <Text size="2xs" weight="bold" tone="success">
                    now
                  </Text>
                </View>
              ) : null}
            </View>
            <Text size="sm" weight="semibold">
              {formatDuration(u.minutes)}
            </Text>
          </View>
          <ProgressBar pct={(u.minutes / max) * 100} label={`${u.name}: ${formatDuration(u.minutes)}`} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  col: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
