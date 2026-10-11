import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import { AppError } from '@/api/errors';
import {
  parseAssignees,
  parseComments,
  parseProjects,
  parseStatusConfig,
  parseTaskDetail,
  parseTaskPermissions,
  parseTeam,
  type TaskDetail,
} from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import * as timeApi from '@/api/timeApi';
import { ProjectPickerSheet } from '@/features/projects/ProjectPicker';
import { TaskDetailScreen } from '@/features/tasks/TaskDetailScreen';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import * as menuApi from '@/api/menuApi';
import * as qaApi from '@/api/qaApi';

const mockNav = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { taskId: 15 } }),
  useIsFocused: () => true,
}));
jest.mock('@/api/tasksApi', () => ({
  ...jest.requireActual('@/api/tasksApi'),
  getTask: jest.fn(),
  getTaskPermissions: jest.fn(),
  getTaskComments: jest.fn(),
  getTaskAssignees: jest.fn(),
}));
jest.mock('@/api/projectsApi');
jest.mock('@/api/menuApi');
jest.mock('@/api/timeApi', () => ({ ...jest.requireActual('@/api/timeApi'), getRunningTimer: jest.fn(), getTaskSessions: jest.fn() }));
jest.mock('@/api/qaApi', () => ({
  ...jest.requireActual('@/api/qaApi'),
  getQASummary: jest.fn(),
  getTestCases: jest.fn(),
}));

const api = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const menus = menuApi as jest.Mocked<typeof menuApi>;
const time = timeApi as jest.Mocked<typeof timeApi>;
const qa = qaApi as jest.Mocked<typeof qaApi>;

const detail = (): TaskDetail => parseTaskDetail({ ...rawTask({ status: 'READY_FOR_QA' }), statusLogs: [], attachments: [] }) as TaskDetail; // READY_FOR_QA: the QA tab is only shown for tasks in the QA flow (or with the /qa menu)
const NETWORK = new AppError({ kind: 'network', message: "Can't reach the server. Check your connection and try again." });

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7 }) });
  api.getTask.mockResolvedValue(detail());
  api.getTaskPermissions.mockResolvedValue(parseTaskPermissions({ canEdit: true, canAssign: true }));
  api.getTaskComments.mockResolvedValue(parseComments([{ id: 1, content: 'hello there', created_at: '2026-10-01T10:00:00Z', author: { id: 2, name: 'Ada' } }]));
  api.getTaskAssignees.mockResolvedValue(parseAssignees([{ id: 1, user_id: 7, role: 'DEV', is_primary: true, user: { id: 7, name: 'Grace Hopper' } }]));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  projects.getProjects.mockResolvedValue(parseProjects([{ id: 3, name: 'Alpha Project' }]));
  projects.getProjectTeam.mockResolvedValue(parseTeam({ members: [] }));
  menus.getMyMenus.mockResolvedValue([]);
  time.getRunningTimer.mockResolvedValue(null);
  qa.getQASummary.mockResolvedValue(qaApi.parseQASummary({ total: 1, passed: 1 }));
  qa.getTestCases.mockResolvedValue([]);
});

describe('M1/M2: a failed BACKGROUND refetch keeps the stale data and shows a banner', () => {
  it('Task detail does not swap to the error screen', async () => {
    const { queryClient } = renderWithProviders(<TaskDetailScreen />);
    expect(await screen.findByText('Fix login redirect')).toBeTruthy();

    api.getTask.mockRejectedValue(NETWORK);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['task', 15] });
    });

    expect(screen.getByText('Fix login redirect')).toBeTruthy(); // still there
    expect(await screen.findByTestId('stale-banner')).toHaveTextContent(/Couldn't refresh: Can't reach the server/);
    expect(screen.queryByText("Couldn't open this task")).toBeNull();
  });

  it('a failed INITIAL load still shows the error screen with retry', async () => {
    api.getTask.mockRejectedValue(new AppError({ kind: 'not_found', status: 404, message: 'Task not found' }));
    renderWithProviders(<TaskDetailScreen />);
    expect(await screen.findByText("Couldn't open this task")).toBeTruthy();
    expect(screen.getByText('Task not found')).toBeTruthy();
    expect(screen.queryByTestId('stale-banner')).toBeNull();
  });

  it('People tab keeps the assignees and shows a banner', async () => {
    const { queryClient } = renderWithProviders(<TaskDetailScreen />);
    await screen.findByText('Fix login redirect');
    fireEvent.press(screen.getByRole('tab', { name: 'More' }));
    fireEvent.press(screen.getByRole('tab', { name: 'People' }));
    expect(await screen.findByText('Grace Hopper')).toBeTruthy();

    api.getTaskAssignees.mockRejectedValue(NETWORK);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['task-assignees', 15] });
    });
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('Comments tab keeps the thread (and the composer) and shows a banner', async () => {
    const { queryClient } = renderWithProviders(<TaskDetailScreen />);
    await screen.findByText('Fix login redirect');
    fireEvent.press(screen.getByRole('tab', { name: 'Comments' }));
    expect(await screen.findByText('hello there')).toBeTruthy();

    api.getTaskComments.mockRejectedValue(NETWORK);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['task-comments', 15] });
    });
    expect(screen.getByText('hello there')).toBeTruthy();
    expect(screen.getByLabelText('Add a comment')).toBeTruthy();
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
  });

  it('QA tab keeps the summary when a refetch fails', async () => {
    const { queryClient } = renderWithProviders(<TaskDetailScreen />);
    await screen.findByText('Fix login redirect');
    fireEvent.press(screen.getByRole('tab', { name: 'QA' }));
    expect(await screen.findByLabelText('Total: 1')).toBeTruthy();
    qa.getQASummary.mockRejectedValue(NETWORK);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['task-qa-summary', 15] });
    });
    expect(screen.getByLabelText('Total: 1')).toBeTruthy();
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
  });

  it('Project picker keeps the list on a failed refetch, and shows an error only when it never loaded', async () => {
    const first = renderWithProviders(<ProjectPickerSheet visible onClose={() => undefined} />);
    expect(await screen.findByRole('radio', { name: 'Alpha Project' })).toBeTruthy();
    projects.getProjects.mockRejectedValue(NETWORK);
    await act(async () => {
      await first.queryClient.refetchQueries({ queryKey: ['projects'] });
    });
    expect(screen.getByRole('radio', { name: 'Alpha Project' })).toBeTruthy();
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
    first.unmount();

    projects.getProjects.mockRejectedValue(NETWORK);
    renderWithProviders(<ProjectPickerSheet visible onClose={() => undefined} />);
    expect(await screen.findByText(NETWORK.message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
