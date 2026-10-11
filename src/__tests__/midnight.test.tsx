import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import { parseProjects, parseStatusConfig, parseTasks } from '@/api/models';
import * as menuApi from '@/api/menuApi';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import { TasksScreen } from '@/features/tasks/TasksScreen';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { menu, rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), push: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/api/tasksApi', () => ({
  ...jest.requireActual('@/api/tasksApi'),
  getTasks: jest.fn(),
  changeTaskStatus: jest.fn(),
}));
jest.mock('@/api/projectsApi');
jest.mock('@/api/menuApi');

const api = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const menus = menuApi as jest.Mocked<typeof menuApi>;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7 }) });
  useProjectStore.setState({ selected: null });
  projects.getProjects.mockResolvedValue(parseProjects([]));
  projects.getProjectTeam.mockResolvedValue({ project_id: null, can_manage: false, members: [] });
  menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Projects', menu_url: '/projects' })]);
});
afterEach(() => jest.useRealTimers());

describe('L2: overdue and due pills roll over at midnight and on app resume', () => {
  it('the Overdue chip count and due pill update when the day changes (no refetch, no reopen)', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 10, 23, 59, 30), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
    api.getTasks.mockResolvedValue(parseTasks([rawTask({ id: 1, title: 'Due today', due_date: '2026-10-10' })]));
    renderWithProviders(<TasksScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('button', { name: 'Overdue, 0' })).toBeTruthy();
    const calls = api.getTasks.mock.calls.length;

    // Highlight on so the due pill uses urgency wording.
    fireEvent.press(screen.getByRole('button', { name: 'Overdue, 0' }));
    expect(screen.getByText('No tasks match')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Overdue, 0' })); // toggle off again

    await act(async () => {
      await jest.advanceTimersByTimeAsync(31_000); // just past local midnight
    });
    expect(screen.getByRole('button', { name: 'Overdue, 1' })).toBeTruthy();
    expect(api.getTasks.mock.calls.length).toBe(calls); // pure client-side recompute

    fireEvent.press(screen.getByRole('button', { name: 'Overdue, 1' }));
    expect(screen.getByText('Due today')).toBeTruthy();
    expect(screen.getByText('1d overdue')).toBeTruthy(); // due pill, now urgent wording
  });
});

describe('terminal status fix: moves come ONLY from /config allowed_transitions', () => {
  const cfg = (overrides: Record<string, string[]>) =>
    parseStatusConfig(rawStatuses().map((s) => (s.key in overrides ? { ...s, allowed_transitions: overrides[s.key]! } : s)));

  it('a DEFERRED task is movable when the DB allows DEFERRED -> NOT_STARTED / IN_PROGRESS', async () => {
    projects.getTaskStatuses.mockResolvedValue(cfg({ DEFERRED: ['NOT_STARTED', 'IN_PROGRESS'] }));
    api.getTasks.mockResolvedValue(parseTasks([rawTask({ id: 1, title: 'Parked', status: 'DEFERRED', dev_owner_id: 7 })]));
    renderWithProviders(<TasksScreen />);
    fireEvent.press(await screen.findByRole('button', { name: 'Move Parked' }));
    expect(await screen.findByRole('button', { name: 'Move to Not Started' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move to In Progress' })).toBeTruthy();
  });

  it('a task whose status has an empty allowed_transitions list has no Move at all (even if it is not PASS/DEFERRED)', async () => {
    projects.getTaskStatuses.mockResolvedValue(cfg({ IN_PROGRESS: [] }));
    api.getTasks.mockResolvedValue(parseTasks([rawTask({ id: 1, title: 'Stuck', status: 'IN_PROGRESS', dev_owner_id: 7 })]));
    renderWithProviders(<TasksScreen />);
    await screen.findByText('Stuck');
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: 'Move Stuck' })).toBeNull();
  });

  it('DEFERRED without transitions in the DB has no Move; the "done" display set is separate', async () => {
    projects.getTaskStatuses.mockResolvedValue(cfg({ DEFERRED: [] }));
    api.getTasks.mockResolvedValue(parseTasks([rawTask({ id: 1, title: 'Parked', status: 'DEFERRED', dev_owner_id: 7, due_date: '2026-01-01' })]));
    renderWithProviders(<TasksScreen />);
    await screen.findByText('Parked');
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: 'Move Parked' })).toBeNull();
    // Done-for-display: a DEFERRED task past its due date is not counted overdue.
    expect(screen.getByRole('button', { name: 'Overdue, 0' })).toBeTruthy();
  });
});
