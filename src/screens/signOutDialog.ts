import type { PendingDay } from '@/api/dailyReportApi';
import { formatDuration } from '@/utils/time';

export interface SignOutInfo {
  /** null when the check failed or timed out: it must NEVER block signing out. */
  pending: PendingDay | null;
  /** Title of the task with a running timer, if any. */
  runningTaskTitle: string | null;
  /** Can the user open My Day (menu granted)? Controls the "Review & submit" button. */
  canReview: boolean;
}

export interface SignOutButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  action: 'cancel' | 'signOut' | 'review';
}

export interface SignOutDialog {
  title: string;
  message: string;
  buttons: SignOutButton[];
}

/**
 * Port of the web LogoutPrompt (unfiled day) plus a mobile-only timer note.
 * The running timer is NOT stopped on sign out: it keeps running server-side
 * until the max-session auto-close (work_max_session_hours, default 8h).
 */
export function buildSignOutDialog(info: SignOutInfo): SignOutDialog {
  const needsSubmit = info.pending?.needsSubmit === true;
  const timerLine = info.runningTaskTitle
    ? `A timer is still running (${info.runningTaskTitle}). It keeps running on the server until it auto-closes (after 8 hours at most); signing out does not stop it.`
    : null;

  if (needsSubmit && info.pending) {
    const n = info.pending.taskCount;
    const parts = [
      `You tracked ${formatDuration(info.pending.trackedMinutes)} across ${n} ${n === 1 ? 'task' : 'tasks'} today, but your day hasn't been filed yet.`,
      timerLine,
    ].filter(Boolean);
    return {
      title: 'Your day is not filed',
      message: parts.join('\n\n'),
      buttons: [
        { text: 'Sign out anyway', style: 'destructive', action: 'signOut' },
        ...(info.canReview ? [{ text: 'Review & submit', style: 'default' as const, action: 'review' as const }] : []),
        ...(!info.canReview ? [{ text: 'Cancel', style: 'cancel' as const, action: 'cancel' as const }] : []),
      ],
    };
  }

  if (timerLine) {
    return {
      title: 'Sign out?',
      message: timerLine,
      buttons: [
        { text: 'Cancel', style: 'cancel', action: 'cancel' },
        { text: 'Sign out', style: 'destructive', action: 'signOut' },
      ],
    };
  }

  return {
    title: 'Sign out?',
    message: 'You will need to sign in again to use the app.',
    buttons: [
      { text: 'Cancel', style: 'cancel', action: 'cancel' },
      { text: 'Sign out', style: 'destructive', action: 'signOut' },
    ],
  };
}

/** Rejects (resolves null) after `ms`; used so a slow check can never hold sign out hostage. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      () => {
        clearTimeout(id);
        resolve(null);
      },
    );
  });
}
