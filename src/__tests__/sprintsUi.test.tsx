import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import { AppError } from '@/api/errors';
import { parseProjects, parseStatusConfig } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as sprintsApi from '@/api/sprintsApi';
import { SprintDetailScreen } from '@/features/sprints/SprintDetailScreen';
import { SprintsScreen } from '@/features/sprints/SprintsScreen';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { rawStatuses, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider, setNowProvider } from '@/utils/dates';
import { labelInNameViolations } from '@/test/a11y';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
let mockParams: Record<string, unknown> = { sprintId: 3 };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
  useIsFocused: () => true,
}));
jest.mock('@/api/sprintsApi', () => ({
  ...jest.requireActual('@/api/sprintsApi'),
  getSprints: jest.fn(),
  getSprint: jest.fn(),
  getSprintMetrics: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const api = sprintsApi as jest.Mocked<typeof sprintsApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const sp = (over: Record<string, unknown> = {}) =>
  sprintsApi.parseSprint({
    id: 3, name: 'Sprint 3', status: 'active', start_date: '2026-10-01', end_date: '2026-10-14',
    project: { id: 2, name: 'Alpha', color: '#3366ff' }, taskCount: 4, completedCount: 1, blockedCount: 1,
    completionPct: 25, tasks: [], subSprints: [], ...over,
  })!;
const NETWORK = new AppError({ kind: 'network', message: "Can't reach the server. Check your connection and try again." });

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10));
  mockParams = { sprintId: 3 };
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser() });
  useProjectStore.setState({ selected: null });
  projects.getProjects.mockResolvedValue(parseProjects([{ id: 2, name: 'Alpha' }]));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  api.getSprints.mockResolvedValue([]);
  api.getSprint.mockResolvedValue(sp());
  api.getSprintMetrics.mockResolvedValue(sprintsApi.parseSprintMetrics(null));
});
afterEach(resetNowProvider);

describe('Sprints list', () => {
  it('groups by status (active first), shows progress, dates and client-side days left', async () => {
    api.getSprints.mockResolvedValue([
      sp({ id: 1, name: 'Old sprint', status: 'completed', end_date: '2026-09-01', completionPct: 100, taskCount: 5, completedCount: 5 }),
      sp({ id: 2, name: 'Next sprint', status: 'planning', start_date: '2026-10-15', end_date: '2026-10-28' }),
      sp({ id: 3, name: 'Late sprint', status: 'active', end_date: '2026-10-07', daysLeft: 0 }),
      sp({ id: 4, name: 'Current sprint', status: 'active', end_date: '2026-10-13' }),
    ]);
    renderWithProviders(<SprintsScreen />);
    expect(await screen.findByText('Late sprint')).toBeTruthy();
    const order = screen.getAllByText(/sprint$/).map((n) => n.props.children as string);
    expect(order).toEqual(['Late sprint', 'Current sprint', 'Next sprint', 'Old sprint']);
    expect(screen.getByText('3d overdue')).toBeTruthy(); // from end_date, device calendar
    expect(labelInNameViolations()).toEqual([]);
    expect(screen.getByText('3d left')).toBeTruthy();
    expect(screen.getByTestId('sprint-1')).toHaveTextContent(/100% · 5\/5 tasks done/);
    expect(screen.getByTestId('sprint-3')).toHaveTextContent(/25% · 1\/4 tasks done · 1 blocked/);
    expect(screen.getByTestId('sprint-3')).toHaveTextContent(/1 Oct to 7 Oct/);
    // A completed sprint has no days-left badge.
    expect(screen.getByTestId('sprint-1')).not.toHaveTextContent(/left|overdue/);
  });

  it('uses the picker project, otherwise all visible sprints', async () => {
    const first = renderWithProviders(<SprintsScreen />);
    await screen.findByText('No sprints');
    expect(sprintsApi.buildSprintParams(api.getSprints.mock.calls[0]![0])).toEqual({});
    first.unmount(); // a mounted screen would re-render on the store change below, outside act()
    api.getSprints.mockClear();
    useProjectStore.setState({ selected: { id: 2, name: 'Alpha', color: null, status: null, product_id: null } });
    renderWithProviders(<SprintsScreen />);
    await screen.findAllByText('No sprints');
    expect(sprintsApi.buildSprintParams(api.getSprints.mock.calls[0]![0])).toEqual({ project_id: 2 });
  });

  it('tapping a sprint opens it; loading, error with retry and stale states', async () => {
    api.getSprints.mockResolvedValue([sp()]);
    const r = renderWithProviders(<SprintsScreen />);
    expect(screen.getByLabelText('Loading sprints...')).toBeTruthy();
    fireEvent.press(await screen.findByLabelText(/^Sprint 3\./));
    expect(mockNav.navigate).toHaveBeenCalledWith('SprintDetail', { sprintId: 3 });
    api.getSprints.mockRejectedValue(NETWORK);
    await act(async () => {
      await r.queryClient.refetchQueries({ queryKey: ['sprints'] });
    });
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
    r.unmount();

    api.getSprints.mockRejectedValue(NETWORK);
    renderWithProviders(<SprintsScreen />);
    expect(await screen.findByText(NETWORK.message)).toBeTruthy();
    api.getSprints.mockResolvedValue([sp()]);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Sprint 3')).toBeTruthy();
  });
});

