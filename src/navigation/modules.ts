import type { ComponentType } from 'react';

import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { MyDayScreen } from '@/features/myday/MyDayScreen';
import { QAScreen } from '@/features/qa/QAScreen';
import { SprintsScreen } from '@/features/sprints/SprintsScreen';
import { TicketsScreen } from '@/features/tickets/TicketsScreen';
import { TasksScreen } from '@/features/tasks/TasksScreen';

import type { ModuleName } from './types';

/**
 * Registry of web menu URLs that have a real mobile screen. A module appears
 * as a tab ONLY when GET /menu-access/my grants its URL and the menu is not
 * hidden from mobile (is_visible_on_mobile !== false).
 *
 * Everything else the server grants (releases, calendar, admin screens, ...) is
 * listed in the drawer as "Not available in this version yet".
 *
 * ORDER = tab priority: the first MAX_MODULE_TABS granted modules become tabs,
 * the rest open from the drawer.
 */
export interface MobileModule {
  menuUrl: string;
  name: ModuleName;
  title: string;
  screen: ComponentType;
}

export const MOBILE_MODULES: readonly MobileModule[] = [
  { menuUrl: '/dashboard', name: 'Dashboard', title: 'Dashboard', screen: DashboardScreen },
  { menuUrl: '/tasks', name: 'Tasks', title: 'Tasks', screen: TasksScreen },
  // NV: no '/my-day' row exists in the seed SQL we can see. The tab appears ONLY if
  // GET /menu-access/my actually grants it; access is never invented client-side.
  { menuUrl: '/my-day', name: 'MyDay', title: 'My Day', screen: MyDayScreen },
  { menuUrl: '/qa', name: 'QA', title: 'QA', screen: QAScreen },
  { menuUrl: '/tickets', name: 'Tickets', title: 'Tickets', screen: TicketsScreen },
  { menuUrl: '/sprints', name: 'Sprints', title: 'Sprints', screen: SprintsScreen },
];

export const isModuleAvailable = (menuUrl: string | null) =>
  !!menuUrl && MOBILE_MODULES.some((m) => m.menuUrl === menuUrl);

export const moduleForUrl = (menuUrl: string | null) => MOBILE_MODULES.find((m) => m.menuUrl === menuUrl);
