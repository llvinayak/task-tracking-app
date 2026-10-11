/**
 * Animations are core RN `Animated` only. They are skipped under Jest (no timers
 * left running, no state updates outside act) and when the user asked the OS to
 * reduce motion (see useReducedMotion). A function (not a constant) so tests can
 * opt in by clearing JEST_WORKER_ID.
 */
let testOverride: boolean | null = null;
export const animationsEnabled = (): boolean => (testOverride !== null ? testOverride : !process.env.JEST_WORKER_ID);

/** Test-only: force motion on/off (null restores the default). Never call from app code. */
export const __setAnimationsEnabledForTests = (v: boolean | null): void => {
  testOverride = v;
};
