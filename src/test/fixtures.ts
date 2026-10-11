import { parseStatusConfig, parseTask, type Task, type TaskStatusConfig } from '@/api/models';
import type { MyMenu } from '@/api/types';
import type { SessionUser } from '@/store/authStore';

/** Raw (server-shaped) task row. */
export const rawTask = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 15,
  title: 'Fix login redirect',
  description: '<p>Redirect <strong>loops</strong></p>',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  task_type: 'BUG',
  project_id: 3,
  project: { id: 3, name: 'Alpha Project', color: '#3366ff' },
  dev_owner_id: 7,
  devOwner: { id: 7, name: 'Grace Hopper' },
  created_by: 2,
  due_date: '2026-10-12',
  is_blocked: false,
  is_at_risk: false,
  reopen_count: 0,
  ...over,
});

export const task = (over: Record<string, unknown> = {}): Task => parseTask(rawTask(over)) as Task;

const STATUSES: [string, string, number, string[]][] = [
  ['NOT_STARTED', 'Not Started', 1, ['IN_PROGRESS']],
  ['IN_PROGRESS', 'In Progress', 2, ['DEV_DONE', 'NOT_STARTED']],
  ['DEV_DONE', 'Dev Done', 3, ['READY_FOR_QA', 'IN_PROGRESS']],
  // Mirrors task-tracking-api/scripts/setupDatabase.js (the seed).
  ['READY_FOR_QA', 'Ready for QA', 4, ['PASS', 'FAIL', 'DEFERRED', 'IN_PROGRESS']],
  ['FAIL', 'Fail', 5, ['REOPEN', 'IN_PROGRESS']],
  ['REOPEN', 'Reopen', 6, ['IN_PROGRESS']],
  ['PASS', 'Pass', 7, []],
  ['DEFERRED', 'Deferred', 8, ['NOT_STARTED', 'IN_PROGRESS']],
];

export const rawStatuses = () =>
  STATUSES.map(([key, label, order_index, allowed_transitions]) => ({
    key,
    label,
    color: '#10b981',
    order_index,
    allowed_transitions,
    is_active: true,
  }));

export const statusConfig = (): TaskStatusConfig[] => parseStatusConfig(rawStatuses());

export const menu = (
  over: Partial<MyMenu> & Pick<MyMenu, 'id' | 'menu_name' | 'menu_url'>,
): MyMenu => ({
  menu_icon: null,
  parent_id: null,
  is_visible_on_mobile: true,
  sequence: over.id,
  can_edit: false,
  access_level: 'read',
  ...over,
});

export const sessionUser = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 7,
  name: 'Grace Hopper',
  email: 'grace@x.io',
  roleId: 5,
  roleName: 'Developer',
  clientId: null,
  ...over,
});
