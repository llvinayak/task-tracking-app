import { screen, userEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import { parseStatusConfig, parseTasks } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as qaApi from '@/api/qaApi';
import * as tasksApi from '@/api/tasksApi';
import { QAPanel } from '@/features/qa/QAPanel';
import { QAScreen } from '@/features/qa/QAScreen';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/api/qaApi', () => ({
  ...jest.requireActual('@/api/qaApi'),
  getQAQueue: jest.fn(),
  getOverdueToQA: jest.fn(),
  getQASummary: jest.fn(),
  getTestCases: jest.fn(),
}));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), changeTaskStatus: jest.fn() }));
jest.mock('@/api/projectsApi');

const qa = qaApi as jest.Mocked<typeof qaApi>;
const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

/** The seed transitions (task-tracking-api/scripts/setupDatabase.js), with overrides. */
const cfg = (overrides: Record<string, string[]> = {}) =>
  parseStatusConfig(rawStatuses().map((s) => (s.key in overrides ? { ...s, allowed_transitions: overrides[s.key]! } : s)));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 8, roleId: 4 }) });
  qa.getQAQueue.mockResolvedValue([]);
  qa.getOverdueToQA.mockResolvedValue([]);
  qa.getQASummary.mockResolvedValue(qaApi.parseQASummary({ total: 1 }));
  qa.getTestCases.mockResolvedValue([]);
  projects.getTaskStatuses.mockResolvedValue(cfg());
});

describe('M3-14: verdict buttons follow /config allowed_transitions (the seed)', () => {
  it('with the seed, READY_FOR_QA offers Pass and Fail, and FAIL offers Reopen', async () => {
    const a = renderWithProviders(<QAPanel taskId={5} status="READY_FOR_QA" canAct />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pass' }).props.accessibilityState.disabled).toBe(false));
    expect(screen.getByRole('button', { name: 'Fail' }).props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId('verdict-reason-PASS')).toBeNull();
    a.unmount();

    renderWithProviders(<QAPanel taskId={5} status="FAIL" canAct />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen' }).props.accessibilityState.disabled).toBe(false));
  });

  it('a verdict the workflow does not allow is DISABLED with a visible reason, the other stays usable', async () => {
    projects.getTaskStatuses.mockResolvedValue(cfg({ READY_FOR_QA: ['FAIL', 'DEFERRED'] }));
    renderWithProviders(<QAPanel taskId={5} status="READY_FOR_QA" canAct />);
    await waitFor(() => expect(screen.getByTestId('verdict-reason-PASS')).toHaveTextContent('Pass is not allowed from Ready for QA in this workflow.'));
    expect(screen.getByRole('button', { name: 'Pass' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Fail' }).props.accessibilityState.disabled).toBe(false);
    // userEvent respects `disabled` like a real finger; fireEvent walks up to the Button's own onPress prop.
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pass' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(tasks.changeTaskStatus).not.toHaveBeenCalled();
  });

  it('Reopen is disabled with a reason when FAIL cannot go to REOPEN', async () => {
    projects.getTaskStatuses.mockResolvedValue(cfg({ FAIL: ['IN_PROGRESS'] }));
    renderWithProviders(<QAPanel taskId={5} status="FAIL" canAct />);
    await waitFor(() => expect(screen.getByTestId('verdict-reason-REOPEN')).toHaveTextContent('Reopen is not allowed from Fail in this workflow.'));
    expect(screen.getByRole('button', { name: 'Reopen' }).props.accessibilityState.disabled).toBe(true);
  });

  it('while the workflow is still loading nothing is offered as enabled', async () => {
    projects.getTaskStatuses.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<QAPanel taskId={5} status="READY_FOR_QA" canAct />);
    expect(await screen.findByTestId('verdict-reason-PASS')).toHaveTextContent('Loading the workflow...');
    expect(screen.getByRole('button', { name: 'Pass' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Fail' }).props.accessibilityState.disabled).toBe(true);
  });

  it('the queue\'s subtask Pass/Fail buttons obey the subtask status transitions too', async () => {
    projects.getTaskStatuses.mockResolvedValue(cfg({ READY_FOR_QA: ['FAIL', 'IN_PROGRESS'] }));
    qa.getQAQueue.mockImplementation(async (s) =>
      s === 'READY_FOR_QA'
        ? parseTasks([
            rawTask({
              id: 10, title: 'Parent', status: 'IN_PROGRESS',
              ready_subtasks: [rawTask({ id: 11, title: 'Sub one', status: 'READY_FOR_QA' })],
            }),
          ])
        : [],
    );
    renderWithProviders(<QAScreen />);
    await screen.findByTestId('qa-sub-11');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pass Sub one' }).props.accessibilityState.disabled).toBe(true));
    expect(screen.getByRole('button', { name: 'Fail Sub one' }).props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText(/Not every verdict is allowed from Ready for QA/)).toBeTruthy();
  });

  it('with the seed both subtask buttons are enabled', async () => {
    qa.getQAQueue.mockImplementation(async (s) =>
      s === 'READY_FOR_QA'
        ? parseTasks([rawTask({ id: 10, title: 'Parent', status: 'IN_PROGRESS', ready_subtasks: [rawTask({ id: 11, title: 'Sub one', status: 'READY_FOR_QA' })] })])
        : [],
    );
    renderWithProviders(<QAScreen />);
    await screen.findByTestId('qa-sub-11');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pass Sub one' }).props.accessibilityState.disabled).toBe(false));
    expect(screen.getByRole('button', { name: 'Fail Sub one' }).props.accessibilityState.disabled).toBe(false);
  });
});
