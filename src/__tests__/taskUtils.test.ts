import { parseTeam } from '@/api/models';
import { buildTaskParams } from '@/api/tasksApi';
import { statusConfig, task } from '@/test/fixtures';
import { resetNowProvider, setNowProvider } from '@/utils/dates';
import {
  allowedTargets,
  canEditTaskHint,
  cardFlag,
  dueLabel,
  groupTasks,
  isOverdue,
  isQAOverdue,
  isUnassigned,
  matchesQuick,
  quickCounts,
  sortByPriority,
  DONE_STATUSES,
  taskCode,
} from '@/utils/taskUtils';

// "Today" = 10 Oct 2026, 00:30 local (just after midnight: the risky moment).
beforeEach(() => setNowProvider(() => new Date(2026, 9, 10, 0, 30)));
afterEach(resetNowProvider);

describe('buildTaskParams', () => {
  it('sends only non-empty params', () => {
    expect(buildTaskParams({})).toEqual({});
    expect(
      buildTaskParams({ projectId: null, search: '   ', priority: '', taskType: '', sprintId: null, dateFrom: '', dateTo: '' }),
    ).toEqual({});
  });

  it('maps and trims set values; sprint accepts id or "none"', () => {
    expect(
      buildTaskParams({
        projectId: 4,
        search: '  #15 ',
        priority: 'HIGH',
        taskType: 'BUG',
        sprintId: 'none',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-31',
      }),
    ).toEqual({
      project_id: 4,
      search: '#15',
      priority: 'HIGH',
      task_type: 'BUG',
      sprint_id: 'none',
      date_from: '2026-10-01',
      date_to: '2026-10-31',
    });
    expect(buildTaskParams({ sprintId: 9 })).toEqual({ sprint_id: 9 });
    expect(buildTaskParams({ sprintId: 0 })).toEqual({});
  });
});

describe('taskCode', () => {
  it('uses the first 4 letters of the project name and pads the id to 4', () => {
    expect(taskCode(task({ id: 15 }))).toBe('ALPH-0015');
    expect(taskCode(task({ id: 12345 }))).toBe('ALPH-12345');
    expect(taskCode(task({ project: { id: 1, name: '42 Go!' } }))).toBe('GO-0015');
    expect(taskCode(task({ project: null }))).toBe('TASK-0015');
    expect(taskCode(task({ project: { id: 1, name: '123' } }))).toBe('TASK-0015');
  });
});

describe('overdue rules (calendar day, local)', () => {
  it('due yesterday is overdue; due today is not (even at 00:30)', () => {
    expect(isOverdue(task({ due_date: '2026-10-09' }))).toBe(true);
    expect(isOverdue(task({ due_date: '2026-10-10' }))).toBe(false);
    expect(isOverdue(task({ due_date: '2026-10-11' }))).toBe(false);
  });

  it('is never overdue when terminal or without a due date', () => {
    expect(isOverdue(task({ due_date: '2026-10-01', status: 'PASS' }))).toBe(false);
    expect(isOverdue(task({ due_date: '2026-10-01', status: 'DEFERRED' }))).toBe(false);
    expect(isOverdue(task({ due_date: null }))).toBe(false);
  });

  it('QA overdue needs a past release_to_qa_date and a pre-QA status', () => {
    expect(isQAOverdue(task({ release_to_qa_date: '2026-10-09', status: 'IN_PROGRESS' }))).toBe(true);
    expect(isQAOverdue(task({ release_to_qa_date: '2026-10-09', status: 'NOT_STARTED' }))).toBe(true);
    expect(isQAOverdue(task({ release_to_qa_date: '2026-10-09', status: 'DEV_DONE' }))).toBe(true);
    expect(isQAOverdue(task({ release_to_qa_date: '2026-10-09', status: 'READY_FOR_QA' }))).toBe(false);
    expect(isQAOverdue(task({ release_to_qa_date: '2026-10-10', status: 'IN_PROGRESS' }))).toBe(false);
    expect(isQAOverdue(task({ release_to_qa_date: null }))).toBe(false);
  });

  it('unassigned = no dev owner and no QA owner', () => {
    expect(isUnassigned(task({ dev_owner_id: null, qa_owner_id: null }))).toBe(true);
    expect(isUnassigned(task({ dev_owner_id: null, qa_owner_id: 3 }))).toBe(false);
    expect(isUnassigned(task({ dev_owner_id: 3 }))).toBe(false);
  });

  it('quick filter counts', () => {
    const list = [
      task({ id: 1, due_date: '2026-10-01' }),
      task({ id: 2, is_blocked: true, dev_owner_id: null }),
      task({ id: 3, release_to_qa_date: '2026-10-01' }),
    ];
    expect(quickCounts(list)).toEqual({ overdue: 1, qa_overdue: 1, blocked: 1, unassigned: 1 });
    expect(list.filter((t) => matchesQuick(t, 'blocked')).map((t) => t.id)).toEqual([2]);
  });
});

