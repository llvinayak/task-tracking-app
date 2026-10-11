import type { ProjectTeam, Task, TaskStatusConfig } from '@/api/models';

import { daysFromToday } from './dates';

/* ── Priority / type ─────────────────────────────────────────────────────── */

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const TASK_TYPES = ['REQUIREMENT', 'BUG', 'IMPROVEMENT', 'CHORE', 'RESEARCH', 'SUPPORT'] as const;

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

/** Mirrors PRIORITY_META in the web TaskCard (danger / warning / info / neutral). */
export const PRIORITY_TONE: Record<string, Tone> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};
export const TYPE_TONE: Record<string, Tone> = {
  REQUIREMENT: 'brand',
  BUG: 'danger',
  IMPROVEMENT: 'brand',
  CHORE: 'neutral',
  RESEARCH: 'info',
  SUPPORT: 'warning',
};

export const priorityLabel = (p: string) => p.charAt(0) + p.slice(1).toLowerCase();
export const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/** Client-side priority sort for dashboard sections (CRITICAL first, unknown last). */
export const sortByPriority = (tasks: readonly Task[]): Task[] =>
  tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (PRIORITY_RANK[a.t.priority] ?? 9) - (PRIORITY_RANK[b.t.priority] ?? 9) || a.i - b.i)
    .map((x) => x.t);

/* ── Statuses ────────────────────────────────────────────────────────────── */

/**
 * "Done" for UI wording only (overdue exclusion, calm due pills). Matches the
 * server's DONE_STATUSES and the web TaskCard.
 *
 * This is NOT the transition rule. Whether a task can be moved, and where,
 * comes ONLY from /config/task-statuses allowed_transitions (see
 * allowedTargets): DEFERRED is done for display yet is movable
 * (DEFERRED -> NOT_STARTED / IN_PROGRESS in the DB), and an empty list means
 * "no moves". Keep PASS-only wherever the server uses completed_at semantics
 * (QA passedTasks, completedThisWeek); those numbers come from the server.
 */
export const DONE_STATUSES: ReadonlySet<string> = new Set(['PASS', 'DEFERRED']);

/** Only the moves the server will accept from the current status (DB-driven). */
export function allowedTargets(
  config: readonly TaskStatusConfig[] | undefined,
  status: string,
): TaskStatusConfig[] {
  const current = config?.find((s) => s.key === status);
  if (!current || !config) return [];
  return current.allowed_transitions
    .map((key) => config.find((s) => s.key === key))
    .filter((s): s is TaskStatusConfig => !!s && s.key !== status);
}

export const statusLabel = (config: readonly TaskStatusConfig[] | undefined, key: string) =>
  config?.find((s) => s.key === key)?.label ??
  key.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/* ── Dates / flags ───────────────────────────────────────────────────────── */

/** Due date before today (calendar day) and not done (PASS / DEFERRED). */
export function isOverdue(task: Task): boolean {
  if (!task.due_date || DONE_STATUSES.has(task.status)) return false;
  const d = daysFromToday(task.due_date);
  return d !== null && d < 0;
}

/** Statuses before the task reaches QA; after that the QA date has done its job. */
export const PRE_QA_STATUSES: readonly string[] = ['NOT_STARTED', 'IN_PROGRESS', 'DEV_DONE'];

export function isQAOverdue(task: Task): boolean {
  if (!task.release_to_qa_date || !PRE_QA_STATUSES.includes(task.status)) return false;
  const d = daysFromToday(task.release_to_qa_date);
  return d !== null && d < 0;
}

export const isUnassigned = (task: Task) => !task.dev_owner_id && !task.qa_owner_id;

export type CardFlag = 'blocked' | 'qa_overdue' | 'at_risk' | null;

/** Blocked beats QA-overdue beats at-risk. Overdue is shown only under its chip. */
export function cardFlag(task: Task): CardFlag {
  if (task.is_blocked) return 'blocked';
  if (isQAOverdue(task)) return 'qa_overdue';
  if (task.is_at_risk) return 'at_risk';
  return null;
}

export type DueLabel = { text: string; tone: 'danger' | 'warning' | 'normal' } | null;

