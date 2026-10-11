import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { onlineManager } from '@tanstack/react-query';

import * as dailyApi from '@/api/dailyReportApi';
import * as dashboardApi from '@/api/dashboardApi';
import { AppError } from '@/api/errors';
import * as menuApi from '@/api/menuApi';
import * as projectsApi from '@/api/projectsApi';
import * as qaApi from '@/api/qaApi';
import * as timeApi from '@/api/timeApi';
import { useDirtyGuard } from '@/hooks/dailyReport';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { menu, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

jest.mock('@/api/menuApi');
jest.mock('@/api/authApi');
jest.mock('@/api/dashboardApi', () => ({ ...jest.requireActual('@/api/dashboardApi'), getDeveloperStats: jest.fn() }));
jest.mock('@/api/projectsApi');
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTasks: jest.fn().mockResolvedValue([]) }));
jest.mock('@/api/timeApi', () => ({ ...jest.requireActual('@/api/timeApi'), getRunningTimer: jest.fn() }));
jest.mock('@/api/dailyReportApi', () => ({
  ...jest.requireActual('@/api/dailyReportApi'),
  getDailyReport: jest.fn(),
  getPendingDay: jest.fn(),
  getUnreviewedEntries: jest.fn(),
}));
jest.mock('@/api/qaApi', () => ({
  ...jest.requireActual('@/api/qaApi'),
  getQAQueue: jest.fn(),
  getOverdueToQA: jest.fn(),
}));

const menus = menuApi as jest.Mocked<typeof menuApi>;
const dash = dashboardApi as jest.Mocked<typeof dashboardApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const time = timeApi as jest.Mocked<typeof timeApi>;
const daily = dailyApi as jest.Mocked<typeof dailyApi>;
const qa = qaApi as jest.Mocked<typeof qaApi>;

const signedIn = (roleId = 5) =>
  useAuthStore.setState({ status: 'authenticated', token: 'tok', notice: null, user: sessionUser({ roleId }) });
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
const tab = (name: string) => screen.getByLabelText(name);

const ALL = [
  menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard' }),
  menu({ id: 2, menu_name: 'Task Board', menu_url: '/tasks' }),
  menu({ id: 3, menu_name: 'My Day', menu_url: '/my-day' }),
  menu({ id: 4, menu_name: 'QA Module', menu_url: '/qa' }),
  menu({ id: 5, menu_name: 'Sprints', menu_url: '/sprints' }),
];

const dayRaw = {
  date: '2026-10-10', status: 'draft', exists: true, summary: '', blockers: '', tomorrow_plan: '',
  items: [], totalMinutes: 0, trackedMinutes: 0, needsReview: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'unauthenticated', user: null, token: null, notice: null });
  useDirtyGuard.setState({ dirty: false, discardSignal: 0 });
  dash.getDeveloperStats.mockResolvedValue(dashboardApi.parseDeveloperStats(null));
  projects.getTaskStatuses.mockResolvedValue([]);
  projects.getProjects.mockResolvedValue([]);
  time.getRunningTimer.mockResolvedValue(null);
  daily.getPendingDay.mockResolvedValue(dailyApi.parsePending({ date: '2026-10-10', needsSubmit: false }));
  daily.getDailyReport.mockResolvedValue(dailyApi.parseDailyReport(dayRaw) as dailyApi.DailyReport);
  daily.getUnreviewedEntries.mockResolvedValue([]);
  qa.getQAQueue.mockResolvedValue([]);
  qa.getOverdueToQA.mockResolvedValue([]);
});
afterEach(settle);

describe('module registration: My Day and QA', () => {
  it('registers tabs for the first 4 granted modules; the rest (and Profile) open from More', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('Active tasks')).toBeTruthy();
    await settle();
    for (const t of ['Dashboard', 'Tasks', 'My Day', 'QA', 'More']) expect(tab(t)).toBeTruthy();
    // Sprints is built now, but the bar holds at most 4 modules + More: it opens from More.
    expect(screen.queryByLabelText('Sprints')).toBeNull();

    fireEvent.press(tab('More'));
    await settle();
    expect(await screen.findByText('Sprints')).toBeTruthy();
    // Built modules (even the overflow one) are not labelled unavailable.
    expect(screen.queryAllByText('Not available in this version yet')).toHaveLength(0);
    expect(screen.getByLabelText(/^Sprints\. View only\. Opens Sprints/)).toBeTruthy();
  });

  it('never invents access: no /my-day grant means no My Day tab (and no pending request)', async () => {
    menus.getMyMenus.mockResolvedValue(ALL.filter((m) => m.menu_url !== '/my-day'));
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('Active tasks')).toBeTruthy();
    await settle();
    expect(screen.queryByLabelText('My Day')).toBeNull();
    expect(daily.getPendingDay).not.toHaveBeenCalled();
  });

  it('a /qa grant hidden from mobile gives no QA tab', async () => {
    menus.getMyMenus.mockResolvedValue(ALL.map((m) => (m.menu_url === '/qa' ? { ...m, is_visible_on_mobile: false } : m)));
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('Active tasks')).toBeTruthy();
    await settle();
    expect(screen.queryByLabelText('QA')).toBeNull();
    expect(qa.getQAQueue).not.toHaveBeenCalled();
  });

  it('QA tab opens the queue', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    fireEvent.press(tab('QA'));
    await settle();
    expect(await screen.findByTestId('qa-awaiting')).toBeTruthy();
  });
});

