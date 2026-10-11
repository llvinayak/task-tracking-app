import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionMutation } from './sessionMutation';

import { getErrorMessage } from '@/api/errors';
import {
  addTestCase,
  getOverdueToQA,
  getQAQueue,
  getQASummary,
  getTestCases,
  submitTestResult,
  type QAQueueStatus,
  type TestCase,
} from '@/api/qaApi';
import { useToast } from '@/components/ui';

import { keys } from './queries';

export const QA_OVERDUE_POLL_MS = 5 * 60 * 1000;

// Queue lists live under ['tasks', ...] so status moves (optimistic update, rollback,
// invalidation on settle) automatically apply to them too.
export const qaKeys = {
  queue: (s: QAQueueStatus) => ['tasks', 'qa', s] as const,
  overdue: ['tasks', 'qa', 'overdue'] as const,
  summary: (id: number) => ['task-qa-summary', id] as const,
  cases: (id: number) => ['task-qa', id] as const,
};

export const useQAQueue = (status: QAQueueStatus) =>
  useQuery({ queryKey: qaKeys.queue(status), queryFn: () => getQAQueue(status) });

/** Overdue-to-QA list: refetched every 5 minutes while the app is active. */
export const useOverdueToQA = () =>
  useQuery({
    queryKey: qaKeys.overdue,
    queryFn: getOverdueToQA,
    refetchInterval: QA_OVERDUE_POLL_MS,
    refetchIntervalInBackground: false,
  });

export const useQASummary = (taskId: number) =>
  useQuery({ queryKey: qaKeys.summary(taskId), queryFn: () => getQASummary(taskId) });

export const useTestCases = (taskId: number) =>
  useQuery({ queryKey: qaKeys.cases(taskId), queryFn: () => getTestCases(taskId) });

/** One-tap Pass/Fail with optimistic update and rollback; server message shown verbatim on error. */
export function useSubmitResult(taskId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useSessionMutation({
    mutationFn: (v: { testCaseId: number; status: 'pass' | 'fail' }) =>
      submitTestResult(taskId, v.testCaseId, v.status),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qaKeys.cases(taskId) });
      const prev = qc.getQueryData<TestCase[]>(qaKeys.cases(taskId));
      qc.setQueryData<TestCase[]>(qaKeys.cases(taskId), (old) =>
        old?.map((c) =>
          c.id === v.testCaseId
            ? {
                ...c,
                results: [
                  { status: v.status, notes: c.results[0]?.notes ?? null, reopen_count: c.results[0]?.reopen_count ?? 0, tested_at: null, tester: null },
                ],
              }
            : c,
        ),
      );
      return { prev, testCaseId: v.testCaseId };
    },
    onError: (err, _v, ctx) => {
      // Revert only this case (another case's result may have succeeded meanwhile).
      if (ctx?.prev) {
        const original = ctx.prev.find((c) => c.id === ctx.testCaseId);
        qc.setQueryData<TestCase[]>(qaKeys.cases(taskId), (old) =>
          old?.map((c) => (c.id === ctx.testCaseId && original ? original : c)),
        );
      }
      toast.show(getErrorMessage(err), 'danger');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qaKeys.cases(taskId) });
      void qc.invalidateQueries({ queryKey: qaKeys.summary(taskId) });
      // A failure also bumps the task's reopen_count.
      void qc.invalidateQueries({ queryKey: keys.task(taskId) });
      void qc.invalidateQueries({ queryKey: keys.tasksRoot });
    },
  });
}

export function useAddTestCase(taskId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useSessionMutation({
    mutationFn: (v: { title: string; steps: string; expected_result: string }) => addTestCase(taskId, v),
    onSuccess: () => {
      toast.show('Test case added', 'success');
      void qc.invalidateQueries({ queryKey: qaKeys.cases(taskId) });
      void qc.invalidateQueries({ queryKey: qaKeys.summary(taskId) });
    },
  });
}
