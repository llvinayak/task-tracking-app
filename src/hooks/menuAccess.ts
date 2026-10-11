import type { MyMenu } from '@/api/types';
import { LOCKOUT_SAFE_MENU_URLS, ROLE_IDS } from '@/config/constants';

export type AccessLevel = 'none' | 'read' | 'edit';

/**
 * Pure port of the web useMenuAccess helpers
 * (task-tracking-admin/src/hooks/useMenuAccess.js). The API stays the
 * authority; this only decides which controls and screens to show.
 */
export function createMenuAccess(menus: readonly MyMenu[], roleId: number | undefined) {
  const isRecoveryPath = (urls: readonly string[]) =>
    roleId === ROLE_IDS.CTO && urls.some((u) => LOCKOUT_SAFE_MENU_URLS.includes(u));

  /** True if the role can open any of the given menu URLs. */
  const canView = (...urls: string[]) =>
    isRecoveryPath(urls) || menus.some((m) => !!m.menu_url && urls.includes(m.menu_url));

  /** True if the role can make changes on any of the given menu URLs. */
  const canEdit = (...urls: string[]) =>
    isRecoveryPath(urls) ||
    menus.some((m) => !!m.menu_url && urls.includes(m.menu_url) && m.can_edit === true);

  const levelOf = (url: string): AccessLevel => {
    if (isRecoveryPath([url])) return 'edit';
    const menu = menus.find((m) => m.menu_url === url);
    if (!menu) return 'none';
    return menu.can_edit === true ? 'edit' : 'read';
  };

  return { canView, canEdit, levelOf };
}

/**
 * Menus to surface on mobile: has a URL and is not hidden from mobile.
 * `is_visible_on_mobile` defaults to true server-side; null/undefined count as
 * visible, only an explicit false hides. Server order (sequence) is kept.
 */
export function getMobileMenus(menus: readonly MyMenu[]): MyMenu[] {
  return menus
    .filter((m) => !!m.menu_url && m.is_visible_on_mobile !== false)
    .slice()
    .sort((a, b) => a.sequence - b.sequence || a.id - b.id);
}
