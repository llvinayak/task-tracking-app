import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState } from 'react-native';

import { AppError } from '@/api/errors';
import { parseAssignees, parseStatusConfig, parseTaskDetail, type TaskDetail } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import * as timeApi from '@/api/timeApi';
import { RunningTimerBanner } from '@/features/timer/RunningTimerBanner';
import { NOT_ASSIGNED_MESSAGE, TaskTimePanel, TimerControl } from '@/features/timer/TimerControl';
import { TimerStatusPromptSheet } from '@/features/timer/TimerStatusPromptSheet';
import { useTimerPromptStore } from '@/hooks/timer';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetServerClock } from '@/api/serverClock';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@/api/timeApi', () => ({
  ...jest.requireActual('@/api/timeApi'),
  getRunningTimer: jest.fn(),
  startTimer: jest.fn(),
  stopTimer: jest.fn(),
  getTaskSessions: jest.fn(),
}));
jest.mock('@/api/tasksApi', () => ({
  ...jest.requireActual('@/api/tasksApi'),
  getTaskAssignees: jest.fn(),
  changeTaskStatus: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const time = timeApi as jest.Mocked<typeof timeApi>;
const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const STARTED = '2026-10-10T09:00:00.000Z';
const running = (over: Record<string, unknown> = {}) =>
  timeApi.parseRunningTimer({
    id: 1,
    started_at: STARTED,
    elapsed_minutes: 60,
    task: { id: 5, title: 'Fix login', status: 'IN_PROGRESS', dev_owner_id: 7, qa_owner_id: 8, support_owner_id: null, project: { id: 2, name: 'Alpha', color: '#3366ff' } },
    ...over,
  });
const detail = (over: Record<string, unknown> = {}): TaskDetail =>
  parseTaskDetail({ ...rawTask({ id: 5, title: 'Fix login', status: 'NOT_STARTED', dev_owner_id: 7, qa_owner_id: 8 }), ...over }) as TaskDetail;

beforeEach(() => {
  jest.clearAllMocks();
  resetServerClock();
  useTimerPromptStore.setState({ prompt: null });
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
  time.getRunningTimer.mockResolvedValue(null);
  tasks.getTaskAssignees.mockResolvedValue([]);
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
});
afterEach(() => jest.useRealTimers());

// The clock is deliberately hidden from the accessibility tree, so query it explicitly.
const clock = () => screen.getByTestId('running-timer-clock', { includeHiddenElements: true });

describe('RunningTimerBanner', () => {
  it('renders nothing when no timer is running', async () => {
    renderWithProviders(<RunningTimerBanner />);
    await act(async () => undefined);
    expect(screen.queryByTestId('running-timer-banner')).toBeNull();
  });

  it('shows task, project and a clock derived from started_at; targets are 44pt', async () => {
    jest.useFakeTimers({ now: Date.parse(STARTED) + 3_725_000, doNotFake: ['nextTick', 'setImmediate'] }); // +1h 02m 05s
    time.getRunningTimer.mockResolvedValue(running());
    renderWithProviders(<RunningTimerBanner />);
    expect(await screen.findByText('Fix login')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(clock()).toHaveTextContent('01:02:05');

    const stop = screen.getByRole('button', { name: 'Stop timer on Fix login' });
    const flat = Object.assign({}, ...[stop.props.style].flat(3).filter(Boolean));
    // Compact button: 36dp visible + 4dp hitSlop top/bottom = 44dp touch area.
    const slop = (stop.props.hitSlop ?? {}) as { top?: number; bottom?: number };
    expect(flat.minHeight + (slop.top ?? 0) + (slop.bottom ?? 0)).toBeGreaterThanOrEqual(44);
    const open = screen.getByRole('button', { name: /Timer running on Fix login, Alpha/ });
    expect(Object.assign({}, ...[open.props.style].flat(3).filter(Boolean)).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('ticks once a second while visible and the clock is hidden from screen readers (no per-second announcements)', async () => {
    jest.useFakeTimers({ now: Date.parse(STARTED) + 10_000, doNotFake: ['nextTick', 'setImmediate'] });
    time.getRunningTimer.mockResolvedValue(running());
    renderWithProviders(<RunningTimerBanner />);
    await screen.findByText('Fix login');
    expect(clock()).toHaveTextContent('00:00:10');
    expect(clock().props.accessibilityElementsHidden).toBe(true);
    expect(clock().props.accessibilityLiveRegion).toBeUndefined();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(clock()).toHaveTextContent('00:00:13');
  });

  it('recomputes from started_at on foreground (no drift after backgrounding)', async () => {
    jest.useFakeTimers({ now: Date.parse(STARTED) + 5_000, doNotFake: ['nextTick', 'setImmediate'] });
    let handler: ((s: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
      handler = h;
      return { remove: jest.fn() };
    }) as never);
    time.getRunningTimer.mockResolvedValue(running());
    renderWithProviders(<RunningTimerBanner />);
    await screen.findByText('Fix login');
    expect(clock()).toHaveTextContent('00:00:05');

    // App is backgrounded for 30 minutes: JS timers did not run, the clock must jump on resume.
    jest.setSystemTime(Date.parse(STARTED) + 30 * 60_000 + 5_000);
    await act(async () => {
      handler?.('active');
    });
    expect(clock()).toHaveTextContent('00:30:05');
    // AppState.addEventListener is already a jest.fn in the RN preset: do not mockRestore() it.
    spy.mockImplementation((() => ({ remove: jest.fn() })) as never);
  });

  it('opens the task when tapped', async () => {
    time.getRunningTimer.mockResolvedValue(running());
    renderWithProviders(<RunningTimerBanner />);
    fireEvent.press(await screen.findByRole('button', { name: /Timer running on Fix login/ }));
    expect(mockNavigate).toHaveBeenCalledWith('TaskDetail', { taskId: 5 });
  });

  it('Stop: calls the API, toasts the logged time, clears the banner and offers the DEV status prompt', async () => {
    time.getRunningTimer.mockResolvedValueOnce(running());
    time.stopTimer.mockResolvedValue({ id: 1, duration_minutes: 95, auto_closed: false });
    time.getRunningTimer.mockResolvedValue(null);
    renderWithProviders(
      <>
        <RunningTimerBanner />
        <TimerStatusPromptSheet />
      </>,
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Stop timer on Fix login' }));
    await waitFor(() => expect(time.stopTimer).toHaveBeenCalled());
    expect(await screen.findByText('Timer stopped · 1h 35m logged')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('running-timer-banner')).toBeNull());

    // Role: dev_owner_id == me -> DEV. IN_PROGRESS + stop -> "Finished with this task?" (Dev Done only, per transitions).
    expect(await screen.findByText('Finished with this task?')).toBeTruthy();
    tasks.changeTaskStatus.mockResolvedValue(undefined);
    fireEvent.press(screen.getByRole('button', { name: 'Dev Done' }));
    await waitFor(() => expect(tasks.changeTaskStatus).toHaveBeenCalledWith(5, 'DEV_DONE', undefined));
    expect(await screen.findByText('Moved to Dev Done')).toBeTruthy();
    expect(useTimerPromptStore.getState().prompt).toBeNull();
  });

  it('the prompt can be dismissed with its own label and makes no change', async () => {
    time.getRunningTimer.mockResolvedValueOnce(running());
    time.stopTimer.mockResolvedValue({ id: 1, duration_minutes: 10, auto_closed: false });
    time.getRunningTimer.mockResolvedValue(null);
    renderWithProviders(
      <>
        <RunningTimerBanner />
        <TimerStatusPromptSheet />
      </>,
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Stop timer on Fix login' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Leave as is' }));
    expect(tasks.changeTaskStatus).not.toHaveBeenCalled();
    expect(useTimerPromptStore.getState().prompt).toBeNull();
  });

  it('a server rejection of the suggested move is shown verbatim', async () => {
    useTimerPromptStore.getState().show({
      taskId: 5, taskTitle: 'Fix login', title: 'Finished with this task?', body: 'b', dismissLabel: 'Leave as is',
      choices: [{ key: 'DEV_DONE', label: 'Dev Done', hint: 'h' }],
    });
    tasks.changeTaskStatus.mockRejectedValue(new AppError({ kind: 'validation', status: 400, message: 'Cannot move from IN_PROGRESS to DEV_DONE' }));
    renderWithProviders(<TimerStatusPromptSheet />);
    fireEvent.press(await screen.findByRole('button', { name: 'Dev Done' }));
    expect(await screen.findByText('Cannot move from IN_PROGRESS to DEV_DONE')).toBeTruthy();
  });

  it('Stop 404 ("no timer running") is treated as already stopped and the state is refreshed', async () => {
    time.getRunningTimer.mockResolvedValueOnce(running());
    time.stopTimer.mockRejectedValue(new AppError({ kind: 'not_found', status: 404, message: 'You have no timer running.' }));
    time.getRunningTimer.mockResolvedValue(null);
    renderWithProviders(<RunningTimerBanner />);
    fireEvent.press(await screen.findByRole('button', { name: 'Stop timer on Fix login' }));
    expect(await screen.findByText('That timer was already stopped.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('running-timer-banner')).toBeNull());
  });

  it('other stop errors are shown verbatim and the banner stays', async () => {
    time.getRunningTimer.mockResolvedValue(running());
    time.stopTimer.mockRejectedValue(new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side.' }));
    renderWithProviders(<RunningTimerBanner />);
    fireEvent.press(await screen.findByRole('button', { name: 'Stop timer on Fix login' }));
    expect(await screen.findByText('Something went wrong on our side.')).toBeTruthy();
    expect(screen.getByTestId('running-timer-banner')).toBeTruthy();
  });
});

describe('TimerControl (Start/Stop only when assigned)', () => {
  it('named owner can start; QA owner starting never prompts', async () => {
    useAuthStore.setState({ user: sessionUser({ id: 8, roleId: 4 }) });
    time.startTimer.mockResolvedValue({ startedId: 1, stopped: null, warning: null });
    renderWithProviders(
      <>
        <TimerControl task={detail({ status: 'READY_FOR_QA' })} />
        <TimerStatusPromptSheet />
      </>,
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    expect(await screen.findByText('Timer started')).toBeTruthy();
    expect(useTimerPromptStore.getState().prompt).toBeNull();
  });

  it('shows the explanation, and no Start button, when the user is not assigned', async () => {
    useAuthStore.setState({ user: sessionUser({ id: 99 }) });
    renderWithProviders(<TimerControl task={detail()} />);
    expect(await screen.findByText(NOT_ASSIGNED_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start timer' })).toBeNull();
  });

  it('a person present in the assignees list may track time', async () => {
    useAuthStore.setState({ user: sessionUser({ id: 99 }) });
    tasks.getTaskAssignees.mockResolvedValue(parseAssignees([{ id: 1, user_id: 99, role: 'DEV', is_primary: false, user: { id: 99, name: 'Me' } }]));
    renderWithProviders(<TimerControl task={detail()} />);
    expect(await screen.findByRole('button', { name: 'Start timer' })).toBeTruthy();
  });

  it('shows Stop when the running timer is on THIS task', async () => {
    time.getRunningTimer.mockResolvedValue(running());
    renderWithProviders(<TimerControl task={detail()} />);
    expect(await screen.findByRole('button', { name: 'Stop timer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start timer' })).toBeNull();
  });

  it('starting on another task says it will stop the current timer', async () => {
    time.getRunningTimer.mockResolvedValue(running({ task: { id: 99, title: 'Other task', status: 'IN_PROGRESS' } }));
    renderWithProviders(<TimerControl task={detail()} />);
    expect(await screen.findByText(/Starting here stops the timer on "Other task"/)).toBeTruthy();
  });

  it('start that auto-stops another timer shows a combined message, and the warning is kept for ~7s', async () => {
    time.getRunningTimer.mockResolvedValue(running({ task: { id: 99, title: 'Other task', status: 'IN_PROGRESS' } }));
    time.startTimer.mockResolvedValue({
      startedId: 2,
      stopped: { id: 1, taskId: 99, title: null, minutes: 30 },
      warning: 'This task is already PASS.',
    });
    renderWithProviders(<TimerControl task={detail()} />);
    const btn = await screen.findByRole('button', { name: 'Start timer' });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    fireEvent.press(btn);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    const toast = await screen.findByText(/Stopped "Other task" · started this one/);
    expect(toast).toHaveTextContent(/This task is already PASS\./);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000); // longer than a normal 4s toast
    });
    expect(screen.queryByText(/This task is already PASS\./)).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2500);
    });
    expect(screen.queryByText(/This task is already PASS\./)).toBeNull();
  });

  it('a DEV starting a NOT_STARTED task gets the "Start working on this?" prompt', async () => {
    time.startTimer.mockResolvedValue({ startedId: 1, stopped: null, warning: null });
    renderWithProviders(
      <>
        <TimerControl task={detail({ status: 'NOT_STARTED' })} />
        <TimerStatusPromptSheet />
      </>,
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    expect(await screen.findByText('Start working on this?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeTruthy();
    tasks.changeTaskStatus.mockResolvedValue(undefined);
    fireEvent.press(screen.getByRole('button', { name: 'In Progress' }));
    await waitFor(() => expect(tasks.changeTaskStatus).toHaveBeenCalledWith(5, 'IN_PROGRESS', undefined));
    expect(await screen.findByText('Moved to In Progress')).toBeTruthy();
  });

  it.each([
    [403, 'forbidden', 'Only people assigned to this task can track time on it.'],
    [409, 'conflict', 'You already have a timer running on this task.'],
  ] as const)('start %i shows the server message verbatim', async (status, kind, message) => {
    time.startTimer.mockRejectedValue(new AppError({ kind, status, message }));
    renderWithProviders(<TimerControl task={detail()} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(useAuthStore.getState().status).toBe('authenticated'); // 403 never logs out
  });

  it('409 also refreshes the running-timer state', async () => {
    time.startTimer.mockRejectedValue(new AppError({ kind: 'conflict', status: 409, message: 'You already have a timer running on this task.' }));
    renderWithProviders(<TimerControl task={detail()} />);
    await waitFor(() => expect(time.getRunningTimer).toHaveBeenCalledTimes(1));
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    await screen.findByText('You already have a timer running on this task.');
    await waitFor(() => expect(time.getRunningTimer.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe('TaskTimePanel', () => {
  it('shows total, per-person bars and a "now" marker for running users', async () => {
    time.getTaskSessions.mockResolvedValue(
      timeApi.parseTaskSessions({
        totalMinutes: 150,
        byUser: [
          { user_id: 7, name: 'Grace', minutes: 100, sessions: 2, running: true },
          { user_id: 8, name: 'Linus', minutes: 50, sessions: 1, running: false },
        ],
      }),
    );
    renderWithProviders(<TaskTimePanel taskId={5} />);
    expect(await screen.findByText('2h 30m')).toBeTruthy();
    expect(within7()).toBeTruthy();
    const bar = screen.getByLabelText('Grace: 1h 40m');
    expect(bar.props.accessibilityValue).toMatchObject({ now: 100 });
    expect(screen.getByLabelText('Linus: 50m').props.accessibilityValue).toMatchObject({ now: 50 });
    expect(screen.getByLabelText('Grace has a timer running now')).toBeTruthy();
    expect(screen.queryByLabelText('Linus has a timer running now')).toBeNull();
  });

  it('empty and error states', async () => {
    time.getTaskSessions.mockResolvedValueOnce(timeApi.parseTaskSessions({ byUser: [] }));
    const first = renderWithProviders(<TaskTimePanel taskId={5} />);
    expect(await screen.findByText('No time tracked yet')).toBeTruthy();
    first.unmount();

    time.getTaskSessions.mockRejectedValueOnce(new AppError({ kind: 'forbidden', status: 403, message: 'You are not a member of this project' }));
    renderWithProviders(<TaskTimePanel taskId={6} />);
    expect(await screen.findByText('You are not a member of this project')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

function within7() {
  return screen.getByTestId('time-user-7');
}
