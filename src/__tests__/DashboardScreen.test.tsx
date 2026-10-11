import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import * as dashboardApi from '@/api/dashboardApi';
import { AppError } from '@/api/errors';
import { parseStatusConfig } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider, setNowProvider } from '@/utils/dates';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
  useIsFocused: () => true,
}));
jest.mock('@/api/dashboardApi', () => ({
  ...jest.requireActual('@/api/dashboardApi'),
  getClientStats: jest.fn(),
  getDeveloperStats: jest.fn(),
  getQAStats: jest.fn(),
  getTLStats: jest.fn(),
  getPMStats: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const dash = dashboardApi as jest.Mocked<typeof dashboardApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const as = (roleId: number) =>
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ roleId }) });
const render = () => renderWithProviders(<DashboardScreen />);

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
});
afterEach(() => {
  resetNowProvider();
  jest.useRealTimers();
});

const devData = (over: Record<string, unknown> = {}) =>
  dashboardApi.parseDeveloperStats({
    stats: { activeTasks: 5, completedToday: 2, overdueTasks: 1 },
    todayTasks: [
      rawTask({ id: 1, title: 'Low one', priority: 'LOW' }),
      rawTask({ id: 2, title: 'Critical one', priority: 'CRITICAL' }),
      rawTask({ id: 3, title: 'High one', priority: 'HIGH' }),
    ],
    problemTasks: [rawTask({ id: 4, title: 'Failed QA', status: 'FAIL', reopen_count: 3, is_blocked: true })],
    oldPendingTasks: [rawTask({ id: 5, title: 'Stale', status: 'NOT_STARTED', due_date: '2026-10-07' })],
    upcomingTasks: [],
    ...over,
  });

describe('role -> view', () => {
  it.each([
    [5, 'getDeveloperStats'],
    [4, 'getQAStats'],
    [3, 'getTLStats'],
    [2, 'getPMStats'],
    [6, 'getClientStats'],
  ] as const)('role %i loads %s only', async (role, fn) => {
    dash.getDeveloperStats.mockResolvedValue(dashboardApi.parseDeveloperStats(null));
    dash.getQAStats.mockResolvedValue(dashboardApi.parseQAStats(null));
    dash.getTLStats.mockResolvedValue(dashboardApi.parseTLStats(null));
    dash.getPMStats.mockResolvedValue(dashboardApi.parsePMStats(null));
    dash.getClientStats.mockResolvedValue(dashboardApi.parseClientStats(null));
    as(role);
    render();
    await screen.findByText('Dashboard');
    await act(async () => undefined);
    expect(dash[fn]).toHaveBeenCalledTimes(1);
    for (const other of ['getDeveloperStats', 'getQAStats', 'getTLStats', 'getPMStats', 'getClientStats'] as const) {
      if (other !== fn) expect(dash[other]).not.toHaveBeenCalled();
    }
  });

  it.each([1, 7, 8, 9, 42])('role %i (CTO / unknown) gets the CTO segmented view, PM first', async (role) => {
    dash.getPMStats.mockResolvedValue(dashboardApi.parsePMStats({ totalTasks: 12 }));
    dash.getTLStats.mockResolvedValue(dashboardApi.parseTLStats({ projectIds: [1], kpis: { inProgress: 4 } }));
    as(role);
    render();
    expect(await screen.findByText('Total tasks')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Project manager' }).props.accessibilityState.selected).toBe(true);
    expect(dash.getTLStats).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('tab', { name: 'Team health' }));
    expect(await screen.findByText('In progress')).toBeTruthy();
    expect(dash.getTLStats).toHaveBeenCalledTimes(1);
  });
});

