import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getErrorMessage, isAppError } from '@/api/errors';
import type { Assignee, TaskStatusConfig } from '@/api/models';
import { getTaskStatuses } from '@/api/projectsApi';
import { serverNowMs } from '@/api/serverClock';
import { hapticImpact } from '@/lib/haptics';
import { getRunningTimer, getTaskSessions, startTimer, stopTimer, type RunningTimer } from '@/api/timeApi';
import { useToast } from '@/components/ui';
import { currentEpoch, isEpochStale } from './sessionMutation';
import { useAuthStore } from '@/store/authStore';
import { useTimerPromptStore } from '@/store/uiStores';
import { elapsedSeconds, formatDuration } from '@/utils/time';
import { getTimerPrompt, type PromptTask } from '@/utils/timerPrompt';

import { dailyKeys } from './dailyReport';
import { keys } from './queries';

export const RUNNING_POLL_MS = 60_000;
/** Warnings (e.g. "task is already PASS") stay up long enough to read. */
export const WARNING_TOAST_MS = 7_000;

/** ['running-timer']: null | session. Polls while the app is active, refetches on foreground/reconnect. */
export function useRunningTimer() {
  return useQuery({
    queryKey: keys.runningTimer,
    queryFn: getRunningTimer,
    refetchInterval: RUNNING_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
}

export function useTaskSessions(taskId: number) {
  return useQuery({ queryKey: keys.taskSessions(taskId), queryFn: () => getTaskSessions(taskId) });
}

/**
 * Milliseconds "now". Ticks once a second ONLY while `enabled` (a clock is
 * visible) and is recomputed immediately when the app returns to foreground.
 */
export function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [enabled]);
  return now;
}

/** Elapsed seconds of a running timer, always derived from started_at (+ server skew). */
export function useElapsedSeconds(timer: RunningTimer | null | undefined): number {
  const now = useNow(!!timer);
  if (!timer) return 0;
  return elapsedSeconds(timer.started_at, serverNowMs(now), 0);
}

export { useTimerPromptStore };

async function loadConfig(qc: QueryClient): Promise<TaskStatusConfig[] | undefined> {
  const cached = qc.getQueryData<TaskStatusConfig[]>(keys.taskStatuses);
  if (cached) return cached;
  try {
    return await qc.fetchQuery({ queryKey: keys.taskStatuses, queryFn: getTaskStatuses, staleTime: 5 * 60 * 1000 });
  } catch {
    return undefined; // no prompt rather than a wrong one
  }
}

/**
 * Timer start/stop changes tracked time, so everything derived from it must be
 * refetched: the running timer, task lists/details/sessions, dashboards, AND
 * the My Day report + pending badge (a cached day must never hide newer time).
 */
export function refreshTimerState(qc: QueryClient, taskIds: (number | null | undefined)[] = []) {
  void qc.invalidateQueries({ queryKey: keys.runningTimer });
  void qc.invalidateQueries({ queryKey: keys.tasksRoot });
  void qc.invalidateQueries({ queryKey: keys.dashboardRoot });
  void qc.invalidateQueries({ queryKey: dailyKeys.root });
  void qc.invalidateQueries({ queryKey: dailyKeys.pending });
  for (const id of taskIds) {
    if (id) {
      void qc.invalidateQueries({ queryKey: keys.taskSessions(id) });
      void qc.invalidateQueries({ queryKey: keys.task(id) });
    }
  }
}

const TIMER_KEY = ['timer'] as const;

/** Module-level on purpose: shared by every Start/Stop button (see useTimerActions). Released in the MUTATION's onSettled, which still runs if the screen unmounts. */
let timerLock = false;

/** One flag for start AND stop, wherever the buttons are (banner, task detail). */
export function useTimerBusy(): boolean {
  return useIsMutating({ mutationKey: TIMER_KEY }) > 0;
}

