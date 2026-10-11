import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import * as dashboardApi from '@/api/dashboardApi';
import { AppError } from '@/api/errors';
import { parseStatusConfig } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as timeApi from '@/api/timeApi';
import { Alert, Text as RNText } from 'react-native';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider, setNowProvider } from '@/utils/dates';
import { labelInNameViolations } from '@/test/a11y';

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
jest.mock('@/api/timeApi', () => ({
  ...jest.requireActual('@/api/timeApi'),
  getRunningTimer: jest.fn(),
  startTimer: jest.fn(),
  stopTimer: jest.fn(),
}));

const dash = dashboardApi as jest.Mocked<typeof dashboardApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const as = (roleId: number) =>
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ roleId }) });
const render = () => renderWithProviders(<DashboardScreen />);

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(null);
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
    expect(screen.getByText('Reopened 3x')).toBeTruthy();
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

const textsInOrder = () =>
  screen.UNSAFE_getAllByType(RNText).map((n: { props: { children?: unknown } }) => [n.props.children].flat().filter((c) => typeof c === 'string').join(''));

describe('Stage 2: Developer / QA layout, Overdue explainer and quick Start', () => {
  const ownerData = () =>
    devData({
      todayTasks: [
        rawTask({ id: 10, title: 'Mine to start', priority: 'HIGH', dev_owner_id: 7 }),
        rawTask({ id: 11, title: 'Roster only', priority: 'LOW', dev_owner_id: 99, devOwner: { id: 99, name: 'Someone' } }),
      ],
    });
  const asDev = () =>
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });

  it("Today's focus comes BEFORE the KPI strip (Developer) and the KPIs are dense (no hint line)", async () => {
    dash.getDeveloperStats.mockResolvedValue(devData());
    asDev();
    render();
    await screen.findByText("Today's focus");
    const order = textsInOrder();
    expect(order.indexOf("Today's focus")).toBeGreaterThan(-1);
    expect(order.indexOf("Today's focus")).toBeLessThan(order.indexOf('Active tasks'));
    expect(screen.queryByText('Needs attention', { exact: true, includeHiddenElements: false })).toBeTruthy(); // the section title
    expect(screen.queryByText('Missed start/deadline')).toBeNull();
  });

  it('QA: Ready for QA first, then the KPI strip', async () => {
    dash.getQAStats.mockResolvedValue(dashboardApi.parseQAStats({ stats: { activeTasks: 1, passedTasks: 2, needsRetest: 0 }, myReadyForQA: [rawTask({ id: 3, title: 'QA me' })] }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 8, roleId: 4 }) });
    render();
    await screen.findByText('Ready for QA');
    const order = textsInOrder();
    expect(order.indexOf('Ready for QA')).toBeGreaterThan(-1);
    expect(order.indexOf('Ready for QA')).toBeLessThan(order.indexOf('Active tasks'));
    expect(screen.queryByRole('button', { name: /Start timer on/ })).toBeNull(); // no quick Start for QA
  });

  it('Overdue has an info button that explains why it can differ from the Tasks filter', async () => {
    dash.getDeveloperStats.mockResolvedValue(devData());
    asDev();
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'About Overdue' }));
    expect(screen.getByText(/includes tasks due today/)).toBeTruthy();
    expect(screen.getByText(/only counts tasks due before today/)).toBeTruthy();
  });

  it('quick Start appears only on rows where I am an OWNER, is a 44x44 icon button named for the task', async () => {
    dash.getDeveloperStats.mockResolvedValue(ownerData());
    asDev();
    render();
    const start = await screen.findByRole('button', { name: 'Start timer on Mine to start' });
    expect(screen.queryByRole('button', { name: 'Start timer on Roster only' })).toBeNull();
    const style = Object.assign({}, ...[start.props.style].flat(5).filter(Boolean));
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(screen.queryByText('Start')).toBeNull(); // icon only: no visible text
  });

  it('with no other timer running it starts straight away (no confirmation) and fires the start haptic', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    dash.getDeveloperStats.mockResolvedValue(ownerData());
    (timeApi.startTimer as jest.Mock).mockResolvedValue({ id: 1, stopped: null });
    asDev();
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer on Mine to start' }));
    await screen.findByText('Timer started');
    expect(alert).not.toHaveBeenCalled();
    expect(timeApi.startTimer).toHaveBeenCalledWith(10);
    const haptics = jest.requireMock('expo-haptics') as { impactAsync: jest.Mock };
    expect(haptics.impactAsync).toHaveBeenCalledWith('medium');
    alert.mockRestore();
  });

  it('with another timer running it asks "Switch timer?" first; Cancel starts nothing, Switch starts', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(
      timeApi.parseRunningTimer({ id: 1, started_at: '2026-10-10T09:00:00Z', task: { id: 50, title: 'Other work', status: 'IN_PROGRESS', project: null } }),
    );
    dash.getDeveloperStats.mockResolvedValue(ownerData());
    (timeApi.startTimer as jest.Mock).mockResolvedValue({ id: 2, stopped: { taskId: 50, title: 'Other work' } });
    asDev();
    render();
    await screen.findByTestId('running-timer-banner');
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer on Mine to start' }));
    const call = alert.mock.calls.at(-1)!;
    expect(call[0]).toBe('Switch timer?');
    expect(call[1]).toBe('This stops the timer on "Other work" and starts one on "Mine to start".');
    expect(timeApi.startTimer).not.toHaveBeenCalled();
    const buttons = call[2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Switch']);
    await act(async () => buttons[1]!.onPress!());
    expect(timeApi.startTimer).toHaveBeenCalledWith(10);
    alert.mockRestore();
  });

  it('the row where my timer runs shows Stop instead', async () => {
    (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(
      timeApi.parseRunningTimer({ id: 1, started_at: '2026-10-10T09:00:00Z', task: { id: 10, title: 'Mine to start', status: 'IN_PROGRESS', project: null } }),
    );
    dash.getDeveloperStats.mockResolvedValue(ownerData());
    asDev();
    render();
    expect(await screen.findAllByRole('button', { name: 'Stop timer on Mine to start' })).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Start timer on Mine to start' })).toBeNull();
  });
});

