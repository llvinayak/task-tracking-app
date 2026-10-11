/**
 * Role IDs match the static `roles` table on the server.
 * Source of truth: task-tracking-api/src/config/constants.js (ROLE_IDS).
 * Never change these values; prefer reading role_id / role name from the
 * server user object and menu access over comparing against these.
 *
 * NOTE: the seed SQL also defines roles 7 (Implementation), 8 (Team Lead) and
 * 9 (CEO) which are NOT in constants.js - see the report's open questions.
 */
export const ROLE_IDS = {
  CTO: 1,
  PROJECT_MANAGER: 2,
  TECH_LEAD: 3,
  QA: 4,
  DEVELOPER: 5,
  CLIENT: 6,
} as const;

/**
 * The one menu the CTO may always reach (lockout recovery). Mirrors
 * LOCKOUT_SAFE_URLS in task-tracking-api/src/middleware/authorizeMenu.js and
 * the web useMenuAccess hook.
 */
export const LOCKOUT_SAFE_MENU_URLS: readonly string[] = ['/menu-access'];

/**
 * App-wide constants that mirror business rules the server owns.
 *
 * DAY_TARGET_MINUTES: the daily working target the timesheet measures against.
 * NV (not verified): the server has a `work_daily_capacity_hours` setting that is
 * only reachable through the config endpoint, which this app does not read yet.
 * Until it does, 8h is a display-only default; it never blocks anything and is
 * shown as text ("3h of 8h"), so a different server value cannot corrupt data.
 */
export const DAY_TARGET_MINUTES = 8 * 60;
