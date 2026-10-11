import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AppError } from '@/api/errors';
import { parseAssignees, parseStatusConfig, parseTaskDetail, type TaskDetail } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import * as timeApi from '@/api/timeApi';
import { RunningTimerBanner } from '@/features/timer/RunningTimerBanner';
import { TimerControl } from '@/features/timer/TimerControl';
import { __resetTimerLock } from '@/hooks/timer';
import { configureNetInfo, healthUrl } from '@/lib/connectivity';
import { createQueryClient, queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/authStore';
import { useDirtyGuard, useTimerPromptStore } from '@/store/uiStores';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/api/timeApi', () => ({
  ...jest.requireActual('@/api/timeApi'),
  getRunningTimer: jest.fn(),
  startTimer: jest.fn(),
  stopTimer: jest.fn(),
  getTaskSessions: jest.fn(),
}));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTaskAssignees: jest.fn(), changeTaskStatus: jest.fn() }));
jest.mock('@/api/projectsApi');

const time = timeApi as jest.Mocked<typeof timeApi>;
const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const running = (over: Record<string, unknown> = {}) =>
  timeApi.parseRunningTimer({
    id: 1,
    started_at: '2026-10-10T09:00:00.000Z',
    task: { id: 5, title: 'Fix login', status: 'IN_PROGRESS', dev_owner_id: 7, project: { id: 2, name: 'Alpha' } },
    ...over,
  });
const detail = (over: Record<string, unknown> = {}): TaskDetail =>
  parseTaskDetail({ ...rawTask({ id: 8, title: 'Other task', status: 'NOT_STARTED', dev_owner_id: 7 }), ...over }) as TaskDetail;

beforeEach(() => {
  jest.clearAllMocks();
  __resetTimerLock();
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }), epoch: 0 });
  useTimerPromptStore.setState({ prompt: null });
  useDirtyGuard.setState({ dirty: false, discardSignal: 0 });
  time.getRunningTimer.mockResolvedValue(null);
  tasks.getTaskAssignees.mockResolvedValue(parseAssignees([]));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
});