describe('cardFlag precedence', () => {
  it('blocked > QA overdue > at risk > none', () => {
    const all = { is_blocked: true, is_at_risk: true, release_to_qa_date: '2026-10-01', status: 'IN_PROGRESS' };
    expect(cardFlag(task(all))).toBe('blocked');
    expect(cardFlag(task({ ...all, is_blocked: false }))).toBe('qa_overdue');
    expect(cardFlag(task({ ...all, is_blocked: false, release_to_qa_date: null }))).toBe('at_risk');
    expect(cardFlag(task({ is_at_risk: false }))).toBeNull();
  });

  it('plain overdue is NOT a card flag', () => {
    expect(cardFlag(task({ due_date: '2026-10-01' }))).toBeNull();
  });
});

describe('dueLabel', () => {
  const fmt = (v: string) => `fmt:${v}`;
  it('only uses urgency wording when highlighted (Overdue chip)', () => {
    const t = task({ due_date: '2026-10-07' });
    expect(dueLabel(t, false, fmt)).toEqual({ text: 'fmt:2026-10-07', tone: 'normal' });
    expect(dueLabel(t, true, fmt)).toEqual({ text: '3d overdue', tone: 'danger' });
    expect(dueLabel(task({ due_date: '2026-10-10' }), true, fmt)?.text).toBe('Due today');
    expect(dueLabel(task({ due_date: '2026-10-11' }), true, fmt)?.text).toBe('Tomorrow');
    expect(dueLabel(task({ due_date: '2026-10-13' }), true, fmt)?.tone).toBe('warning');
    expect(dueLabel(task({ due_date: '2026-10-30' }), true, fmt)?.tone).toBe('normal');
  });
  it('is calm for terminal tasks and null without a date', () => {
    expect(dueLabel(task({ due_date: '2026-10-01', status: 'PASS' }), true, fmt)?.tone).toBe('normal');
    expect(dueLabel(task({ due_date: null }), true, fmt)).toBeNull();
  });
});

describe('status transitions', () => {
  const config = statusConfig();

  it('offers only allowed_transitions of the current status', () => {
    expect(allowedTargets(config, 'IN_PROGRESS').map((s) => s.key)).toEqual(['DEV_DONE', 'NOT_STARTED']);
    expect(allowedTargets(config, 'READY_FOR_QA').map((s) => s.key)).toEqual(['PASS', 'FAIL', 'DEFERRED', 'IN_PROGRESS']);
  });

  it('an empty allowed_transitions list means NO moves (nothing is hard-coded as terminal)', () => {
    expect(allowedTargets(config, 'PASS')).toEqual([]);
  });

  it('DEFERRED is movable when the DB says so (DEFERRED -> NOT_STARTED / IN_PROGRESS)', () => {
    const cfg = statusConfig().map((s) =>
      s.key === 'DEFERRED' ? { ...s, allowed_transitions: ['NOT_STARTED', 'IN_PROGRESS'] } : s,
    );
    expect(allowedTargets(cfg, 'DEFERRED').map((s) => s.key)).toEqual(['NOT_STARTED', 'IN_PROGRESS']);
  });

  it('PASS would be movable too if the table allowed it; the code never overrides the table', () => {
    const cfg = statusConfig().map((s) => (s.key === 'PASS' ? { ...s, allowed_transitions: ['REOPEN'] } : s));
    expect(allowedTargets(cfg, 'PASS').map((s) => s.key)).toEqual(['REOPEN']);
  });

  it('is empty for unknown status or missing config (never the whole pipeline)', () => {
    expect(allowedTargets(config, 'WHATEVER')).toEqual([]);
    expect(allowedTargets(undefined, 'IN_PROGRESS')).toEqual([]);
  });

  it('ignores transition targets that are not in the config', () => {
    const cfg = statusConfig().map((s) => (s.key === 'IN_PROGRESS' ? { ...s, allowed_transitions: ['GHOST', 'DEV_DONE'] } : s));
    expect(allowedTargets(cfg, 'IN_PROGRESS').map((s) => s.key)).toEqual(['DEV_DONE']);
  });

  it('the "done" set is a separate, display-only definition (PASS + DEFERRED)', () => {
    expect([...DONE_STATUSES].sort()).toEqual(['DEFERRED', 'PASS']);
    // done-for-display does not make DEFERRED immovable:
    const cfg = statusConfig().map((s) => (s.key === 'DEFERRED' ? { ...s, allowed_transitions: ['NOT_STARTED'] } : s));
    expect(allowedTargets(cfg, 'DEFERRED')).toHaveLength(1);
    expect(DONE_STATUSES.has('DEFERRED')).toBe(true);
  });
});