export function useStartTimer() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useAuthStore((s) => s.user);
  const showPrompt = useTimerPromptStore((s) => s.show);

  return useMutation({
    mutationKey: TIMER_KEY,
    mutationFn: (v: { task: PromptTask }) => startTimer(v.task.id),
    onSettled: () => {
      timerLock = false;
    },
    onMutate: () => ({
      previous: qc.getQueryData<RunningTimer | null>(keys.runningTimer) ?? null,
      epoch: currentEpoch(),
    }),
    onSuccess: (res, v, ctx) => {
      if (isEpochStale(ctx?.epoch)) return; // signed out meanwhile: touch nothing
      timerLock = false; // the buttons are free as soon as the server said yes
      hapticImpact('medium');
      refreshTimerState(qc, [v.task.id, res.stopped?.taskId]);
      let message = 'Timer started';
      if (res.stopped) {
        const title = res.stopped.title ?? ctx?.previous?.task.title ?? 'previous task';
        message = `Stopped "${title}" · started this one`;
      }
      // One toast slot: keep the warning visible for longer than a normal toast.
      toast.show(res.warning ? `${message}
${res.warning}` : message, res.warning ? 'info' : 'success', res.warning ? WARNING_TOAST_MS : undefined);

      // The config-dependent prompt runs AFTER the mutation has settled: loading the
      // config (possibly slow or offline) must not keep Start/Stop disabled.
      void (async () => {
        try {
          const config = await loadConfig(qc);
          // The user may have signed out (or someone else signed in) while we waited.
          if (isEpochStale(ctx?.epoch)) return;
          const prompt = getTimerPrompt({
            event: 'start',
            task: v.task,
            user: me ? { id: me.id, roleId: me.roleId } : null,
            config,
          });
          if (prompt) showPrompt(prompt);
        } catch {
          /* no config, no prompt */
        }
      })();
    },
    onError: (err, _v, ctx) => {
      if (isEpochStale(ctx?.epoch)) return;
      // ANY failure (timeout and network included) may have changed server state
      // (the request can succeed server-side and still fail to answer): re-sync.
      void qc.invalidateQueries({ queryKey: keys.runningTimer });
      void qc.invalidateQueries({ queryKey: dailyKeys.root });
      toast.show(getErrorMessage(err), 'danger');
    },
  });
}

export function useStopTimer() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useAuthStore((s) => s.user);
  const showPrompt = useTimerPromptStore((s) => s.show);

  return useMutation({
    mutationKey: TIMER_KEY,
    mutationFn: (_v: { timer: RunningTimer }) => stopTimer(),
    onSettled: () => {
      timerLock = false;
    },
    onMutate: () => ({ epoch: currentEpoch() }),
    onSuccess: (res, v, ctx) => {
      if (isEpochStale(ctx?.epoch)) return;
      timerLock = false;
      hapticImpact('medium');
      qc.setQueryData<RunningTimer | null>(keys.runningTimer, null);
      refreshTimerState(qc, [v.timer.task.id]);
      const message = `Timer stopped · ${formatDuration(res.duration_minutes)} logged`;
      toast.show(message, 'success');

      // Prefer the freshest status we know for this task.
      const cachedStatus = qc.getQueryData<{ status: string }>(keys.task(v.timer.task.id))?.status;
      const t = v.timer.task;
      void (async () => {
        try {
          const config = await loadConfig(qc);
          if (isEpochStale(ctx?.epoch)) return;
          const prompt = getTimerPrompt({
            event: 'stop',
            task: { ...t, status: cachedStatus ?? t.status },
            user: me ? { id: me.id, roleId: me.roleId } : null,
            config,
          });
          if (prompt) showPrompt(prompt);
        } catch {
          /* no config, no prompt */
        }
      })();
    },
    onError: (err, _v, ctx) => {
      if (isEpochStale(ctx?.epoch)) return;
      // Always re-sync: a 404 means "already stopped", but a timeout may have stopped it too.
      void qc.invalidateQueries({ queryKey: keys.runningTimer });
      void qc.invalidateQueries({ queryKey: dailyKeys.root });
      if (isAppError(err) && err.status === 404) {
        // 'You have no timer running.' -> it is already stopped.
        qc.setQueryData<RunningTimer | null>(keys.runningTimer, null);
        toast.show('That timer was already stopped.', 'info');
        return;
      }
      toast.show(getErrorMessage(err), 'danger');
    },
  });
}

/**
 * The one entry point for the Start/Stop buttons. A ref lock ignores re-entrant
 * taps in the same tick (state updates are async, so `isPending` alone lets a
 * double tap through), and the busy flag is shared by every button on screen.
 */
export function useTimerActions() {
  const start = useStartTimer();
  const stop = useStopTimer();
  const busy = useTimerBusy();
  return {
    busy,
    starting: start.isPending,
    stopping: stop.isPending,
    startTask: (task: PromptTask) => {
      if (timerLock) return;
      timerLock = true;
      start.mutate({ task });
    },
    stopTimer: (timer: RunningTimer) => {
      if (timerLock) return;
      timerLock = true;
      stop.mutate({ timer });
    },
  };
}
/** Test helper: the lock is module-level on purpose (shared by all buttons). */
export const __resetTimerLock = () => {
  timerLock = false;
};

/** Assigned = named owner on the task OR present in its assignees list. */
export function isAssignedToTask(
  task: Pick<PromptTask, 'dev_owner_id' | 'qa_owner_id' | 'support_owner_id'>,
  userId: number | undefined,
  assignees: readonly Pick<Assignee, 'user_id'>[] | undefined,
): boolean {
  if (userId === undefined) return false;
  return (
    task.dev_owner_id === userId ||
    task.qa_owner_id === userId ||
    task.support_owner_id === userId ||
    (assignees ?? []).some((a) => a.user_id === userId)
  );
}
