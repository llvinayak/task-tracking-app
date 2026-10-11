import type { MyMenu } from '@/api/types';

import type { MobileModule } from './modules';

/** Bottom tabs = at most this many modules + More. Keeps labels readable at 320pt wide. */
export const MAX_MODULE_TABS = 4;

/**
 * Modules the user may open: the server GRANTED the menu (canView) AND it is
 * not hidden from mobile. Nothing is ever invented client-side.
 */
export function grantedModules(
  modules: readonly MobileModule[],
  canView: (...urls: string[]) => boolean,
  mobileMenus: readonly MyMenu[],
): MobileModule[] {
  return modules.filter((m) => canView(m.menuUrl) && mobileMenus.some((menu) => menu.menu_url === m.menuUrl));
}

/** First MAX_MODULE_TABS granted modules are tabs; the rest are reachable from More. */
export function splitModules(granted: readonly MobileModule[]): { tabs: MobileModule[]; overflow: MobileModule[] } {
  return { tabs: granted.slice(0, MAX_MODULE_TABS), overflow: granted.slice(MAX_MODULE_TABS) };
}
