/**
 * Role dashboards. Endpoints (task-tracking-api routes/dashboardRoutes.js):
 *   /dashboard/client-stats | developer-stats | qa-stats | tl-stats | pm-stats
 *
 * Field names for the keys listed by the NodeJS/ReactJS devs are verified;
 * everything else is NV, so every parser tolerates missing or null fields and
 * never throws.
 */
import { get } from './client';
import { parseTasks, type Task } from './models';
import { asObj, mapArray, nonEmpty, num, numOr } from './parse';

const count = (v: unknown) => Math.max(0, Math.round(numOr(v)));

/* ── Client ──────────────────────────────────────────────────────────────── */

export interface ClientProject {
  id: number;
  name: string;
  color: string | null;
  status: string | null;
  completionPct: number;
  doneTasks: number;
  totalTasks: number;
  pendingTasks: number;
  activeTasks: number;
  openTickets: number;
  activeSprint: { name: string; end_date: string | null } | null;
}

export interface ClientDashboard {
  summary: {
    totalProjects: number;
    activeProjects: number;
    totalTasks: number;
    completedTasks: number;
    completionPct: number;
    openTickets: number;
  };
  projects: ClientProject[];
}

export function parseClientStats(raw: unknown): ClientDashboard {
  const o = asObj(raw);
  const s = asObj(o.summary);
  const projects = mapArray(o.projects, (p): ClientProject | null => {
    const po = asObj(p);
    const id = num(po.id);
    if (id === null) return null;
    const sprint = asObj(po.activeSprint);
    return {
      id,
      name: nonEmpty(po.name) ?? `Project ${id}`,
      color: nonEmpty(po.color),
      status: nonEmpty(po.status),
      completionPct: clampPct(po.completionPct),
      // ASSUMPTION: web reads `doneTasks`; summary uses `completedTasks`. Accept both.
      doneTasks: count(po.doneTasks ?? po.completedTasks),
      totalTasks: count(po.totalTasks),
      pendingTasks: count(po.pendingTasks),
      activeTasks: count(po.activeTasks),
      openTickets: count(po.openTickets),
      activeSprint: nonEmpty(sprint.name)
        ? { name: nonEmpty(sprint.name) as string, end_date: nonEmpty(sprint.end_date) }
        : null,
    };
  });
  return {
    summary: {
      totalProjects: count(s.totalProjects ?? projects.length),
      activeProjects: count(s.activeProjects),
      totalTasks: count(s.totalTasks),
      completedTasks: count(s.completedTasks),
      completionPct: clampPct(s.completionPct),
      openTickets: count(s.openTickets),
    },
    projects,
  };
}

export function clampPct(v: unknown): number {
  return Math.min(100, Math.max(0, Math.round(numOr(v))));
}

/* ── Developer ───────────────────────────────────────────────────────────── */

export interface DeveloperDashboard {
  todayTasks: Task[];
  problemTasks: Task[];
  upcomingTasks: Task[];
  oldPendingTasks: Task[];
  stats: { activeTasks: number; completedToday: number; overdueTasks: number };
}

export function parseDeveloperStats(raw: unknown): DeveloperDashboard {
  const o = asObj(raw);
  const s = asObj(o.stats);
  const oldPendingTasks = parseTasks(o.oldPendingTasks);
  return {
    todayTasks: parseTasks(o.todayTasks),
    problemTasks: parseTasks(o.problemTasks),
    upcomingTasks: parseTasks(o.upcomingTasks),
    oldPendingTasks,
    stats: {
      activeTasks: count(s.activeTasks),
      completedToday: count(s.completedToday),
      overdueTasks: count(s.overdueTasks),
    },
  };
}

/* ── QA ──────────────────────────────────────────────────────────────────── */

export interface QADashboard {
  myReadyForQA: Task[];
  myFailed: Task[];
  myReopened: Task[];
  unassigned: Task[];
  stats: { activeTasks: number; passedTasks: number; needsRetest: number };
}

export function parseQAStats(raw: unknown): QADashboard {
  const o = asObj(raw);
  const s = asObj(o.stats);
  return {
    myReadyForQA: parseTasks(o.myReadyForQA),
    myFailed: parseTasks(o.myFailed),
    myReopened: parseTasks(o.myReopened),
    unassigned: parseTasks(o.unassigned),
    stats: {
      activeTasks: count(s.activeTasks),
      passedTasks: count(s.passedTasks),
      needsRetest: count(s.needsRetest),
    },
  };
}

/* ── Tech lead ───────────────────────────────────────────────────────────── */

export interface SprintHealth {
  id: number | null;
  name: string;
  daysLeft: number | null;
  pctComplete: number;
  total: number;
  passed: number;
  inProgress: number;
  inQA: number;
  end_date: string | null;
}

export interface TLDashboard {
  kpis: {
    inProgress: number;
    devDone: number;
    blockedCount: number;
    atRiskCount: number;
    unassignedCount: number;
    completedThisWeek: number;
    completedLastWeek: number;
  };
  overdueTasks: Task[];
  blockedTasks: Task[];
  qaQueue: Task[];
  sprintHealth: SprintHealth[];
  projectIds: number[];
}

