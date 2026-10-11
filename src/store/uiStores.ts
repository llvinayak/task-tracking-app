import { create } from 'zustand';

import type { TimerPrompt } from '@/utils/timerPrompt';

/**
 * Small per-session UI stores, kept free of other app imports so authStore can
 * reset them on sign out / session expiry without an import cycle.
 */

interface PromptState {
  prompt: TimerPrompt | null;
  show: (p: TimerPrompt) => void;
  dismiss: () => void;
}
export const useTimerPromptStore = create<PromptState>()((set) => ({
  prompt: null,
  show: (prompt) => set({ prompt }),
  dismiss: () => set({ prompt: null }),
}));

/**
 * Unsaved-changes guard shared between the My Day screen (which knows it is
 * dirty) and the tab bar (which sees tab presses).
 */
interface GuardState {
  dirty: boolean;
  /** Incremented when the user chooses "Discard" in a guard dialog. */
  discardSignal: number;
  setDirty: (d: boolean) => void;
  requestDiscard: () => void;
  reset: () => void;
}
export const useDirtyGuard = create<GuardState>()((set) => ({
  dirty: false,
  discardSignal: 0,
  setDirty: (dirty) => set({ dirty }),
  requestDiscard: () => set((s) => ({ dirty: false, discardSignal: s.discardSignal + 1 })),
  reset: () => set({ dirty: false }),
}));