describe('every view has loading, error-with-retry and empty states', () => {
  it('shows loading, then recovers from an error via retry (web renders nothing)', async () => {
    dash.getDeveloperStats.mockRejectedValueOnce(new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side.' }));
    as(5);
    render();
    expect(screen.getByLabelText('Loading dashboard...')).toBeTruthy();
    expect(await screen.findByText('Something went wrong on our side.')).toBeTruthy();
    dash.getDeveloperStats.mockResolvedValue(devData());
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Today\'s focus')).toBeTruthy();
  });

  it('client without a linked account shows the server message verbatim', async () => {
    dash.getClientStats.mockRejectedValue(new AppError({ kind: 'forbidden', status: 403, message: 'No client linked to this account' }));
    as(6);
    render();
    expect(await screen.findByText('No client linked to this account')).toBeTruthy();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('tech lead with no memberships sees an explanatory empty state', async () => {
    dash.getTLStats.mockResolvedValue(dashboardApi.parseTLStats({ projectIds: [] }));
    as(3);
    render();
    expect(await screen.findByText('No team data yet')).toBeTruthy();
    expect(screen.getByText(/only covers projects you are a member of/)).toBeTruthy();
  });

  it('CTO Team health empty state names Team Health', async () => {
    dash.getPMStats.mockResolvedValue(dashboardApi.parsePMStats({}));
    dash.getTLStats.mockResolvedValue(dashboardApi.parseTLStats({ projectIds: [] }));
    as(1);
    render();
    await screen.findByText('Total tasks');
    fireEvent.press(screen.getByRole('tab', { name: 'Team health' }));
    expect(await screen.findByText(/Team Health only covers projects you are a member of/)).toBeTruthy();
  });

  it('empty client, QA, PM data render without crashing', async () => {
    dash.getClientStats.mockResolvedValue(dashboardApi.parseClientStats({}));
    as(6);
    const { unmount } = render();
    expect(await screen.findByText('No projects yet')).toBeTruthy();
    unmount();

    dash.getQAStats.mockResolvedValue(dashboardApi.parseQAStats(null));
    as(4);
    const second = render();
    expect(await screen.findByText('Nothing waiting for you.')).toBeTruthy();
    second.unmount();

    dash.getPMStats.mockResolvedValue(dashboardApi.parsePMStats(undefined));
    as(2);
    render();
    expect(await screen.findByText('No active sprints.')).toBeTruthy();
    expect(screen.getByText('No releases.')).toBeTruthy();
  });

  it('keeps showing the last data with a notice when a refresh fails', async () => {
    dash.getDeveloperStats.mockResolvedValue(devData());
    as(5);
    const { queryClient } = render();
    await screen.findByText('Active tasks');
    dash.getDeveloperStats.mockRejectedValue(new AppError({ kind: 'network', message: "Can't reach the server." }));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['dashboard', 'developer'] });
    });
    expect(await screen.findByText(/Couldn't refresh: Can't reach the server\./)).toBeTruthy();
    expect(screen.getByText('Active tasks')).toBeTruthy();
  });
});

describe('Developer content', () => {
  it('KPIs, priority-sorted Today\'s focus, Needs attention, Old pending with "Nd late"', async () => {
    dash.getDeveloperStats.mockResolvedValue(devData());
    as(5);
    render();
    expect(await screen.findByText('Active tasks')).toBeTruthy();
    expect(screen.getByLabelText('Active tasks: 5')).toBeTruthy();
    expect(screen.getByLabelText('Completed today: 2')).toBeTruthy();
    expect(screen.getByLabelText(/Overdue: 1/)).toBeTruthy();
    expect(screen.getByLabelText(/Old pending: 1/)).toBeTruthy();

    const order = ['Critical one', 'High one', 'Low one'].map((t) => screen.getByText(t));
    const all = screen.getAllByText(/^(Critical one|High one|Low one)$/);
    expect(all).toEqual(order); // sorted CRITICAL > HIGH > LOW, not server order

    expect(screen.getByText('Failed QA')).toBeTruthy();
    expect(screen.getByText('x3')).toBeTruthy();
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.getByText('3d late')).toBeTruthy();
  });

  it('a task row opens Task Detail', async () => {
    dash.getDeveloperStats.mockResolvedValue(devData());
    as(5);
    render();
    fireEvent.press(await screen.findByLabelText(/^Critical one\./));
    expect(mockNavigate).toHaveBeenCalledWith('TaskDetail', { taskId: 2 });
  });

  it('rows tolerate a task with no project / dates / status config', async () => {
    dash.getDeveloperStats.mockResolvedValue(
      devData({ todayTasks: [{ id: 50, title: 'Bare', priority: null, status: null, project: null, due_date: null }] }),
    );
    as(5);
    render();
    expect(await screen.findByText('Bare')).toBeTruthy();
  });
});

