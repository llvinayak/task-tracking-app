import { act, fireEvent, screen } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import React from 'react';
import { Dimensions } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import * as dashboardApi from '@/api/dashboardApi';
import * as menuApi from '@/api/menuApi';
import * as qaApi from '@/api/qaApi';
import * as sprintsApi from '@/api/sprintsApi';
import * as ticketsApi from '@/api/ticketsApi';
import * as timeApi from '@/api/timeApi';
import { grantedModules, splitModules } from '@/navigation/moduleTabs';
import { MOBILE_MODULES } from '@/navigation/modules';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { menu, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { labelInNameViolations } from '@/test/a11y';

jest.mock('@/api/menuApi');
jest.mock('@/api/authApi');
jest.mock('@/api/projectsApi');
jest.mock('@/api/dashboardApi', () => ({ ...jest.requireActual('@/api/dashboardApi'), getDeveloperStats: jest.fn(), getQAStats: jest.fn() }));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTasks: jest.fn().mockResolvedValue([]) }));
jest.mock('@/api/timeApi', () => ({ ...jest.requireActual('@/api/timeApi'), getRunningTimer: jest.fn() }));
jest.mock('@/api/dailyReportApi', () => ({
  ...jest.requireActual('@/api/dailyReportApi'),
  getDailyReport: jest.fn(),
  getPendingDay: jest.fn(),
  getUnreviewedEntries: jest.fn(),
}));
jest.mock('@/api/qaApi', () => ({ ...jest.requireActual('@/api/qaApi'), getQAQueue: jest.fn(), getOverdueToQA: jest.fn() }));
jest.mock('@/api/ticketsApi', () => ({ ...jest.requireActual('@/api/ticketsApi'), getTickets: jest.fn() }));
jest.mock('@/api/sprintsApi', () => ({ ...jest.requireActual('@/api/sprintsApi'), getSprints: jest.fn() }));

const menus = menuApi as jest.Mocked<typeof menuApi>;

const M = {
  dashboard: menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard' }),
  tasks: menu({ id: 2, menu_name: 'Task Board', menu_url: '/tasks' }),
  myday: menu({ id: 3, menu_name: 'My Day', menu_url: '/my-day' }),
  qa: menu({ id: 4, menu_name: 'QA Module', menu_url: '/qa' }),
  tickets: menu({ id: 5, menu_name: 'Tickets', menu_url: '/tickets' }),
  sprints: menu({ id: 6, menu_name: 'Sprints', menu_url: '/sprints' }),
};
const ALL = Object.values(M);
const canViewAll = () => true;
const names = (roleId?: number, canView: (...u: string[]) => boolean = canViewAll, mobile = ALL) =>
  grantedModules(MOBILE_MODULES, canView, mobile, roleId).map((m) => m.name);

// react-navigation clears a tab transition with a 32ms setTimeout (BottomTabView): flush >= 40ms INSIDE act
// right after every tab press so that update is never delivered outside act.
const flushTabTimer = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
const settle = flushTabTimer;
/** Presses a tab and flushes the navigator's 32ms timer inside act. */
const pressTab = async (label: string) => {
  fireEvent.press(screen.getByLabelText(label));
  await flushTabTimer();
};
const signedIn = (roleId: number) =>
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ roleId }) });

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'unauthenticated', user: null, token: null, notice: null });
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 1 });
  (dashboardApi.getDeveloperStats as jest.Mock).mockResolvedValue(dashboardApi.parseDeveloperStats(null));
  (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(null);
  (dailyApi.getPendingDay as jest.Mock).mockResolvedValue(dailyApi.parsePending({ needsSubmit: false }));
  (dailyApi.getDailyReport as jest.Mock).mockResolvedValue(
    dailyApi.parseDailyReport({ date: '2026-10-10', status: 'draft', items: [], summary: '', blockers: '', tomorrow_plan: '' }),
  );
  (dailyApi.getUnreviewedEntries as jest.Mock).mockResolvedValue([]);
  (qaApi.getQAQueue as jest.Mock).mockResolvedValue([]);
  (qaApi.getOverdueToQA as jest.Mock).mockResolvedValue([]);
  (ticketsApi.getTickets as jest.Mock).mockResolvedValue([]);
  (sprintsApi.getSprints as jest.Mock).mockResolvedValue([]);
  jest.requireMock('@/api/projectsApi').getTaskStatuses.mockResolvedValue([]);
  jest.requireMock('@/api/projectsApi').getProjects.mockResolvedValue([]);
});
afterEach(async () => {
  await settle();
  jest.restoreAllMocks();
});

