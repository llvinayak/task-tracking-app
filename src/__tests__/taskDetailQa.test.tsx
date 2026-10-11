import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as menuApi from '@/api/menuApi';
import { parseAssignees, parseProjects, parseStatusConfig, parseTaskDetail, parseTaskPermissions, parseTeam, type TaskDetail } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as qaApi from '@/api/qaApi';
import * as tasksApi from '@/api/tasksApi';
import * as timeApi from '@/api/timeApi';
import { TaskDetailScreen } from '@/features/tasks/TaskDetailScreen';
import { useAuthStore } from '@/store/authStore';
import { menu, rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

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
  getTaskAssignees: jest.fn(),
  changeTaskStatus: jest.fn(),
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

const detail = (over: Record<string, unknown> = {}): TaskDetail =>
  parseTaskDetail({ ...rawTask({ status: 'READY_FOR_QA' }), statusLogs: [], attachments: [], ...over }) as TaskDetail;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
  api.getTask.mockResolvedValue(detail());
  api.getTaskPermissions.mockResolvedValue(parseTaskPermissions({ canEdit: true }));
  api.getTaskAssignees.mockResolvedValue(parseAssignees([]));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  projects.getProjects.mockResolvedValue(parseProjects([]));
  projects.getProjectTeam.mockResolvedValue(parseTeam({ members: [] }));
  time.getRunningTimer.mockResolvedValue(null);
  qa.getQASummary.mockResolvedValue(qaApi.parseQASummary({ total: 2, passed: 1, failed: 0, pending: 1, pass_rate: 50 }));
  qa.getTestCases.mockResolvedValue(
    qaApi.parseTestCases([
      { id: 1, title: 'Login works', expected_result: 'ok', order_index: 1, results: [{ status: 'fail', notes: 'Crashed', reopen_count: 2 }] },
    ]),
  );
});

const openQaTab = async () => {
  renderWithProviders(<TaskDetailScreen />);
  await screen.findByText('Fix login redirect');
  fireEvent.press(screen.getByRole('button', { name: 'QA' }));
  await screen.findByTestId('qa-summary');
};

describe('Task Detail QA tab', () => {
  it('is read-only for everyone: summary + cases with latest status, notes and reopen count', async () => {
    menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Tasks', menu_url: '/tasks' })]); // no /qa
    await openQaTab();
    expect(screen.getByLabelText('Total: 2')).toBeTruthy();
    expect(screen.getByLabelText('Passed: 1')).toBeTruthy();
    const c = await screen.findByTestId('case-1');
    expect(c).toHaveTextContent(/Login works/);
    expect(c).toHaveTextContent(/Failed/);
    expect(c).toHaveTextContent(/Notes: Crashed/);
    expect(c).toHaveTextContent(/Reopened 2×/);
  });

  it('QA actions are hidden without the /qa menu (courtesy gate: the server has no such check)', async () => {
    menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Tasks', menu_url: '/tasks' })]);
    await openQaTab();
    await waitFor(() => expect(menus.getMyMenus).toHaveBeenCalled());
    expect(screen.queryByTestId('qa-verdict')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pass Login works' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fail Login works' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add test case' })).toBeNull();
  });

  it('QA actions appear when the /qa menu is granted', async () => {
    menus.getMyMenus.mockResolvedValue([menu({ id: 2, menu_name: 'QA Module', menu_url: '/qa' })]);
    await openQaTab();
    expect(await screen.findByTestId('qa-verdict')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pass Login works' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add test case' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pass' })).toBeTruthy(); // verdict for READY_FOR_QA
  });
});
