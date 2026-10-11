import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Text as RNText } from 'react-native';

import { parseProjects, parseStatusConfig, parseTaskDetail, type TaskDetail } from '@/api/models';
import * as menuApi from '@/api/menuApi';
import * as projectsApi from '@/api/projectsApi';
import * as qaApi from '@/api/qaApi';
import * as tasksApi from '@/api/tasksApi';
import { QATaskScreen } from '@/features/qa/QATaskScreen';
import { useAuthStore } from '@/store/authStore';
import { menu, rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { taskId: 15 } }),
}));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTask: jest.fn(), changeTaskStatus: jest.fn() }));
jest.mock('@/api/qaApi', () => ({ ...jest.requireActual('@/api/qaApi'), getQASummary: jest.fn(), getTestCases: jest.fn() }));
jest.mock('@/api/projectsApi');
jest.mock('@/api/menuApi');

const api = tasksApi as jest.Mocked<typeof tasksApi>;
const qa = qaApi as jest.Mocked<typeof qaApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const menus = menuApi as jest.Mocked<typeof menuApi>;

const detail = (over: Record<string, unknown> = {}) =>
  parseTaskDetail({
    ...rawTask({ status: 'READY_FOR_QA', dev_owner_id: 7, devOwner: { id: 7, name: 'Priya' }, qa_owner_id: 8, qaOwner: { id: 8, name: 'Rahul' } }),
    statusLogs: [],
    attachments: [],
    ...over,
  }) as TaskDetail;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 8, roleId: 4 }) });
  api.getTask.mockResolvedValue(detail());
  qa.getQASummary.mockResolvedValue(qaApi.parseQASummary({ total: 1, passed: 0, failed: 0, pending: 1, pass_rate: 0 }));
  qa.getTestCases.mockResolvedValue(qaApi.parseTestCases([{ id: 1, title: 'Login works', expected_result: 'ok', order_index: 1, results: [] }]));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  projects.getProjects.mockResolvedValue(parseProjects([]));
  menus.getMyMenus.mockResolvedValue([menu({ id: 2, menu_name: 'QA Module', menu_url: '/qa' })]);
});

describe('QA task screen', () => {
  it('shows the owners and a compact description, and an "Open task" action that goes to Task Detail', async () => {
    renderWithProviders(<QATaskScreen />);
    expect(await screen.findByTestId('qa-owners')).toHaveTextContent('Dev: Priya · QA: Rahul');
    expect(screen.getByTestId('qa-description')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Open task / }));
    expect(mockNav.navigate).toHaveBeenCalledWith('TaskDetail', { taskId: 15 });
  });

  it('task-level verdicts read "Pass task" / "Fail task" so they are not confused with a test case "Pass"', async () => {
    renderWithProviders(<QATaskScreen />);
    expect(await screen.findByRole('button', { name: 'Pass task' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fail task' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pass Login works' })).toBeTruthy();
    expect(screen.getByText('Pass task')).toBeTruthy();
  });

  it('verdict first, then the summary, then the test cases', async () => {
    renderWithProviders(<QATaskScreen />);
    await screen.findByRole('button', { name: 'Pass task' });
    await screen.findByTestId('qa-summary');
    await screen.findByTestId('case-1');
    const order = screen.UNSAFE_getAllByType(RNText).map((n: { props: { children?: unknown } }) => [n.props.children].flat().filter((c) => typeof c === 'string').join(''));
    expect(order.indexOf('VERDICT')).toBeLessThan(order.findIndex((x) => x.startsWith('Pass rate')));
    expect(order.findIndex((x) => x.startsWith('Pass rate'))).toBeLessThan(order.indexOf('Login works'));
  });
});