describe('Sprint detail', () => {
  const metrics = () =>
    sprintsApi.parseSprintMetrics({
      committed: { tasks: 8, estimated_hours: 40 },
      delivered: { tasks: 5, estimated_hours: 24 },
      scope: { tasks: 9, estimated_hours: 44, blocked_tasks: 1, unfinished_tasks: 4, change_tasks: 1, change_pct: 13 },
      effort: { estimated_hours: 44, logged_hours: 30, ratio: 0.68, variance_hours: -14 },
      progress: { completion_pct: 56, velocity_hours: null, velocity_tasks: null, commitment_met_pct: null },
      duration: { planned_days: 13, actual_days: null },
      burndown: [
        { date: '2026-10-01', remaining_hours: 40, total_hours: 40, logged_hours: 0, total_tasks: 8, completed_tasks: 0 },
        { date: '2026-10-02', remaining_hours: 30, total_hours: 40, logged_hours: 10, total_tasks: 8, completed_tasks: 2 },
      ],
      ideal: [{ date: '2026-10-01', ideal: 40 }, { date: '2026-10-02', ideal: 36.92 }], // real server shape (idealLine)
    });

  it('shows the header, metric tiles, a text/bar burndown and tappable tasks', async () => {
    // (also: Label in Name holds for the whole detail screen, checked at the end of this test)
    api.getSprint.mockResolvedValue(
      sp({
        goal: 'Ship login',
        tasks: [{ id: 9, title: 'Do the thing', status: 'IN_PROGRESS', priority: 'HIGH', is_blocked: true, devOwner: { name: 'Grace' }, qaOwner: { name: 'Quinn' } }],
        subSprints: [{ id: 4, name: 'Release A', status: 'planning', taskCount: 2, completedCount: 1, completionPct: 50, tasks: [] }],
      }),
    );
    api.getSprintMetrics.mockResolvedValue(metrics());
    renderWithProviders(<SprintDetailScreen />);
    expect(await screen.findByText('Ship login')).toBeTruthy();
    expect(screen.getByText('4d left')).toBeTruthy();

    const tiles = await screen.findByTestId('sprint-metrics');
    expect(tiles).toBeTruthy();
    expect(screen.getByLabelText(/^Progress: 56%/)).toBeTruthy();
    expect(screen.getByLabelText(/^Committed: 8 tasks\. 40h/)).toBeTruthy();
    expect(screen.getByLabelText(/^Delivered: 5 tasks\. 24h/)).toBeTruthy();
    expect(screen.getByLabelText(/^Scope: 9 tasks\. 44h · \+1 since commit · 1 blocked/)).toBeTruthy();
    expect(screen.getByLabelText(/^Effort: 30h logged\. 44h estimated · 0\.68x/)).toBeTruthy();
    expect(screen.getByLabelText(/^Duration: 13 days/)).toBeTruthy();

    expect(screen.getByLabelText('2 Oct: 30h remaining, ideal 36.9h. On or under ideal')).toBeTruthy(); // text/bar burndown, no chart lib; each row now states where it is against the ideal
    // Metric explainers (plain language under each figure) and the neutral burndown bar:
    expect(screen.getByText('Tasks finished so far')).toBeTruthy();
    expect(screen.getByText(/more time than estimated/)).toBeTruthy();
    expect(screen.getByTestId('sub-sprint-4')).toHaveTextContent(/Release A/);
    expect(screen.getByTestId('sub-sprint-4')).toHaveTextContent(/Planning/); // L5: the shared status label, not the raw value

    fireEvent.press(screen.getByTestId('sprint-task-9'));
    expect(mockNav.navigate).toHaveBeenCalledWith('TaskDetail', { taskId: 9 });
    expect(screen.getByTestId('sprint-task-9')).toHaveTextContent(/Blocked/);
    expect(screen.getByTestId('sprint-task-9')).toHaveTextContent(/Dev: Grace/);
    expect(labelInNameViolations()).toEqual([]);
  });

  it('parses the real server ideal shape [{date, ideal}] and still tolerates older keys and bare numbers', () => {
    const m = sprintsApi.parseSprintMetrics({ ideal: [{ date: '2026-10-01', ideal: 40 }, { date: '2026-10-02', ideal: 0 }, { date: '2026-10-03', remaining_hours: 5 }, 7, { date: 'x' }] });
    expect(m.ideal).toEqual([
      { date: '2026-10-01', remaining_hours: 40 },
      { date: '2026-10-02', remaining_hours: 0 }, // ideal 0 is a value, not "missing"
      { date: '2026-10-03', remaining_hours: 5 },
      { date: null, remaining_hours: 7 },
    ]);
  });

  it('null metrics (no baseline, no snapshots) read as n/a and an empty burndown, without crashing', async () => {
    renderWithProviders(<SprintDetailScreen />);
    await screen.findByTestId('sprint-metrics');
    expect(screen.getByLabelText(/^Committed: n\/a\. No baseline yet/)).toBeTruthy();
    expect(screen.getByTestId('burndown-empty')).toBeTruthy();
    expect(screen.getByText('No tasks in this sprint.')).toBeTruthy();
  });

  it('an overdue sprint reads "Nd overdue" from its end date', async () => {
    api.getSprint.mockResolvedValue(sp({ end_date: '2026-10-08' }));
    renderWithProviders(<SprintDetailScreen />);
    expect(await screen.findByText('2d overdue')).toBeTruthy();
  });

  it('a bad id is refused without any request', async () => {
    mockParams = { sprintId: 'abc' };
    renderWithProviders(<SprintDetailScreen />);
    expect(await screen.findByText('That sprint link is not valid.')).toBeTruthy();
    expect(api.getSprint).not.toHaveBeenCalled();
    expect(api.getSprintMetrics).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'forbidden', 'You are not a member of this project'],
    [404, 'not_found', 'Sprint not found'],
  ] as const)('%i is shown verbatim with a way back', async (status, kind, message) => {
    api.getSprint.mockRejectedValue(new AppError({ kind, status, message }));
    renderWithProviders(<SprintDetailScreen />);
    expect(await screen.findByText(message)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(mockNav.goBack).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('metrics failing keeps the sprint with its own retry; a failed refetch keeps data with a banner', async () => {
    api.getSprintMetrics.mockRejectedValueOnce(NETWORK);
    const r = renderWithProviders(<SprintDetailScreen />);
    await screen.findByText('Sprint 3');
    expect(await screen.findByText(NETWORK.message)).toBeTruthy();
    api.getSprintMetrics.mockResolvedValue(metrics());
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('sprint-metrics');

    api.getSprint.mockRejectedValue(NETWORK);
    await act(async () => {
      await r.queryClient.refetchQueries({ queryKey: ['sprint', 3] });
    });
    expect(screen.getByText('Sprint 3')).toBeTruthy();
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
  });
});

describe('ProgressBar track', () => {
  it('uses the stronger line colour so a low fill is still visible against it (light and dark)', () => {
    const { lightTheme, darkTheme } = jest.requireActual('@/theme/tokens');
    for (const th of [lightTheme, darkTheme]) {
      expect(th.colors.lineStrong).not.toBe(th.colors.subtle);
      expect(th.colors.lineStrong).not.toBe(th.colors.surface);
    }
  });
});
