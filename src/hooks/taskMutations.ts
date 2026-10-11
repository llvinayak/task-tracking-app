import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSessionMutation } from './sessionMutation';

import { getErrorMessage } from '@/api/errors';
import type { Assignee, AssigneeRole, Comment, Task, TaskDetail } from '@/api/models';
import {
  addTaskAssignee,
  addTaskComment,
  changeTaskStatus,
  removeTaskAssignee,
  setPrimaryAssignee,
} from '@/api/tasksApi';
import { useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

import { keys } from './queries';

/* ── Optimistic status helpers (exported for tests) ──────────────────────── */

/**
 * Applies the new status to every cached list and the detail, and returns a
 * rollback that reverts ONLY this task, and only where it still holds the
 * optimistic value. A whole-cache snapshot would also undo other tasks' moves
 * that succeeded in the meantime (concurrent moves: A fails, B succeeds).
 *
 * In-flight list refetches are cancelled first so a stale server response
 * cannot overwrite the optimistic value; onSettled refetches afterwards.
 */
export async function applyOptimisticStatus(
  qc: QueryClient,
  taskId: number,
  status: string,
): Promise<() => void> {
  await qc.cancelQueries({ queryKey: keys.tasksRoot });
  await qc.cancelQueries({ queryKey: keys.task(taskId) });

  // Previous status of THIS task per cached list.
  const previous = new Map<string, { key: readonly unknown[]; status: string }>();
  for (const [key, data] of qc.getQueriesData<Task[]>({ queryKey: keys.tasksRoot })) {
    const t = data?.find((x) => x.id === taskId);
    if (t) previous.set(JSON.stringify(key), { key, status: t.status });
  }
  const detailPrev = qc.getQueryData<TaskDetail>(keys.task(taskId))?.status;

  qc.setQueriesData<Task[]>({ queryKey: keys.tasksRoot }, (old) =>
    old?.map((t) => (t.id === taskId ? { ...t, status } : t)),
  );
  qc.setQueryData<TaskDetail | undefined>(keys.task(taskId), (old) => (old ? { ...old, status } : old));

  return () => {
    for (const { key, status: prev } of previous.values()) {
      qc.setQueryData<Task[]>(key, (old) =>
        old?.map((t) => (t.id === taskId && t.status === status ? { ...t, status: prev } : t)),
      );
    }
    if (detailPrev !== undefined) {
      qc.setQueryData<TaskDetail | undefined>(keys.task(taskId), (old) =>
        old && old.status === status ? { ...old, status: detailPrev } : old,
      );
    }
  };
}

export function useChangeStatus() {
  const qc = useQueryClient();
  const toast = useToast();

  return useSessionMutation({
    mutationFn: (v: { taskId: number; status: string; notes?: string; successMessage?: string }) =>
      changeTaskStatus(v.taskId, v.status, v.notes),
    onMutate: async (v) => ({ rollback: await applyOptimisticStatus(qc, v.taskId, v.status) }),
    onError: (err, _v, ctx) => {
      ctx?.rollback();
      // Shown verbatim (403 'You do not have permission...', 400 with the allowed list).
      // A 403 here never logs the user out: only 401 does, in the API client.
      toast.show(getErrorMessage(err), 'danger');
    },
    onSuccess: (_d, v) => toast.show(v.successMessage ?? 'Status updated', 'success'),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: keys.tasksRoot });
      void qc.invalidateQueries({ queryKey: keys.task(v.taskId) });
      void qc.invalidateQueries({ queryKey: keys.dashboardRoot });
    },
  });
}

/* ── Comments ────────────────────────────────────────────────────────────── */

export function useAddComment(taskId: number) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);

  return useSessionMutation({
    mutationFn: async (content: string): Promise<Comment> => {
      const text = content.trim();
      if (!text) throw new Error('Write a comment first.');
      return addTaskComment(taskId, text, { id: me?.id ?? 0, name: me?.name ?? 'You' });
    },
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(keys.taskComments(taskId), (old) => [...(old ?? []), comment]);
      void qc.invalidateQueries({ queryKey: keys.taskComments(taskId) });
    },
  });
}

/* ── Assignees ───────────────────────────────────────────────────────────── */

export function useAssigneeMutations(taskId: number) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.taskAssignees(taskId) });
    void qc.invalidateQueries({ queryKey: keys.task(taskId) });
    void qc.invalidateQueries({ queryKey: keys.tasksRoot });
  };

  const add = useSessionMutation({
    mutationFn: (v: { user_id: number; role: AssigneeRole; is_primary?: boolean }) =>
      addTaskAssignee(taskId, v),
    onSuccess: refresh,
  });
  const remove = useSessionMutation({
    mutationFn: (a: Assignee) => removeTaskAssignee(taskId, a.id),
    onSuccess: refresh,
  });
  const makePrimary = useSessionMutation({
    mutationFn: (a: Assignee) => setPrimaryAssignee(taskId, a.id),
    onSuccess: refresh,
  });
  return { add, remove, makePrimary };
}
