/**
 * Layout constants behind the Tasks screen "chrome budget" (docs/UX_DESIGN_PLAN.md 1/5.3).
 * They are the nominal dp heights of the fixed elements above the list. The card height
 * is an ESTIMATE (never measured here): Needs on-device verification.
 */
export const HEADER_ROW_DP = 52;
export const TOOLBAR_DP = 60; // 44dp search/Filters row + 8dp padding top and bottom
export const TAB_BAR_DP = 56;
export const TIMER_STRIP_DP = 52;
export const OFFLINE_STRIP_DP = 32;
export const LIST_HEADER_DP = 44 + 24; // chips row (44) + count line (~24): scrolls with the list
/**
 * Derivation of a typical card (2-line title, labelled due row with Move, people, type/sprint line):
 * padding 12+12, code row 20, gap 8, title 2 x 24 = 48, gap 8, due row 36 (compact Move button),
 * gap 4, people 18 (2 lines: 36), gap 4, type line 18, borders 2 = 24+20+8+48+8+36+4+18+4+18+2 = 190,
 * rounded up to 200 for the optional flag line / second people line / subtasks row.
 * A one-line title with no flag is ~166. This is arithmetic over nominal sizes, NOT a measurement.
 */
export const TASK_CARD_DP_ESTIMATE = 200;
export const STATUS_BAR_DP = 24;

/** Height left for list content below the fixed chrome (header + toolbar + strips + tab bar + status bar). */
export function listViewportDp(windowHeight: number, strips: { timer?: boolean; offline?: boolean } = {}): number {
  return (
    windowHeight -
    STATUS_BAR_DP -
    TAB_BAR_DP -
    HEADER_ROW_DP -
    TOOLBAR_DP -
    (strips.timer ? TIMER_STRIP_DP : 0) -
    (strips.offline ? OFFLINE_STRIP_DP : 0)
  );
}

/** Whole cards that fit after the (scrolling) list header, and the rest as a fraction. */
export function visibleCards(viewportDp: number): number {
  return Math.max(0, viewportDp - LIST_HEADER_DP) / TASK_CARD_DP_ESTIMATE;
}
