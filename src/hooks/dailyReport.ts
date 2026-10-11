import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionMutation } from './sessionMutation';
import { useDirtyGuard } from '@/store/uiStores';

import {
  getDailyReport,
  getPendingDay,
  getUnreviewedEntries,
  reviewEntry,
  saveDailyReport,
  submitDailyReport,
  type DailyReport,
  type SaveBody,
} from '@/api/dailyReportApi';

export const PENDING_POLL_MS = 5 * 60 * 1000;

export const dailyKeys = {
  root: ['daily-report'] as const,
  /** `null` = the default (today in the company timezone, no date param sent). */
  day: (date: string | null) => ['daily-report', date ?? 'today'] as const,
  pending: ['daily-report-pending'] as const,
  unreviewed: (date: string) => ['daily-unreviewed', date] as const,
};

export function useDailyReport(date: string | null) {
  return useQuery({
    queryKey: dailyKeys.day(date),
    queryFn: () => getDailyReport(date ?? undefined),
  });
}

/**
 * Logout prompt + tab badge source. Always "today" (the server ignores ?date).
 * Refetches every 5 min while the app is active and on foreground; retry:false
 * so a flaky check never piles up requests.
 */
export function useDailyPending(enabled = true) {
  return useQuery({
    queryKey: dailyKeys.pending,
    queryFn: getPendingDay,
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchInterval: PENDING_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** Auto-closed entries of one day that still need a Confirm (blocks Submit). */
export function useUnreviewedEntries(date: string | null, enabled: boolean) {
  return useQuery({
    queryKey: dailyKeys.unreviewed(date ?? ''),
    queryFn: () => getUnreviewedEntries(date as string),
    enabled: enabled && !!date,
  });
}

export function useReviewEntry(date: string) {
  const qc = useQueryClient();
  return useSessionMutation({
    mutationFn: (id: number) => reviewEntry(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dailyKeys.unreviewed(date) });
      void qc.invalidateQueries({ queryKey: dailyKeys.root });
      void qc.invalidateQueries({ queryKey: dailyKeys.pending });
    },
  });
}

/** Stores a freshly returned day under its own key (and the default key when it is today). */
function cacheDay(qc: ReturnType<typeof useQueryClient>, report: DailyReport | null, date: string) {
  if (!report) return;
  qc.setQueryData(dailyKeys.day(date), report);
  const today = qc.getQueryData<DailyReport>(dailyKeys.day(null));
  if (today?.date === report.date) qc.setQueryData(dailyKeys.day(null), report);
}

export function useSaveDay() {
  const qc = useQueryClient();
  return useSessionMutation({
    mutationFn: (body: SaveBody) => saveDailyReport(body),
    onSuccess: (report, body) => {
      cacheDay(qc, report, body.date);
      void qc.invalidateQueries({ queryKey: dailyKeys.root });
      void qc.invalidateQueries({ queryKey: dailyKeys.pending });
    },
  });
}

export function useSubmitDay() {
  const qc = useQueryClient();
  return useSessionMutation({
    mutationFn: (body: SaveBody) => submitDailyReport(body),
    onSuccess: (res, body) => {
      cacheDay(qc, res.report, body.date);
      void qc.invalidateQueries({ queryKey: dailyKeys.root });
      void qc.invalidateQueries({ queryKey: dailyKeys.pending });
    },
  });
}

export { useDirtyGuard };
