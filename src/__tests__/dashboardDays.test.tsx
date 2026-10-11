import { screen } from '@testing-library/react-native';
import React from 'react';

import * as dashboardApi from '@/api/dashboardApi';
import { parseStatusConfig } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider, setNowProvider } from '@/utils/dates';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/api/dashboardApi', () => ({
  ...jest.requireActual('@/api/dashboardApi'),
  getClientStats: jest.fn(),
  getTLStats: jest.fn(),
  getPMStats: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const dash = dashboardApi as jest.Mocked<typeof dashboardApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const as = (roleId: number) =>
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ roleId }) });

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
});
afterEach(resetNowProvider);

describe('M3: dashboards compute days left from end_date on the device calendar', () => {
  it('PM: a sprint that ended 2 days ago reads "2d overdue" even though the server clamped daysLeft to 0', async () => {
    dash.getPMStats.mockResolvedValue(
      dashboardApi.parsePMStats({
        sprintOverview: [
          { id: 1, name: 'Old sprint', project: { name: 'Alpha' }, end_date: '2026-10-08', daysLeft: 0, totalTasks: 4, doneTasks: 2, progress: 50 },
          { id: 2, name: 'Current sprint', project: { name: 'Alpha' }, end_date: '2026-10-13', daysLeft: 2, totalTasks: 4, doneTasks: 1, progress: 25 },
          { id: 3, name: 'Last day', end_date: '2026-10-10', daysLeft: 0 },
          { id: 4, name: 'No date', daysLeft: 6 },
        ],
      }),
    );
    as(2);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText('2d overdue')).toBeTruthy();
    expect(screen.getByText('3d left')).toBeTruthy(); // from end_date, not the server's 2
    expect(screen.getByText('Ends today')).toBeTruthy();
    expect(screen.getByText('6d left')).toBeTruthy(); // server fallback only when there is no end_date
  });

  it('Tech lead: sprint health also uses end_date, and rows are keyed by id (duplicate names are fine)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    dash.getTLStats.mockResolvedValue(
      dashboardApi.parseTLStats({
        projectIds: [1],
        sprintHealth: [
          { id: 10, name: 'Sprint', end_date: '2026-10-05', daysLeft: 0, pctComplete: 90, total: 10, passed: 9 },
          { id: 11, name: 'Sprint', end_date: '2026-10-20', daysLeft: 9, pctComplete: 10, total: 10, passed: 1 },
        ],
      }),
    );
    as(3);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText('5d overdue')).toBeTruthy();
    expect(screen.getByText('10d left')).toBeTruthy();
    expect(screen.getAllByText('Sprint')).toHaveLength(2);
    // React reports duplicate keys through console.error: there must be none.
    expect(errSpy.mock.calls.filter((c) => String(c[0]).includes('same key'))).toHaveLength(0);
    errSpy.mockRestore();
  });

  it('the parser keeps the sprint id', () => {
    expect(dashboardApi.parseTLStats({ sprintHealth: [{ id: 7, name: 'S' }, { name: 'No id' }] }).sprintHealth.map((s) => s.id)).toEqual([7, null]);
  });

  it('Client: active sprint days left come from the end date', async () => {
    dash.getClientStats.mockResolvedValue(
      dashboardApi.parseClientStats({
        projects: [{ id: 1, name: 'Site', totalTasks: 3, activeSprint: { name: 'Sprint 3', end_date: '2026-10-07' } }],
      }),
    );
    as(6);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText(/Sprint: Sprint 3 · 3d overdue/)).toBeTruthy();
  });
});

describe('known API issue: client-stats can 500 (shown, never faked)', () => {
  it('surfaces the server failure with a retry instead of a fake success', async () => {
    const { AppError } = jest.requireActual('@/api/errors') as typeof import('@/api/errors');
    dash.getClientStats.mockRejectedValue(new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side. Please try again in a moment.' }));
    as(6);
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText('Something went wrong on our side. Please try again in a moment.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('Total projects')).toBeNull(); // no invented zeros
  });
});