describe('Pilot fixes (Dashboard)', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => rawTask({ id: 100 + i, title: `Focus ${i + 1}`, priority: 'MEDIUM' }));

  it("Today's focus shows 5 rows and expands IN PLACE with \"Show all N\" / \"Show fewer\"", async () => {
    dash.getDeveloperStats.mockResolvedValue(devData({ todayTasks: many(8) }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
    render();
    await screen.findByText('Focus 1');
    expect(screen.getByText('Focus 5')).toBeTruthy();
    expect(screen.queryByText('Focus 6')).toBeNull();
    expect(screen.queryByText(/^Showing /)).toBeNull(); // the old "Showing X of Y" text is gone
    fireEvent.press(screen.getByRole('button', { name: 'Show all 8' }));
    expect(screen.getByText('Focus 8')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.queryByText('Focus 6')).toBeNull();
    expect(dash.getDeveloperStats).toHaveBeenCalledTimes(1); // UI state only, no refetch
  });

  it('a section with 5 or fewer rows has no toggle', async () => {
    dash.getDeveloperStats.mockResolvedValue(devData({ todayTasks: many(5) }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
    render();
    await screen.findByText('Focus 5');
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('a ZERO "Completed today" is neutral (no green check that reads as good); a positive one keeps the success icon; Overdue 0 stays good', async () => {
    dash.getDeveloperStats.mockResolvedValue(devData({ stats: { activeTasks: 1, completedToday: 0, overdueTasks: 0 } }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
    const first = render();
    await screen.findByLabelText('Completed today: 0');
    const icons = (label: string) => screen.getByLabelText(label).findAll((n: { type: unknown }) => n.type === 'Icon');
    expect(icons('Completed today: 0')).toHaveLength(0);
    expect(icons('Overdue: 0').length).toBeGreaterThan(0);
    first.unmount();
    dash.getDeveloperStats.mockResolvedValue(devData({ stats: { activeTasks: 1, completedToday: 3, overdueTasks: 0 } }));
    render();
    await screen.findByLabelText('Completed today: 3');
    expect(icons('Completed today: 3').length).toBeGreaterThan(0);
  });

  it('a row announces its due date, project and reopen count', async () => {
    dash.getDeveloperStats.mockResolvedValue(
      devData({ todayTasks: [rawTask({ id: 9, title: 'Rich row', priority: 'HIGH', due_date: '2026-10-12', reopen_count: 2, project: { id: 3, name: 'Alpha Project', color: '#3366ff' } })] }),
    );
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
    render();
    const row = await screen.findByLabelText(/^Rich row\./);
    expect(row.props.accessibilityLabel).toContain('Reopened 2x');
    expect(row.props.accessibilityLabel).toContain('Alpha Project');
    expect(row.props.accessibilityLabel).toContain('Due 12 Oct');
  });

  it('Tech Lead KPIs are the dense tiles (no hint line)', async () => {
    dash.getTLStats.mockResolvedValue(dashboardApi.parseTLStats({ projectIds: [1], kpis: { inProgress: 4, blockedCount: 2 } }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 3 }) });
    render();
    const tile = await screen.findByLabelText('In progress: 4');
    const style = Object.assign({}, ...[screen.getByText('4').props.style].flat(4).filter(Boolean));
    expect(style.fontSize).toBe(22); // dense value size (2xl), not the 28 of the full tile
    expect(tile).toBeTruthy();
  });
});


describe('Label in Name on the dashboards', () => {
  it('Developer (rows, quick Start, Show all, KPI info)', async () => {
    dash.getDeveloperStats.mockResolvedValue(devData({ todayTasks: Array.from({ length: 7 }, (_, i) => rawTask({ id: 200 + i, title: `Row ${i}`, dev_owner_id: 7 })) }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
    render();
    await screen.findByText('Row 0');
    expect(labelInNameViolations()).toEqual([]);
  });
  it('QA', async () => {
    dash.getQAStats.mockResolvedValue(dashboardApi.parseQAStats({ stats: { activeTasks: 1, passedTasks: 2, needsRetest: 0 }, myReadyForQA: [rawTask({ id: 3, title: 'QA me' })] }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 8, roleId: 4 }) });
    render();
    await screen.findByText('QA me');
    expect(labelInNameViolations()).toEqual([]);
  });
  it('Tech Lead', async () => {
    dash.getTLStats.mockResolvedValue(dashboardApi.parseTLStats({ projectIds: [1], kpis: { inProgress: 4, blockedCount: 2 }, blockedTasks: [rawTask({ id: 5, title: 'Stuck', is_blocked: true })] }));
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 3 }) });
    render();
    await screen.findByLabelText('In progress: 4');
    expect(labelInNameViolations()).toEqual([]);
  });
});