describe('My Day pending badge', () => {
  it('shows a badge on the tab when the day needs submitting, with an accessible hint', async () => {
    daily.getPendingDay.mockResolvedValue(dailyApi.parsePending({ date: '2026-10-10', needsSubmit: true, trackedMinutes: 90, taskCount: 2 }));
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByLabelText('My Day, not filed yet')).toBeTruthy();
    await settle();
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy(); // the badge itself
  });

  it('no badge when nothing is pending', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    await waitFor(() => expect(daily.getPendingDay).toHaveBeenCalled());
    expect(screen.getByLabelText('My Day')).toBeTruthy();
    expect(screen.queryByLabelText('My Day, not filed yet')).toBeNull();
  });

  it('a failing pending check shows no badge and no error (retry:false, never blocks)', async () => {
    daily.getPendingDay.mockRejectedValue(new AppError({ kind: 'server', status: 500, message: 'x' }));
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    await waitFor(() => expect(daily.getPendingDay).toHaveBeenCalledTimes(1));
    await settle();
    expect(daily.getPendingDay).toHaveBeenCalledTimes(1); // retry:false
    expect(screen.queryByLabelText('My Day, not filed yet')).toBeNull();
  });
});

describe('unsaved My Day edits guard the tab bar', () => {
  it('pressing another tab while dirty asks first; "Keep editing" stays, "Discard" leaves and resets', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    fireEvent.press(tab('My Day'));
    await settle();
    await screen.findByTestId('day-date');

    act(() => useDirtyGuard.getState().setDirty(true));
    fireEvent.press(tab('Tasks'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0]![2] as AlertButton[];
    expect(screen.getByTestId('day-date')).toBeTruthy(); // still on My Day

    await act(async () => buttons.find((b) => b.text === 'Discard')?.onPress?.());
    await settle();
    expect(useDirtyGuard.getState().discardSignal).toBe(1);
    expect(await screen.findByRole('button', { name: 'Overdue, 0' }).catch(() => null)).toBeDefined();
    alertSpy.mockRestore();
  });

  it('does not interfere when the day is clean', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    fireEvent.press(tab('My Day'));
    await settle();
    fireEvent.press(tab('Dashboard'));
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('M2: a failed background menus refetch keeps the tabs', () => {
  it('stale menus stay usable; More shows a banner; only an initial failure shows the error screen', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    const { queryClient } = renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();

    menus.getMyMenus.mockRejectedValue(new AppError({ kind: 'network', message: "Can't reach the server." }));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['my-menus', 5] });
    });
    await settle();
    expect(tab('Dashboard')).toBeTruthy(); // navigator not replaced by the error screen
    expect(screen.queryByText("Couldn't load your menus")).toBeNull();

    fireEvent.press(tab('More'));
    await settle();
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
    expect(screen.getByText('Sprints')).toBeTruthy();
  });
});

describe('Offline banner above the tab bar', () => {
  it('appears when connectivity drops and disappears on reconnect (no write queue)', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    act(() => onlineManager.setOnline(true));
    await settle();
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});

describe('running timer banner above the tab bar', () => {
  it('shows on every tab while a timer runs', async () => {
    time.getRunningTimer.mockResolvedValue(
      timeApi.parseRunningTimer({ id: 1, started_at: '2026-10-10T09:00:00Z', task: { id: 5, title: 'Fix login', status: 'IN_PROGRESS', project: { id: 2, name: 'Alpha' } } }),
    );
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByTestId('running-timer-banner')).toBeTruthy();
    await settle();
    fireEvent.press(tab('More'));
    await settle();
    expect(screen.getByTestId('running-timer-banner')).toBeTruthy();
  });
});