describe('groupTasks', () => {
  const config = statusConfig();
  it('orders by config order_index, hides empty groups and keeps server order inside', () => {
    const list = [
      task({ id: 1, status: 'PASS' }),
      task({ id: 2, status: 'NOT_STARTED' }),
      task({ id: 3, status: 'PASS' }),
      task({ id: 4, status: 'MYSTERY' }),
    ];
    const g = groupTasks(list, config, 'status');
    expect(g.map((x) => x.key)).toEqual(['NOT_STARTED', 'PASS', '__other']);
    expect(g[1]?.data.map((t) => t.id)).toEqual([1, 3]);
  });
  it('groups by priority CRITICAL..LOW', () => {
    const g = groupTasks([task({ id: 1, priority: 'LOW' }), task({ id: 2, priority: 'CRITICAL' })], config, 'priority');
    expect(g.map((x) => x.key)).toEqual(['CRITICAL', 'LOW']);
  });
});

describe('sortByPriority (dashboard sections)', () => {
  it('CRITICAL > HIGH > MEDIUM > LOW, stable, unknown last', () => {
    const sorted = sortByPriority([
      task({ id: 1, priority: 'LOW' }),
      task({ id: 2, priority: 'CRITICAL' }),
      task({ id: 3, priority: 'ODD' }),
      task({ id: 4, priority: 'CRITICAL' }),
      task({ id: 5, priority: 'MEDIUM' }),
      task({ id: 6, priority: 'HIGH' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([2, 4, 6, 5, 1, 3]);
  });
});

describe('canEditTaskHint (port of useTaskPermissions)', () => {
  const t = task({ dev_owner_id: 9, qa_owner_id: null, support_owner_id: null, created_by: 2 });
  const teamWith = (me: number, permissions: Record<string, boolean>, can_manage = false) =>
    parseTeam({ can_manage, members: [{ id: 1, user_id: me, permissions }] });

  it('owners and the creator can edit', () => {
    expect(canEditTaskHint({ userId: 9, task: t, projectsMenuEdit: false, team: undefined })).toBe(true);
    expect(canEditTaskHint({ userId: 2, task: t, projectsMenuEdit: false, team: undefined })).toBe(true);
    expect(canEditTaskHint({ userId: 5, task: t, projectsMenuEdit: false, team: undefined })).toBe(false);
  });
  it('projects-menu edit, can_edit_any_task and can_manage elevate', () => {
    expect(canEditTaskHint({ userId: 5, task: t, projectsMenuEdit: true, team: undefined })).toBe(true);
    expect(canEditTaskHint({ userId: 5, task: t, projectsMenuEdit: false, team: teamWith(5, { can_edit_any_task: true }) })).toBe(true);
    expect(canEditTaskHint({ userId: 5, task: t, projectsMenuEdit: false, team: teamWith(5, {}, true) })).toBe(true);
    expect(canEditTaskHint({ userId: 5, task: t, projectsMenuEdit: false, team: teamWith(5, { can_assign_task: true }) })).toBe(false);
  });
  it('is false without a user id', () => {
    expect(canEditTaskHint({ userId: undefined, task: t, projectsMenuEdit: true, team: undefined })).toBe(false);
  });
});
