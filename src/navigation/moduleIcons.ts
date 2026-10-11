import type { IconName } from '@/components/ui';

import type { ModuleName } from './types';

/** Filled icon when focused/selected, outline otherwise (a non-colour selected cue). */
export const MODULE_ICONS: Record<ModuleName | 'Menu', { on: IconName; off: IconName }> = {
  Dashboard: { on: 'grid', off: 'grid-outline' },
  Tasks: { on: 'list', off: 'list-outline' },
  MyDay: { on: 'today', off: 'today-outline' },
  QA: { on: 'shield-checkmark', off: 'shield-checkmark-outline' },
  Tickets: { on: 'ticket', off: 'ticket-outline' },
  Sprints: { on: 'flash', off: 'flash-outline' },
  // A single glyph: Menu is an action (opens the drawer), it never shows a selected state.
  Menu: { on: 'menu', off: 'menu' },
};