export function parseTLStats(raw: unknown): TLDashboard {
  const o = asObj(raw);
  const k = asObj(o.kpis);
  return {
    kpis: {
      inProgress: count(k.inProgress),
      devDone: count(k.devDone),
      blockedCount: count(k.blockedCount),
      atRiskCount: count(k.atRiskCount),
      unassignedCount: count(k.unassignedCount),
      completedThisWeek: count(k.completedThisWeek),
      completedLastWeek: count(k.completedLastWeek),
    },
    overdueTasks: parseTasks(o.overdueTasks),
    blockedTasks: parseTasks(o.blockedTasks),
    // ASSUMPTION: qaQueue is a task array; if it is an object/count we show 0.
    qaQueue: parseTasks(o.qaQueue),
    sprintHealth: mapArray(o.sprintHealth, (h): SprintHealth | null => {
      const ho = asObj(h);
      const name = nonEmpty(ho.name);
      if (!name) return null;
      return {
        id: num(ho.id),
        name,
        daysLeft: num(ho.daysLeft),
        pctComplete: clampPct(ho.pctComplete),
        total: count(ho.total),
        passed: count(ho.passed),
        inProgress: count(ho.inProgress),
        inQA: count(ho.inQA),
        end_date: nonEmpty(ho.end_date),
      };
    }),
    projectIds: mapArray(o.projectIds, (v) => num(v)),
  };
}

/* ── Project manager ─────────────────────────────────────────────────────── */

export interface PMSprint {
  id: number;
  name: string;
  projectName: string | null;
  end_date: string | null;
  daysLeft: number | null;
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  progress: number;
}

export interface PMRelease {
  id: number;
  name: string;
  version: string | null;
  status: string | null;
  progress: number;
  release_date: string | null;
}

export interface PMDashboard {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  openTickets: number;
  tasksByStatus: { status: string; count: number }[];
  sprintOverview: PMSprint[];
  releases: PMRelease[];
  overloadedUsers: { id: number; name: string; roleName: string | null }[];
  recentActivity: { id: number; text: string; actor: string | null; at: string | null }[];
}

/** ASSUMPTION: tasksByStatus is either {STATUS: n} or [{status, count}]. */
function parseStatusCounts(v: unknown): { status: string; count: number }[] {
  if (Array.isArray(v)) {
    return mapArray(v, (r) => {
      const ro = asObj(r);
      const status = nonEmpty(ro.status);
      return status ? { status, count: count(ro.count) } : null;
    });
  }
  return Object.entries(asObj(v)).map(([status, c]) => ({ status, count: count(c) }));
}

export function parsePMStats(raw: unknown): PMDashboard {
  const o = asObj(raw);
  const t = asObj(o.ticketStats);
  return {
    totalTasks: count(o.totalTasks),
    completedTasks: count(o.completedTasks),
    overdueTasks: count(o.overdueTasks),
    openTickets: count(t.open),
    tasksByStatus: parseStatusCounts(o.tasksByStatus),
    sprintOverview: mapArray(o.sprintOverview, (s): PMSprint | null => {
      const so = asObj(s);
      const id = num(so.id);
      if (id === null) return null;
      return {
        id,
        name: nonEmpty(so.name) ?? `Sprint ${id}`,
        projectName: nonEmpty(asObj(so.project).name),
        end_date: nonEmpty(so.end_date),
        daysLeft: num(so.daysLeft),
        totalTasks: count(so.totalTasks),
        doneTasks: count(so.doneTasks),
        blockedTasks: count(so.blockedTasks),
        progress: clampPct(so.progress),
      };
    }),
    releases: mapArray(o.releases, (r): PMRelease | null => {
      const ro = asObj(r);
      const id = num(ro.id);
      if (id === null) return null;
      return {
        id,
        name: nonEmpty(ro.name) ?? `Release ${id}`,
        version: nonEmpty(ro.version),
        status: nonEmpty(ro.status),
        progress: clampPct(ro.progress_percentage),
        release_date: nonEmpty(ro.release_date),
      };
    }),
    overloadedUsers: mapArray(o.overloadedUsers, (u) => {
      const uo = asObj(u);
      const id = num(uo.id);
      if (id === null) return null;
      return { id, name: nonEmpty(uo.name) ?? 'Unknown', roleName: nonEmpty(asObj(uo.userRole).name) };
    }),
    // ASSUMPTION: activity rows carry id, action/entity_type text, actor{name}, created_at.
    recentActivity: mapArray(o.recentActivity, (a) => {
      const ao = asObj(a);
      const id = num(ao.id);
      if (id === null) return null;
      const action = nonEmpty(ao.action) ?? 'updated';
      const entity = nonEmpty(ao.entity_type) ?? 'item';
      return {
        id,
        text: `${entity} ${action.replace(/_/g, ' ')}`,
        actor: nonEmpty(asObj(ao.actor).name),
        at: nonEmpty(ao.created_at) ?? nonEmpty(ao.createdAt),
      };
    }),
  };
}

/* ── Fetchers ────────────────────────────────────────────────────────────── */

export const getClientStats = async () => parseClientStats(await get<unknown>('/dashboard/client-stats'));
export const getDeveloperStats = async () =>
  parseDeveloperStats(await get<unknown>('/dashboard/developer-stats'));
export const getQAStats = async () => parseQAStats(await get<unknown>('/dashboard/qa-stats'));
export const getTLStats = async () => parseTLStats(await get<unknown>('/dashboard/tl-stats'));
export const getPMStats = async () => parsePMStats(await get<unknown>('/dashboard/pm-stats'));

