import {
  parseClientStats,
  parseDeveloperStats,
  parsePMStats,
  parseQAStats,
  parseTLStats,
} from '@/api/dashboardApi';
import { dashboardViewForRole } from '@/config/dashboardRoles';
import { lateDays } from '@/features/dashboard/views';
import { task } from '@/test/fixtures';
import { resetNowProvider, setNowProvider } from '@/utils/dates';

describe('dashboardViewForRole', () => {
  it.each([
    [6, 'client'],
    [5, 'developer'],
    [4, 'qa'],
    [3, 'techLead'],
    [2, 'projectManager'],
    [1, 'cto'],
    [7, 'cto'],
    [8, 'cto'],
    [9, 'cto'],
    [999, 'cto'],
    [0, 'cto'],
    [undefined, 'cto'],
    [null, 'cto'],
  ])('role %p -> %s', (role, view) => {
    expect(dashboardViewForRole(role as number | undefined | null)).toBe(view);
  });
});

describe('dashboard parsers tolerate null / missing / wrong-typed fields', () => {
  const garbage: unknown[] = [null, undefined, {}, [], 'x', 5, { stats: null, kpis: 3 }];

  it.each(garbage)('never throws for %p', (raw) => {
    expect(() => parseClientStats(raw)).not.toThrow();
    expect(() => parseDeveloperStats(raw)).not.toThrow();
    expect(() => parseQAStats(raw)).not.toThrow();
    expect(() => parseTLStats(raw)).not.toThrow();
    expect(() => parsePMStats(raw)).not.toThrow();
  });

  it('client: defaults, accepts doneTasks or completedTasks, clamps pct', () => {
    const d = parseClientStats({
      summary: { totalProjects: '3', completionPct: 140 },
      projects: [
        { id: 1, name: 'A', completionPct: -5, completedTasks: 2, totalTasks: 4, activeSprint: { name: 'S1', end_date: '2026-10-20' } },
        { name: 'no id' },
        null,
      ],
    });
    expect(d.summary.totalProjects).toBe(3);
    expect(d.summary.completionPct).toBe(100);
    expect(d.projects).toHaveLength(1);
    expect(d.projects[0]).toMatchObject({ completionPct: 0, doneTasks: 2, totalTasks: 4, pendingTasks: 0 });
    expect(d.projects[0]?.activeSprint?.name).toBe('S1');
    expect(parseClientStats(null).summary).toMatchObject({ totalProjects: 0, openTickets: 0 });
  });

  it('developer: skips rows without an id, defaults stats', () => {
    const d = parseDeveloperStats({
      todayTasks: [{ id: 1, title: 'a', priority: 'HIGH' }, { title: 'bad' }, null],
      problemTasks: 'nope',
      stats: { activeTasks: '4', completedToday: null },
    });
    expect(d.todayTasks.map((t) => t.id)).toEqual([1]);
    expect(d.problemTasks).toEqual([]);
    expect(d.stats).toEqual({ activeTasks: 4, completedToday: 0, overdueTasks: 0 });
  });

  it('qa: reads all lists and stats', () => {
    const d = parseQAStats({
      myReadyForQA: [{ id: 1 }],
      myFailed: [{ id: 2 }],
      myReopened: [{ id: 3 }],
      unassigned: [{ id: 4 }],
      stats: { activeTasks: 1, passedTasks: 2, needsRetest: 3 },
    });
    expect([d.myReadyForQA, d.myFailed, d.myReopened, d.unassigned].map((l) => l.length)).toEqual([1, 1, 1, 1]);
    expect(d.stats.needsRetest).toBe(3);
  });

  it('tech lead: kpis, sprint health, empty projectIds', () => {
    const d = parseTLStats({
      kpis: { inProgress: 3, blockedCount: 1 },
      sprintHealth: [{ name: 'S1', daysLeft: '4', pctComplete: 55.4, total: 10, passed: 5 }, { total: 2 }],
      projectIds: [1, 'x', 2],
    });
    expect(d.kpis.inProgress).toBe(3);
    expect(d.kpis.atRiskCount).toBe(0);
    expect(d.sprintHealth).toEqual([
      { id: null, name: 'S1', daysLeft: 4, pctComplete: 55, total: 10, passed: 5, inProgress: 0, inQA: 0, end_date: null },
    ]);
    expect(d.projectIds).toEqual([1, 2]);
    expect(parseTLStats(null).projectIds).toEqual([]);
  });

  it('pm: tasksByStatus as object or array, releases, overloaded users, tickets', () => {
    const base = {
      totalTasks: 10,
      completedTasks: 4,
      ticketStats: { open: 2 },
      sprintOverview: [{ id: 1, name: 'S', project: { name: 'P' }, daysLeft: -1, totalTasks: 5, doneTasks: 2, progress: 40 }, { name: 'no id' }],
      releases: [{ id: 3, name: 'R', version: '1.2', progress_percentage: '75' }],
      overloadedUsers: [{ id: 9, name: 'Z', userRole: { name: 'Developer' } }],
    };
    const a = parsePMStats({ ...base, tasksByStatus: { PASS: 3, FAIL: '1' } });
    expect(a.tasksByStatus).toEqual([{ status: 'PASS', count: 3 }, { status: 'FAIL', count: 1 }]);
    const b = parsePMStats({ ...base, tasksByStatus: [{ status: 'PASS', count: 2 }, { count: 1 }] });
    expect(b.tasksByStatus).toEqual([{ status: 'PASS', count: 2 }]);
    expect(a.openTickets).toBe(2);
    expect(a.sprintOverview).toHaveLength(1);
    expect(a.sprintOverview[0]).toMatchObject({ projectName: 'P', daysLeft: -1, progress: 40 });
    expect(a.releases[0]).toMatchObject({ version: '1.2', progress: 75 });
    expect(a.overloadedUsers[0]).toEqual({ id: 9, name: 'Z', roleName: 'Developer' });
  });
});

describe('lateDays', () => {
  afterEach(resetNowProvider);
  it('counts days past due (else start) date, never negative', () => {
    setNowProvider(() => new Date(2026, 9, 10, 9));
    expect(lateDays(task({ due_date: '2026-10-07' }))).toBe(3);
    expect(lateDays(task({ due_date: null, start_date: '2026-10-09' }))).toBe(1);
    expect(lateDays(task({ due_date: '2026-10-20' }))).toBe(0);
    expect(lateDays(task({ due_date: null, start_date: null }))).toBeNull();
  });
});