describe('role-aware tab order (presentation only)', () => {
  it('orders by the role priority table', () => {
    expect(names(5)).toEqual(['Dashboard', 'Tasks', 'MyDay', 'QA', 'Tickets', 'Sprints']);
    expect(names(4)).toEqual(['QA', 'Dashboard', 'Tasks', 'MyDay', 'Tickets', 'Sprints']);
    expect(names(3)).toEqual(['Dashboard', 'Tasks', 'Sprints', 'MyDay', 'QA', 'Tickets']);
    expect(names(2)).toEqual(['Dashboard', 'Sprints', 'Tasks', 'Tickets', 'MyDay', 'QA']);
    expect(names(1)).toEqual(['Dashboard', 'Tasks', 'Sprints', 'Tickets', 'MyDay', 'QA']);
    expect(names(8)).toEqual(names(1));
    expect(names(6)).toEqual(['Tickets', 'Dashboard', 'Tasks', 'Sprints', 'MyDay', 'QA']);
  });

  it('PM and CTO get My Day in More (5th), Developer keeps it as a tab', () => {
    expect(splitModules(grantedModules(MOBILE_MODULES, canViewAll, ALL, 2)).overflow.map((m) => m.name)).toEqual(['MyDay', 'QA']);
    expect(splitModules(grantedModules(MOBILE_MODULES, canViewAll, ALL, 1)).overflow.map((m) => m.name)).toEqual(['MyDay', 'QA']);
    expect(splitModules(grantedModules(MOBILE_MODULES, canViewAll, ALL, 5)).tabs.map((m) => m.name)).toContain('MyDay');
  });

  it('never invents modules: the grant/visibility filter runs first, ordering cannot add anything', () => {
    const only = (...u: string[]) => u.some((x) => ['/tickets', '/dashboard'].includes(x));
    expect(names(6, only)).toEqual(['Tickets', 'Dashboard']); // Client: Tickets first, nothing else appears
    expect(names(6, only, [M.dashboard])).toEqual(['Dashboard']); // tickets hidden from mobile
    expect(names(6, () => false)).toEqual([]);
  });

  it('an unknown role keeps the registry order', () => {
    expect(names(99)).toEqual(['Dashboard', 'Tasks', 'MyDay', 'QA', 'Tickets', 'Sprints']);
    expect(names(undefined)).toEqual(names(99));
  });
});

describe('tab bar chrome', () => {
  it('a Client with 2 granted modules gets 2 tabs + More, Tickets first', async () => {
    menus.getMyMenus.mockResolvedValue([M.dashboard, M.tickets]);
    signedIn(6);
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('New ticket')).toBeTruthy(); // landed on Tickets
    await settle();
    expect(screen.getByLabelText('Tickets')).toBeTruthy();
    expect(screen.getByLabelText('Dashboard')).toBeTruthy();
    expect(screen.getByLabelText('More')).toBeTruthy();
    expect(screen.queryByLabelText('Tasks')).toBeNull();
  });

  it('PM: My Day is in More, so the unfiled dot moves to More (label says so) and no numeric badge exists', async () => {
    (dailyApi.getPendingDay as jest.Mock).mockResolvedValue(
      dailyApi.parsePending({ date: '2026-10-10', needsSubmit: true, trackedMinutes: 30, taskCount: 1 }),
    );
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn(2);
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByLabelText('More, My Day not filed yet')).toBeTruthy();
    await settle();
    expect(screen.queryByLabelText('My Day, not filed yet')).toBeNull();
    expect(screen.queryByLabelText('My Day')).toBeNull(); // not a tab for a PM
    expect(screen.queryByText('1', { includeHiddenElements: true })).toBeNull();
  });

  it('Developer: the My Day tab itself carries the unfiled label', async () => {
    (dailyApi.getPendingDay as jest.Mock).mockResolvedValue(
      dailyApi.parsePending({ date: '2026-10-10', needsSubmit: true, trackedMinutes: 30, taskCount: 1 }),
    );
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn(5);
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByLabelText('My Day, not filed yet')).toBeTruthy();
    expect(screen.getByLabelText('More')).toBeTruthy();
  });
});

