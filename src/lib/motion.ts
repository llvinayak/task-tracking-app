/**
 * Animations are core RN `Animated` only. They are skipped under Jest (no timers
 * left running, no state updates outside act) and when the user asked the OS to
 * reduce motion (see useReducedMotion). A function (not a constant) so tests can
 * opt in by clearing JEST_WORKER_ID.
 */
export const animationsEnabled = (): boolean => !process.env.JEST_WORKER_ID;