describe('M3-09: ANY start/stop error re-syncs the running timer', () => {
  it.each([
    ['network', new AppError({ kind: 'network', message: "Can't reach the server." })],
    ['timeout', new AppError({ kind: 'timeout', message: 'The server took too long to respond.' })],
    ['server', new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side.' })],
    ['forbidden', new AppError({ kind: 'forbidden', status: 403, message: 'Only people assigned to this task can track time on it.' })],
  ])('start failing with %s refetches /time/running', async (_k, err) => {
    time.startTimer.mockRejectedValue(err);
    renderWithProviders(<TimerControl task={detail()} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    expect(await screen.findByText(err.message)).toBeTruthy();
    await waitFor(() => expect(time.getRunningTimer.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('stop failing with a timeout refetches (the stop may have landed server-side)', async () => {
    time.getRunningTimer.mockResolvedValue(running());
    time.stopTimer.mockRejectedValue(new AppError({ kind: 'timeout', message: 'The server took too long to respond.' }));
    renderWithProviders(<RunningTimerBanner />);
    fireEvent.press(await screen.findByRole('button', { name: 'Stop timer on Fix login' }));
    expect(await screen.findByText('The server took too long to respond.')).toBeTruthy();
    await waitFor(() => expect(time.getRunningTimer.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe('M3-16: one pending flag and a re-entrancy lock for start/stop', () => {
  it('two taps in the same tick call the API once', async () => {
    time.getRunningTimer.mockResolvedValue(running());
    let finish!: () => void;
    time.stopTimer.mockImplementation(() => new Promise((r) => { finish = () => r({ id: 1, duration_minutes: 5, auto_closed: false }); }));
    renderWithProviders(<RunningTimerBanner />);
    const stop = await screen.findByRole('button', { name: 'Stop timer on Fix login' });
    act(() => {
      fireEvent.press(stop);
      fireEvent.press(stop);
    });
    await waitFor(() => expect(time.stopTimer).toHaveBeenCalledTimes(1));
    await act(async () => finish());
  });

  it('a start in the task panel disables Stop in the banner (and vice versa) until it settles', async () => {
    time.getRunningTimer.mockResolvedValue(running());
    let finish!: () => void;
    time.startTimer.mockImplementation(() => new Promise((r) => { finish = () => r({ startedId: 2, stopped: { id: 1, taskId: 5, title: 'Fix login', minutes: 3 }, warning: null }); }));
    renderWithProviders(
      <>
        <RunningTimerBanner />
        <TimerControl task={detail()} />
      </>,
    );
    const stop = await screen.findByRole('button', { name: 'Stop timer on Fix login' });
    const start = await screen.findByRole('button', { name: 'Start timer' });
    expect(stop.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(start);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop timer on Fix login' }).props.accessibilityState.disabled).toBe(true));
    expect(screen.getByRole('button', { name: 'Start timer' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Stop timer on Fix login' }));
    expect(time.stopTimer).not.toHaveBeenCalled();

    time.getRunningTimer.mockResolvedValue(null);
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop timer on Fix login' })).toBeNull());
  });

  it('the lock is released even if the screen unmounts mid-request', async () => {
    time.getRunningTimer.mockResolvedValue(running());
    let finish!: () => void;
    time.stopTimer.mockImplementation(() => new Promise((r) => { finish = () => r({ id: 1, duration_minutes: 5, auto_closed: false }); }));
    const first = renderWithProviders(<RunningTimerBanner />);
    fireEvent.press(await screen.findByRole('button', { name: 'Stop timer on Fix login' }));
    await waitFor(() => expect(time.stopTimer).toHaveBeenCalledTimes(1));
    first.unmount();
    await act(async () => finish());

    time.getRunningTimer.mockResolvedValue(running());
    time.stopTimer.mockResolvedValue({ id: 1, duration_minutes: 1, auto_closed: false });
    renderWithProviders(<RunningTimerBanner />);
    fireEvent.press(await screen.findByRole('button', { name: 'Stop timer on Fix login' }));
    await waitFor(() => expect(time.stopTimer).toHaveBeenCalledTimes(2)); // not stuck behind a stale lock
  });
});

describe('M3-11: nothing survives a sign-out or session expiry', () => {
  const prompt = {
    taskId: 5, taskTitle: 'Their task', title: 'Finished with this task?', body: 'b', dismissLabel: 'Leave as is',
    choices: [{ key: 'DEV_DONE', label: 'Dev Done', hint: 'h' }],
  };

  it('logout clears the pending prompt, the dirty guard and cached mutations, and bumps the session epoch', async () => {
    useTimerPromptStore.getState().show(prompt);
    useDirtyGuard.getState().setDirty(true);
    const before = useAuthStore.getState().epoch;
    await useAuthStore.getState().logout();
    expect(useTimerPromptStore.getState().prompt).toBeNull();
    expect(useDirtyGuard.getState().dirty).toBe(false);
    expect(useAuthStore.getState().epoch).toBeGreaterThan(before);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it('session expiry does the same', async () => {
    useTimerPromptStore.getState().show(prompt);
    useDirtyGuard.getState().setDirty(true);
    await useAuthStore.getState().expireSession();
    expect(useTimerPromptStore.getState().prompt).toBeNull();
    expect(useDirtyGuard.getState().dirty).toBe(false);
  });

  it('a prompt that is still being prepared when the user signs out is never shown', async () => {
    let releaseConfig!: () => void;
    projects.getTaskStatuses.mockImplementation(
      () => new Promise((r) => { releaseConfig = () => r(parseStatusConfig(rawStatuses())); }),
    );
    time.startTimer.mockResolvedValue({ startedId: 1, stopped: null, warning: null });
    renderWithProviders(<TimerControl task={detail({ status: 'NOT_STARTED' })} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    await waitFor(() => expect(projects.getTaskStatuses).toHaveBeenCalled()); // waiting for /config

    await act(async () => {
      await useAuthStore.getState().logout(); // the person signs out; someone else may sign in
    });
    await act(async () => releaseConfig());
    await act(async () => undefined);
    expect(useTimerPromptStore.getState().prompt).toBeNull();
  });

  it('control: without a sign-out the same flow DOES show the prompt', async () => {
    time.startTimer.mockResolvedValue({ startedId: 1, stopped: null, warning: null });
    renderWithProviders(<TimerControl task={detail({ status: 'NOT_STARTED' })} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    await waitFor(() => expect(useTimerPromptStore.getState().prompt?.title).toBe('Start working on this?'));
  });
});

describe('M3-10: reachability uses OUR /health, not a blocked third-party URL', () => {
  it.each([
    ['https://api.example.com/api', 'https://api.example.com/health'],
    ['https://api.example.com/api/', 'https://api.example.com/health'],
    ['http://10.0.2.2:5000/api', 'http://10.0.2.2:5000/health'],
    ['https://host.example.com:8443/v1/api', 'https://host.example.com:8443/health'],
  ])('%s -> %s (server.js serves GET /health at the host root)', (api, health) => {
    expect(healthUrl(api)).toBe(health);
  });

  it('is null for a non-URL', () => {
    expect(healthUrl('nonsense')).toBeNull();
    expect(healthUrl('')).toBeNull();
  });

  it('configures NetInfo to probe the server and to ignore OS-level (Google) reachability', async () => {
    configureNetInfo('https://api.example.com/api');
    const cfg = jest.mocked(NetInfo.configure).mock.calls.at(-1)![0] as {
      reachabilityUrl: string;
      useNativeReachability: boolean;
      reachabilityShouldRun: () => boolean;
      reachabilityTest: (r: { status: number }) => Promise<boolean>;
    };
    expect(cfg.reachabilityUrl).toBe('https://api.example.com/health');
    expect(cfg.useNativeReachability).toBe(false);
    expect(cfg.reachabilityShouldRun()).toBe(true);
    await expect(cfg.reachabilityTest({ status: 200 })).resolves.toBe(true);
    await expect(cfg.reachabilityTest({ status: 204 })).resolves.toBe(true);
    await expect(cfg.reachabilityTest({ status: 503 })).resolves.toBe(false);
  });

  it('does not configure anything for an unusable API URL', () => {
    jest.mocked(NetInfo.configure).mockClear();
    configureNetInfo('nonsense');
    expect(NetInfo.configure).not.toHaveBeenCalled();
  });

  it('the retry policy is sane: one retry for transient errors, none offline, none for 4xx', () => {
    const retry = createQueryClient().getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;
    const net = new AppError({ kind: 'network', message: 'x' });
    expect(retry(0, net)).toBe(true);
    expect(retry(1, net)).toBe(false);
    expect(retry(0, new AppError({ kind: 'validation', status: 422, message: 'x' }))).toBe(false);
    expect(retry(0, new AppError({ kind: 'forbidden', status: 403, message: 'x' }))).toBe(false);
    act(() => onlineManager.setOnline(false));
    expect(retry(0, net)).toBe(false); // offline: fail fast, the Offline banner explains
    act(() => onlineManager.setOnline(true));
  });
});