/** Web DueDate: urgency wording only when `highlight` (Overdue chip active). */
export function dueLabel(
  task: Task,
  highlight: boolean,
  formatDay: (v: string) => string,
): DueLabel {
  if (!task.due_date) return null;
  const days = daysFromToday(task.due_date);
  if (days === null) return null;
  if (!DONE_STATUSES.has(task.status) && highlight) {
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'danger' };
    if (days === 0) return { text: 'Due today', tone: 'danger' };
    if (days === 1) return { text: 'Tomorrow', tone: 'warning' };
    if (days <= 3) return { text: formatDay(task.due_date), tone: 'warning' };
  }
  return { text: formatDay(task.due_date), tone: 'normal' };
}

/* ── Code / initials ─────────────────────────────────────────────────────── */

/** Client-built code (same as the web): first 4 letters of project name + padded id. */
export function taskCode(task: Pick<Task, 'id' | 'project'>): string {
  const key =
    (task.project?.name ?? 'TASK').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'TASK';
  return `${key}-${String(task.id).padStart(4, '0')}`;
}

export const initials = (name: string | null | undefined) =>
  name?.trim() ? name.trim().charAt(0).toUpperCase() : '?';

/* ── Quick filters ───────────────────────────────────────────────────────── */

export type QuickFilter = 'overdue' | 'qa_overdue' | 'blocked' | 'unassigned';
export const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'qa_overdue', label: 'QA overdue' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'unassigned', label: 'Unassigned' },
];

export function matchesQuick(task: Task, f: QuickFilter): boolean {
  switch (f) {
    case 'overdue':
      return isOverdue(task);
    case 'qa_overdue':
      return isQAOverdue(task);
    case 'blocked':
      return task.is_blocked;
    case 'unassigned':
      return isUnassigned(task);
  }
}

export function quickCounts(tasks: readonly Task[]): Record<QuickFilter, number> {
  const counts: Record<QuickFilter, number> = { overdue: 0, qa_overdue: 0, blocked: 0, unassigned: 0 };
  for (const t of tasks) for (const f of QUICK_FILTERS) if (matchesQuick(t, f.key)) counts[f.key] += 1;
  return counts;
}

/* ── Grouping (never re-sorts inside a group: server order is final) ─────── */

export interface TaskGroup {
  key: string;
  label: string;
  color: string | null;
  data: Task[];
}

export type GroupBy = 'status' | 'priority';

export function groupTasks(
  tasks: readonly Task[],
  config: readonly TaskStatusConfig[] | undefined,
  by: GroupBy,
): TaskGroup[] {
  const defs: { key: string; label: string; color: string | null }[] =
    by === 'status'
      ? (config ?? []).map((s) => ({ key: s.key, label: s.label, color: s.color }))
      : PRIORITIES.map((p) => ({ key: p, label: priorityLabel(p), color: null }));

  const buckets = new Map<string, Task[]>(defs.map((d) => [d.key, []]));
  const other: Task[] = [];
  for (const t of tasks) {
    const k = by === 'status' ? t.status : t.priority;
    const b = buckets.get(k);
    if (b) b.push(t);
    else other.push(t);
  }
  const groups: TaskGroup[] = defs
    .map((d) => ({ ...d, data: buckets.get(d.key) ?? [] }))
    .filter((g) => g.data.length > 0);
  if (other.length) groups.push({ key: '__other', label: 'Other', color: null, data: other });
  return groups;
}

/* ── Edit hint (list only; the server stays authoritative) ───────────────── */

/**
 * Port of the web useTaskPermissions: projects-menu edit, or team
 * can_edit_any_task / can_manage, or the user owns / created the task.
 * Conservative: unknown team -> only the owner/creator/admin rules apply.
 */
export function canEditTaskHint(args: {
  userId: number | undefined;
  task: Task;
  projectsMenuEdit: boolean;
  team: ProjectTeam | undefined;
}): boolean {
  const { userId, task, projectsMenuEdit, team } = args;
  if (userId === undefined) return false;
  const membership = team?.members.find((m) => m.user_id === userId);
  const elevated =
    projectsMenuEdit || membership?.permissions.can_edit_any_task === true || team?.can_manage === true;
  const mine =
    task.dev_owner_id === userId ||
    task.qa_owner_id === userId ||
    task.support_owner_id === userId ||
    task.created_by === userId;
  return elevated || mine;
}
