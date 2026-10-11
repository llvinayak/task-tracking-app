/**
 * Sprints (read-only on mobile). Endpoints (task-tracking-api routes/sprintRoutes.js):
 *   GET /sprints?project_id&product_id    GET /sprints/:id    GET /sprints/:id/metrics
 * project_id / product_id are validated server-side as integers (400 otherwise),
 * so they are validated here first and only sent when set.
 */
import { get } from './client';
import { AppError } from './errors';
import { parseNumericId } from './ticketsApi';
import { asArray, asObj, mapArray, nonEmpty, num, numOr } from './parse';

export interface SprintTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  is_blocked: boolean;
  estimated_hours: number | null;
  devOwnerName: string | null;
  qaOwnerName: string | null;
}

export interface Sprint {
  id: number;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  goal: string | null;
  project: { id: number; name: string; color: string | null } | null;
  taskCount: number;
  completedCount: number;
  blockedCount: number;
  estimatedHours: number;
  actualHours: number;
  completionPct: number;
  tasks: SprintTask[];
  subSprints: Sprint[];
}

const parseSprintTask = (t: unknown): SprintTask | null => {
  const o = asObj(t);
  const id = num(o.id);
  if (id === null) return null;
  return {
    id,
    title: nonEmpty(o.title) ?? `Task ${id}`,
    status: nonEmpty(o.status) ?? '',
    priority: nonEmpty(o.priority) ?? '',
    is_blocked: o.is_blocked === true,
    estimated_hours: num(o.estimated_hours),
    devOwnerName: nonEmpty(asObj(o.devOwner).name),
    qaOwnerName: nonEmpty(asObj(o.qaOwner).name),
  };
};

export function parseSprint(raw: unknown, withSubs = true): Sprint | null {
  const o = asObj(raw);
  const id = num(o.id);
  if (id === null) return null;
  const p = asObj(o.project);
  const pid = num(p.id);
  const tasks = mapArray(o.tasks, parseSprintTask);
  return {
    id,
    name: nonEmpty(o.name) ?? `Sprint ${id}`,
    status: nonEmpty(o.status) ?? 'planning',
    start_date: nonEmpty(o.start_date),
    end_date: nonEmpty(o.end_date),
    goal: nonEmpty(o.goal),
    project: pid === null ? null : { id: pid, name: nonEmpty(p.name) ?? 'Project', color: nonEmpty(p.color) },
    // The server derives these from `tasks`; fall back to our own count when absent.
    taskCount: num(o.taskCount) ?? tasks.length,
    completedCount: numOr(o.completedCount),
    blockedCount: numOr(o.blockedCount),
    estimatedHours: numOr(o.estimatedHours),
    actualHours: numOr(o.actualHours),
    completionPct: Math.min(100, Math.max(0, Math.round(numOr(o.completionPct)))),
    tasks,
    subSprints: withSubs ? mapArray(o.subSprints, (s) => parseSprint(s, false)) : [],
  };
}

export const parseSprints = (raw: unknown): Sprint[] => mapArray(raw, (s) => parseSprint(s));

export interface SprintFilters {
  projectId?: number | null;
  productId?: number | null;
}

/** Neither => all visible top-level sprints. Only valid positive integers are sent. */
export function buildSprintParams(f: SprintFilters): Record<string, number> {
  const p: Record<string, number> = {};
  const project = parseNumericId(f.projectId ?? undefined);
  const product = parseNumericId(f.productId ?? undefined);
  if (project !== null) p.project_id = project;
  if (product !== null) p.product_id = product;
  return p;
}

export const getSprints = async (f: SprintFilters): Promise<Sprint[]> =>
  parseSprints(await get<unknown>('/sprints', { params: buildSprintParams(f) }));

function idOrThrow(id: unknown): number {
  const n = parseNumericId(id);
  if (n === null) throw new AppError({ kind: 'validation', message: 'That sprint link is not valid.' });
  return n;
}

export async function getSprint(id: unknown): Promise<Sprint> {
  const n = idOrThrow(id);
  const s = parseSprint(await get<unknown>(`/sprints/${n}`));
  if (!s) throw new AppError({ kind: 'unknown', message: 'This sprint could not be loaded.' });
  return s;
}

/* ── Metrics ─────────────────────────────────────────────────────────────── */

export interface BurnPoint {
  date: string;
  remaining_hours: number;
  total_hours: number;
  completed_tasks: number;
  total_tasks: number;
}