describe('Other roles content', () => {
  it('QA: 3 KPIs, Ready for QA, Needs retest merges failed + reopened', async () => {
    dash.getQAStats.mockResolvedValue(
      dashboardApi.parseQAStats({
        stats: { activeTasks: 4, passedTasks: 9, needsRetest: 2 },
        myReadyForQA: [rawTask({ id: 1, title: 'Ready A', status: 'READY_FOR_QA' })],
        myFailed: [rawTask({ id: 2, title: 'Failed B', status: 'FAIL' })],
        myReopened: [rawTask({ id: 3, title: 'Reopened C', status: 'REOPEN' })],
      }),
    );
    as(4);
    render();
    expect(await screen.findByText('Ready A')).toBeTruthy();
    expect(screen.getByText('Failed B')).toBeTruthy();
    expect(screen.getByText('Reopened C')).toBeTruthy();
    expect(screen.getByLabelText('Passed: 9')).toBeTruthy();
  });

  it('Tech lead: 7 KPIs, blocked with blocker notes, overdue "by Nd", sprint health', async () => {
    dash.getTLStats.mockResolvedValue(
      dashboardApi.parseTLStats({
        projectIds: [1],
        kpis: { inProgress: 3, devDone: 2, blockedCount: 1, atRiskCount: 1, unassignedCount: 4, completedThisWeek: 6, completedLastWeek: 5 },
        blockedTasks: [rawTask({ id: 1, title: 'Stuck', is_blocked: true, blocker_description: 'Waiting on API keys' })],
        overdueTasks: [rawTask({ id: 2, title: 'Late', due_date: '2026-10-07' })],
        qaQueue: [rawTask({ id: 3, status: 'READY_FOR_QA' }), rawTask({ id: 4, status: 'READY_FOR_QA' })],
        sprintHealth: [{ name: 'Sprint 12', daysLeft: 2, pctComplete: 60, total: 10, passed: 6, inProgress: 2, inQA: 1 }],
      }),
    );
    as(3);
    render();
    expect(await screen.findByLabelText('Unassigned: 4')).toBeTruthy();
    for (const l of ['In progress: 3', 'Dev done: 2', 'Blocked: 1', 'At risk: 1', 'Done this week: 6', 'Done last week: 5']) {
      expect(screen.getByLabelText(l)).toBeTruthy();
    }
    expect(screen.getByText(/Waiting on API keys/)).toBeTruthy();
    expect(screen.getByText('Overdue by 3d')).toBeTruthy();
    expect(screen.getByText('Sprint 12')).toBeTruthy();
    expect(screen.getByText('2d left')).toBeTruthy();
    expect(screen.getByText(/60% · 6 passed · 2 in progress · 1 in QA · 10 total/)).toBeTruthy();
    expect(screen.getByText('Ready for QA')).toBeTruthy();
  });

  it('PM: KPIs, sprints, releases, overloaded users, status count rows', async () => {
    dash.getPMStats.mockResolvedValue(
      dashboardApi.parsePMStats({
        totalTasks: 40, completedTasks: 25, overdueTasks: 3, ticketStats: { open: 5 },
        tasksByStatus: { PASS: 25, IN_PROGRESS: 7 },
        sprintOverview: [{ id: 1, name: 'Sprint 12', project: { name: 'Alpha' }, daysLeft: 4, totalTasks: 10, doneTasks: 4, blockedTasks: 1, progress: 40 }],
        releases: [{ id: 2, name: 'R1', version: '2.0', status: 'in_progress', progress_percentage: 55, release_date: '2026-11-01' }],
        overloadedUsers: [{ id: 9, name: 'Busy Bee', userRole: { name: 'Developer' } }],
      }),
    );
    as(2);
    render();
    expect(await screen.findByLabelText('Open tickets: 5')).toBeTruthy();
    expect(screen.getByLabelText('Total tasks: 40')).toBeTruthy();
    expect(screen.getByText('Sprint 12')).toBeTruthy();
    expect(screen.getByText('4/10 done · 1 blocked')).toBeTruthy();
    expect(screen.getByText('R1 v2.0')).toBeTruthy();
    expect(screen.getByText('Busy Bee')).toBeTruthy();
    expect(screen.getByText('Pass')).toBeTruthy(); // status label from config, count row
  });

  it('Client: 4 KPIs and read-only (non-pressable) project cards', async () => {
    dash.getClientStats.mockResolvedValue(
      dashboardApi.parseClientStats({
        summary: { totalProjects: 2, activeProjects: 1, completionPct: 45, openTickets: 2 },
        projects: [
          { id: 1, name: 'Website', status: 'active', completionPct: 45, doneTasks: 9, totalTasks: 20, pendingTasks: 6, activeTasks: 5, openTickets: 2, activeSprint: { name: 'Sprint 3', end_date: '2026-10-13' } },
        ],
      }),
    );
    as(6);
    render();
    expect(await screen.findByLabelText('Overall completion: 45%')).toBeTruthy();
    expect(screen.getByText('Website')).toBeTruthy();
    expect(screen.getByText('45% · 9/20 done')).toBeTruthy();
    expect(screen.getByText(/Sprint: Sprint 3 · 3d left/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Website/ })).toBeNull();
  });
});

describe('polling', () => {
  it('Developer polls every 60s while focused; PM does not poll', async () => {
    jest.useFakeTimers();
    dash.getDeveloperStats.mockResolvedValue(devData());
    as(5);
    render();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(dash.getDeveloperStats).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(dash.getDeveloperStats.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('PM view never schedules a refetch interval', async () => {
    jest.useFakeTimers();
    dash.getPMStats.mockResolvedValue(dashboardApi.parsePMStats({}));
    as(2);
    render();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(180_000);
    });
    expect(dash.getPMStats).toHaveBeenCalledTimes(1);
  });
});
