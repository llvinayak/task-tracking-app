import type { MyMenu } from '@/api/types';

import type { MobileModule } from './modules';
import type { ModuleName } from './types';

/** Bottom tabs = at most this many modules + the fixed Menu item. Keeps labels readable at 320pt wide. */
export const MAX_MODULE_TABS = 4;

/**
 * Role-aware PRESENTATION order only (which modules become tabs first). It never
 * grants anything: modules are still filtered by the server grant and
 * is_visible_on_mobile. Modules a role does not list keep registry order after it.
 * Role ids: 1 CTO, 2 PM, 3 Tech Lead, 4 QA, 5 Developer, 6 Client (7-9 behave like CTO).
 */
const CTO_ORDER: readonly ModuleName[] = ['Dashboard', 'Tasks', 'Sprints', 'Tickets', 'MyDay', 'QA'];
export const TAB_PRIORITY: Record<number, readonly ModuleName[]> = {
  5: ['Dashboard', 'Tasks', 'MyDay', 'QA', 'Tickets', 'Sprints'],
  4: ['QA', 'Dashboard', 'Tasks', 'MyDay', 'Tickets', 'Sprints'],
  3: ['Dashboard', 'Tasks', 'Sprints', 'MyDay', 'QA', 'Tickets'],
  2: ['Dashboard', 'Sprints', 'Tasks', 'Tickets', 'MyDay', 'QA'],
  1: CTO_ORDER,
  7: CTO_ORDER,
  8: CTO_ORDER,
  9: CTO_ORDER,
  6: ['Tickets', 'Dashboard', 'Tasks', 'Sprints', 'MyDay', 'QA'],
};

/**
 * Modules the user may open: the server GRANTED the menu (canView) AND it is
 * not hidden from mobile. Nothing is ever invented client-side. With a `roleId`
 * the result is ordered by that role's tab priority (presentation only).
 */
export function grantedModules(
  modules: readonly MobileModule[],
  canView: (...urls: string[]) => boolean,
  mobileMenus: readonly MyMenu[],
  roleId?: number | null,
): MobileModule[] {
  const granted = modules.filter((m) => canView(m.menuUrl) && mobileMenus.some((menu) => menu.menu_url === m.menuUrl));
  const priority = roleId == null ? undefined : TAB_PRIORITY[roleId];
  if (!priority) return granted;
  const rank = (m: MobileModule) => {
    const i = priority.indexOf(m.name);
    return i === -1 ? priority.length : i;
  };
  // Array.prototype.sort is stable: unlisted modules keep registry order.
  return [...granted].sort((a, b) => rank(a) - rank(b));
}

/** First MAX_MODULE_TABS granted modules are tabs; the rest are reachable from the drawer. */
export function splitModules(granted: readonly MobileModule[]): { tabs: MobileModule[]; overflow: MobileModule[] } {
  return { tabs: granted.slice(0, MAX_MODULE_TABS), overflow: granted.slice(MAX_MODULE_TABS) };
}
