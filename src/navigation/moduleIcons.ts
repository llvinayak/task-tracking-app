import type { IconName } from '@/components/ui';

import type { ModuleName } from './types';

/** Filled icon when focused/selected, outline otherwise (a non-colour selected cue). */
export const MODULE_ICONS: Record<ModuleName | 'More', { on: IconName; off: IconName }> = {
  Dashboard: { on: 'grid', off: 'grid-outline' },
  Tasks: { on: 'list', off: 'list-outline' },
  MyDay: { on: 'today', off: 'today-outline' },
  QA: { on: 'shield-checkmark', off: 'shield-checkmark-outline' },
  Tickets: { on: 'ticket', off: 'ticket-outline' },
  Sprints: { on: 'flash', off: 'flash-outline' },
  More: { on: 'ellipsis-horizontal-circle', off: 'ellipsis-horizontal-circle-outline' },
};
