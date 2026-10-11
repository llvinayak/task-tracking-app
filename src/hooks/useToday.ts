import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getNow, getToday } from '@/utils/dates';

/**
 * A "today" key (local yyyy-MM-dd) that changes at local midnight and is
 * re-checked whenever the app returns to the foreground. Anything memoized on
 * calendar-day maths (overdue, due pills, days left) lists this key as a
 * dependency, so it cannot go stale across midnight or a long background.
 */
const pad = (n: number) => String(n).padStart(2, '0');
export const todayKey = (): string => {
  const d = getToday();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let current = todayKey();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appSub: { remove: () => void } | null = null;

function refresh() {
  const next = todayKey();
  if (next !== current) {
    current = next;
    listeners.forEach((l) => l());
  }
}

function scheduleNextMidnight() {
  if (timer) clearTimeout(timer);
  const now = getNow();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
  // Long timers are fine on Hermes; clamp anyway and re-evaluate on fire.
  const delay = Math.min(Math.max(midnight.getTime() - now.getTime(), 1000), 2 ** 31 - 1);
  timer = setTimeout(() => {
    refresh();
    scheduleNextMidnight();
  }, delay);
}

function start() {
  current = todayKey();
  scheduleNextMidnight();
  appSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') {
      refresh();
      scheduleNextMidnight();
    }
  });
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
  appSub?.remove();
  appSub = null;
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

// With no subscribers `current` can be stale, so recompute (strings compare by value).
const snapshot = () => (listeners.size === 0 ? todayKey() : current);

export function useTodayKey(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
