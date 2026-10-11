import React from 'react';
import { Alert } from 'react-native';

import type { Task } from '@/api/models';
import { Button } from '@/components/ui';
import { isAssignedToTask, useRunningTimer, useTimerActions } from '@/hooks/timer';
import { useAuthStore } from '@/store/authStore';

/**
 * Start / stop the timer straight from a dashboard row. Offered ONLY where the user is a
 * named OWNER of the task (dev / QA / support owner; roster-only assignees are not enough:
 * the dashboard rows carry no assignee list) and never on list cards. It reuses the
 * existing timer mutations (single lock, session-epoch guards, status prompt) untouched.
 * Another running timer needs a native confirmation first because starting stops it.
 */
export function QuickStart({ task }: { task: Task }) {
  const me = useAuthStore((s) => s.user);
  const running = useRunningTimer();
  const actions = useTimerActions();
  if (!me || !isAssignedToTask(task, me.id, undefined)) return null;

  const timer = running.data ?? null;
  const onThisTask = timer?.task.id === task.id;

  if (onThisTask && timer) {
    return (
      <Button
        iconOnly
        icon="stop"
        label="Stop"
        accessibilityLabel={`Stop timer on ${task.title}`}
        variant="secondary"
        inline
        disabled={actions.busy}
        onPress={() => actions.stopTimer(timer)}
      />
    );
  }

  const start = () => actions.startTask(task);
  return (
    <Button
      iconOnly
      icon="play"
      label="Start"
      accessibilityLabel={`Start timer on ${task.title}`}
      variant="secondary"
      inline
      disabled={actions.busy}
      onPress={() => {
        if (!timer) {
          start();
          return;
        }
        Alert.alert(
          'Switch timer?',
          `This stops the timer on "${timer.task.title}" and starts one on "${task.title}".`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Switch', onPress: start },
          ],
        );
      }}
    />
  );
}
