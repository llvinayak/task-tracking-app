import { ROLE_IDS } from './constants';

export type DashboardView = 'client' | 'developer' | 'qa' | 'techLead' | 'projectManager' | 'cto';

/**
 * Role -> dashboard view. Single source of truth for the mapping.
 * Mirrors task-tracking-admin/src/pages/DashboardPage.jsx:1697-1795:
 *   6 Client -> /dashboard/client-stats      5 Developer -> developer-stats
 *   4 QA -> qa-stats                         3 Tech Lead -> tl-stats
 *   2 Project Manager -> pm-stats
 * Any other role id (1 CTO, unknown/custom roles, seeded 7-9) gets the CTO
 * view: a segmented control between the PM view and Team Health (tl-stats).
 */
export function dashboardViewForRole(roleId: number | null | undefined): DashboardView {
  switch (roleId) {
    case ROLE_IDS.CLIENT:
      return 'client';
    case ROLE_IDS.DEVELOPER:
      return 'developer';
    case ROLE_IDS.QA:
      return 'qa';
    case ROLE_IDS.TECH_LEAD:
      return 'techLead';
    case ROLE_IDS.PROJECT_MANAGER:
      return 'projectManager';
    default:
      return 'cto';
  }
}

/** Developer and QA dashboards poll while the app is active and visible. */
export const DASHBOARD_POLL_MS = 60_000;
export const POLLING_VIEWS: readonly DashboardView[] = ['developer', 'qa'];