export interface SprintMetrics {
  committed: { tasks: number; estimated_hours: number } | null;
  delivered: { tasks: number; estimated_hours: number };
  scope: { tasks: number; estimated_hours: number; blocked_tasks: number; unfinished_tasks: number; change_tasks: number | null; change_pct: number | null };
  effort: { estimated_hours: number; logged_hours: number; ratio: number | null; variance_hours: number };
  progress: { completion_pct: number; velocity_hours: number | null; velocity_tasks: number | null; commitment_met_pct: number | null };
  duration: { planned_days: number | null; actual_days: number | null };
  burndown: BurnPoint[];
  /** Server shape (sprintMetricsService idealLine): [{date, ideal}]. Other keys and bare numbers are tolerated. */
  ideal: { date: string | null; remaining_hours: number }[];
}

export function parseSprintMetrics(raw: unknown): SprintMetrics {
  const o = asObj(raw);
  const c = asObj(o.committed);
  const d = asObj(o.delivered);
  const sc = asObj(o.scope);
  const ef = asObj(o.effort);
  const pr = asObj(o.progress);
  const du = asObj(o.duration);
  return {
    committed: o.committed ? { tasks: numOr(c.tasks), estimated_hours: numOr(c.estimated_hours) } : null,
    delivered: { tasks: numOr(d.tasks), estimated_hours: numOr(d.estimated_hours) },
    scope: {
      tasks: numOr(sc.tasks),
      estimated_hours: numOr(sc.estimated_hours),
      blocked_tasks: numOr(sc.blocked_tasks),
      unfinished_tasks: numOr(sc.unfinished_tasks),
      change_tasks: num(sc.change_tasks),
      change_pct: num(sc.change_pct),
    },
    effort: {
      estimated_hours: numOr(ef.estimated_hours),
      logged_hours: numOr(ef.logged_hours),
      ratio: num(ef.ratio),
      variance_hours: numOr(ef.variance_hours),
    },
    progress: {
      completion_pct: Math.min(100, Math.max(0, Math.round(numOr(pr.completion_pct)))),
      velocity_hours: num(pr.velocity_hours),
      velocity_tasks: num(pr.velocity_tasks),
      commitment_met_pct: num(pr.commitment_met_pct),
    },
    duration: { planned_days: num(du.planned_days), actual_days: num(du.actual_days) },
    burndown: mapArray(o.burndown, (b): BurnPoint | null => {
      const bo = asObj(b);
      const date = nonEmpty(bo.date);
      return date
        ? {
            date,
            remaining_hours: numOr(bo.remaining_hours),
            total_hours: numOr(bo.total_hours),
            completed_tasks: numOr(bo.completed_tasks),
            total_tasks: numOr(bo.total_tasks),
          }
        : null;
    }),
    ideal: asArray(o.ideal)
      .map((p) => {
        if (typeof p === 'number') return { date: null, remaining_hours: p };
        const po = asObj(p);
        const v = num(po.ideal) ?? num(po.remaining_hours) ?? num(po.ideal_hours) ?? num(po.hours) ?? num(po.value) ?? num(po.remaining);
        return v === null ? null : { date: nonEmpty(po.date), remaining_hours: v };
      })
      .filter((x): x is { date: string | null; remaining_hours: number } => x !== null),
  };
}

export async function getSprintMetrics(id: unknown): Promise<SprintMetrics> {
  return parseSprintMetrics(await get<unknown>(`/sprints/${idOrThrow(id)}/metrics`));
}

/* ── Grouping for the list ───────────────────────────────────────────────── */

export const SPRINT_STATUS_ORDER = ['active', 'planning', 'completed'] as const;

export interface SprintGroup {
  status: string;
  label: string;
  data: Sprint[];
}

/** The one label for a sprint status (list headers, detail badge, sub-sprint badges). */
export const sprintStatusLabel = (s: string): string => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const labelOf = sprintStatusLabel;

/** Groups by the status VALUES present in the data (known ones first); empty groups are hidden. */
export function groupSprintsByStatus(sprints: readonly Sprint[]): SprintGroup[] {
  const by = new Map<string, Sprint[]>();
  for (const s of sprints) by.set(s.status, [...(by.get(s.status) ?? []), s]);
  const known = SPRINT_STATUS_ORDER.filter((k) => by.has(k));
  const other = [...by.keys()].filter((k) => !(SPRINT_STATUS_ORDER as readonly string[]).includes(k)).sort();
  return [...known, ...other].map((status) => ({ status, label: labelOf(status), data: by.get(status) ?? [] }));
}
