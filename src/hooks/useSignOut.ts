import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';

import { getPendingDay } from '@/api/dailyReportApi';
import { getRunningTimer, type RunningTimer } from '@/api/timeApi';
import { useToast } from '@/components/ui';
import { dailyKeys } from '@/hooks/dailyReport';
import { keys } from '@/hooks/queries';
import { captureSession } from '@/hooks/sessionMutation';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useOpenModule } from '@/navigation/useOpenModule';
import { buildSignOutDialog, withTimeout } from '@/screens/signOutDialog';
import { useAuthStore } from '@/store/authStore';

/**
 * The sign-out flow shared by Profile and the drawer: time-boxed best-effort checks (unfiled day, running timer),
 * the existing confirmation dialog, then logout. `reviewVia` lets the caller close something (the drawer) before
 * "Review & submit" opens My Day.
 */
export function useSignOut(opts: { reviewVia?: (go: () => void) => void } = {}) {
  const logout = useAuthStore((s) => s.logout);
  const signingOut = useAuthStore((s) => s.signingOut);
  const toast = useToast();
  const qc = useQueryClient();
  const openModule = useOpenModule();
  const { canView } = useMenuAccess();
  const [checking, setChecking] = useState(false);

  const doSignOut = () => {
    logout().catch((e: unknown) => toast.show(e instanceof Error ? e.message : 'Could not sign out.', 'danger'));
  };

  const confirmSignOut = async () => {
    if (signingOut || checking) return;
    setChecking(true);
    // Both checks are best-effort and time-boxed: a failure or a slow network
    // must never keep the user from signing out.
    const [pending, timer] = await Promise.all([
      withTimeout(qc.fetchQuery({ queryKey: dailyKeys.pending, queryFn: getPendingDay, staleTime: 0, retry: false }), 3000),
      withTimeout(qc.fetchQuery({ queryKey: keys.runningTimer, queryFn: getRunningTimer, staleTime: 15_000, retry: false }), 3000),
    ]);
    setChecking(false);

    const dialog = buildSignOutDialog({
      pending,
      runningTaskTitle: (timer ?? qc.getQueryData<RunningTimer | null>(keys.runningTimer))?.task.title ?? null,
      canReview: canView('/my-day'),
    });
    Alert.alert(
      dialog.title,
      dialog.message,
      dialog.buttons.map((b) => ({
        text: b.text,
        ...(b.style ? { style: b.style } : {}),
        onPress: () => {
          if (b.action === 'signOut') doSignOut();
          else if (b.action === 'review') {
            // The drawer may take a moment to close; if the session changed meanwhile, do nothing.
            const alive = captureSession();
            const go = () => {
              if (alive()) void openModule('MyDay');
            };
            if (opts.reviewVia) opts.reviewVia(go);
            else go();
          }
        },
      })),
    );
  };

  return { confirmSignOut, busy: signingOut || checking };
}
