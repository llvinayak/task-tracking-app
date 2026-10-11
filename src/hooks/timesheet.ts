import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSessionMutation } from './sessionMutation';

import { reviewEntry } from '@/api/dailyReportApi';
import { getErrorMessage } from '@/api/errors';
import { getTasks } from '@/api/tasksApi';
import { createTimeEntry, deleteTimeEntry, getTimesheet, updateTimeEntry } from '@/api/timesheetApi';
import { useToast } from '@/components/ui';

import { refreshTimerState } from './timer';

export const timesheetKeys = {
  root: ['timesheet'] as const,
  range: (from: string, to: string) => ['timesheet', from, to] as const,
  picker: (mode: string, search: string, userId: number | undefined) => ['time-task-picker', mode, search, userId] as const,
};

export const useTimesheet = (from: string, to: string) =>
  useQuery({
    queryKey: timesheetKeys.range(from, to),
    queryFn: () => getTimesheet(from, to),
    // Moving between weeks keeps the previous week's data (and its company timezone) on screen
    // until the next one arrives; the screen checks isPlaceholderData before showing totals.
    placeholderData: keepPreviousData,
  });

/**
 * Any change to time entries must refresh everything derived from them: the
 * timesheet itself, My Day (and its pending badge), per-task sessions, task
 * lists and details (actual hours) and dashboards.
 */
export function refreshTimeData(qc: QueryClient, taskId?: number | null) {
  void qc.invalidateQueries({ queryKey: timesheetKeys.root });
  refreshTimerState(qc, [taskId]);
}

/**
 * Tasks the user can log time on. "mine" is GET /tasks?assigned_to=<me>: the server
 * matches the dev/qa/support OWNER columns only (not the assignees roster), so
 * someone assigned only through the roster will not appear there. "all" searches
 * every visible task; the server's 403 ("Only people assigned to this task...")
 * is then shown verbatim.
 */
export function useTimeTaskPicker(mode: 'mine' | 'all', search: string, userId: number | undefined, enabled: boolean) {
  const s = search.trim();
  return useQuery({
    queryKey: timesheetKeys.picker(mode, s, userId),
    queryFn: async () => {
      const tasks = await getTasks(
        mode === 'mine' ? { ...(s ? { search: s } : {}), assignedTo: userId ?? null } : { search: s },
      );
      return tasks.slice(0, 50);
    },
    enabled: enabled && (mode === 'mine' ? userId !== undefined : s.length >= 2),
  });
}

export function useTimeEntryMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const create = useSessionMutation({
    mutationFn: createTimeEntry,
    onSuccess: (res, v) => {
      refreshTimeData(qc, v.taskId);
      toast.show(res.warning ? `Time added\n${res.warning}` : 'Time added', res.warning ? 'info' : 'success', res.warning ? 7000 : undefined);
    },
  });
  const update = useSessionMutation({
    mutationFn: (v: { id: number; taskId: number; startedAt?: string; endedAt?: string; note: string }) =>
      updateTimeEntry(v.id, {
        ...(v.startedAt !== undefined && v.endedAt !== undefined ? { startedAt: v.startedAt, endedAt: v.endedAt } : {}),
        note: v.note,
      }),
    onSuccess: (_r, v) => {
      refreshTimeData(qc, v.taskId);
      toast.show('Entry updated', 'success');
    },
  });
  /** "Confirm" an auto-closed entry as correct, without touching its times (POST /time/entries/:id/review). */
  const confirm = useSessionMutation({
    mutationFn: (v: { id: number; taskId: number }) => reviewEntry(v.id),
    onSuccess: (_r, v) => {
      refreshTimeData(qc, v.taskId);
      toast.show('Entry confirmed', 'success');
    },
  });
  const remove = useSessionMutation({
    mutationFn: (v: { id: number; taskId: number }) => deleteTimeEntry(v.id),
    onSuccess: (_r, v) => {
      refreshTimeData(qc, v.taskId);
      toast.show('Entry deleted', 'success');
    },
    onError: (err) => toast.show(getErrorMessage(err), 'danger'),
  });
  return { create, update, remove, confirm };
}