describe('More', () => {
  it('Profile first; only modules that are NOT tabs; web-only menus collapsed', async () => {
    menus.getMyMenus.mockResolvedValue([...ALL, menu({ id: 9, menu_name: 'Calendar', menu_url: '/calendar' })]);
    signedIn(5);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    await pressTab('More');
    // One heading "More" (PageHeader), no "for <name>" and no explanatory paragraph.
    expect(screen.getAllByText('More').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^More for /)).toBeNull();
    expect(screen.getByLabelText('Profile and settings')).toBeTruthy();
    expect(screen.getByText('MODULES')).toBeTruthy();
    // Overflow modules for a developer: Tickets and Sprints. Tab modules are not repeated.
    expect(screen.getByLabelText(/^Tickets\. View only\. Opens Tickets/)).toBeTruthy();
    expect(screen.getByLabelText(/^Sprints\. View only\. Opens Sprints/)).toBeTruthy();
    expect(screen.queryByLabelText(/Opens Tasks/)).toBeNull();
    expect(screen.queryByLabelText(/Opens Dashboard/)).toBeNull();
    // No visible access badges.
    expect(screen.queryByText('Can edit')).toBeNull();
    expect(screen.queryByText('View only')).toBeNull();
    // Collapsed disclosure.
    expect(screen.queryByText('Calendar')).toBeNull();
    const toggle = screen.getByTestId('web-only-toggle');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(toggle);
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByTestId('web-only-toggle').props.accessibilityState).toMatchObject({ expanded: true });
  });

  it('no MODULES section when every granted module is a tab', async () => {
    menus.getMyMenus.mockResolvedValue([M.dashboard, M.tasks]);
    signedIn(5);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    await pressTab('More');
    expect(screen.queryByText('MODULES')).toBeNull();
    expect(screen.getByLabelText('Profile and settings')).toBeTruthy();
  });
});

describe('single header with global strips', () => {
  const running = () =>
    timeApi.parseRunningTimer({
      id: 1,
      started_at: '2026-10-10T09:00:00Z',
      task: { id: 5, title: 'Fix login', status: 'IN_PROGRESS', project: { id: 2, name: 'Alpha' } },
    });

  it('the timer strip shows on a pushed screen (Profile) and the header has one Back button', async () => {
    (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(running());
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn(5);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    await pressTab('More');
    fireEvent.press(await screen.findByLabelText('Profile and settings'));
    await settle();
    expect(await screen.findByText('ACCOUNT')).toBeTruthy();
    expect(screen.getByTestId('running-timer-banner')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
    // The title is shown once, by the header.
    expect(screen.getAllByText('Profile')).toHaveLength(1);
  });

  it('the offline strip follows you onto pushed screens too', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn(5);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    await pressTab('More');
    fireEvent.press(await screen.findByLabelText('Profile and settings'));
    await settle();
    expect(await screen.findByText('ACCOUNT')).toBeTruthy();
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    act(() => onlineManager.setOnline(true));
  });
});

describe('More: My Day cue', () => {
  it('a PM sees "Not filed yet" on the My Day row inside More (the tab dot is not available there)', async () => {
    (dailyApi.getPendingDay as jest.Mock).mockResolvedValue(
      dailyApi.parsePending({ date: '2026-10-10', needsSubmit: true, trackedMinutes: 30, taskCount: 1 }),
    );
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn(2);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByLabelText('More, My Day not filed yet');
    fireEvent.press(screen.getByLabelText('More, My Day not filed yet'));
    await settle();
    expect(await screen.findByText('Not filed yet')).toBeTruthy();
    expect(screen.getByLabelText(/Opens My Day\. Not filed yet/)).toBeTruthy();
  });

  it('nothing pending: no cue on the row', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn(2);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByLabelText('More');
    await pressTab('More');
    expect(await screen.findByLabelText(/Opens My Day$/)).toBeTruthy();
    expect(screen.queryByText('Not filed yet')).toBeNull();
  });
});


describe('Label in Name on the shell', () => {
  it('tab bar, More (profile row, modules, web-only disclosure)', async () => {
    menus.getMyMenus.mockResolvedValue([...ALL, menu({ id: 9, menu_name: 'Calendar', menu_url: '/calendar' })]);
    signedIn(5);
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    expect(labelInNameViolations()).toEqual([]);
    await pressTab('More');
    fireEvent.press(screen.getByTestId('web-only-toggle'));
    expect(labelInNameViolations()).toEqual([]);
  });
});
