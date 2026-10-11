import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import * as dashboardApi from '@/api/dashboardApi';
import * as menuApi from '@/api/menuApi';
import * as qaApi from '@/api/qaApi';
import * as sprintsApi from '@/api/sprintsApi';
import * as ticketsApi from '@/api/ticketsApi';
import * as timeApi from '@/api/timeApi';
import { grantedModules, MAX_MODULE_TABS, splitModules } from '@/navigation/moduleTabs';
import { MOBILE_MODULES } from '@/navigation/modules';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { menu, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

jest.mock('@/api/menuApi');
jest.mock('@/api/authApi');
jest.mock('@/api/projectsApi');
jest.mock('@/api/dashboardApi', () => ({ ...jest.requireActual('@/api/dashboardApi'), getDeveloperStats: jest.fn() }));
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
const tickets = ticketsApi as jest.Mocked<typeof ticketsApi>;
const sprints = sprintsApi as jest.Mocked<typeof sprintsApi>;

const M = {
  dashboard: menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard' }),
  tasks: menu({ id: 2, menu_name: 'Task Board', menu_url: '/tasks' }),
  myday: menu({ id: 3, menu_name: 'My Day', menu_url: '/my-day' }),
  qa: menu({ id: 4, menu_name: 'QA Module', menu_url: '/qa' }),
  tickets: menu({ id: 5, menu_name: 'Tickets', menu_url: '/tickets' }),
  sprints: menu({ id: 6, menu_name: 'Sprints', menu_url: '/sprints' }),
};
const ALL = Object.values(M);

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
const tab = (n: string) => screen.getByLabelText(n);
const signedIn = () => useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ roleId: 5 }) });

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
  tickets.getTickets.mockResolvedValue([]);
  sprints.getSprints.mockResolvedValue([]);
  jest.requireMock('@/api/projectsApi').getTaskStatuses.mockResolvedValue([]);
  jest.requireMock('@/api/projectsApi').getProjects.mockResolvedValue([]);
});
afterEach(async () => {
  await settle();
  jest.restoreAllMocks();
});

describe('moduleTabs (pure)', () => {
  it('granted = server grant AND visible on mobile; never invented', () => {
    const canView = (...urls: string[]) => urls.some((u) => ['/dashboard', '/tickets', '/sprints'].includes(u));
    const mobile = [M.dashboard, M.tickets, { ...M.sprints, is_visible_on_mobile: true }];
    expect(grantedModules(MOBILE_MODULES, canView, mobile).map((m) => m.name)).toEqual(['Dashboard', 'Tickets', 'Sprints']);
    // hidden from mobile -> gone even though granted
    expect(grantedModules(MOBILE_MODULES, canView, [M.dashboard]).map((m) => m.name)).toEqual(['Dashboard']);
    // not granted -> gone even though in the mobile list
    expect(grantedModules(MOBILE_MODULES, () => false, mobile)).toEqual([]);
  });

  it('at most MAX_MODULE_TABS (4) become tabs, in registry order; the rest overflow', () => {
    expect(MAX_MODULE_TABS).toBe(4);
    const all = grantedModules(MOBILE_MODULES, () => true, ALL);
    const { tabs, overflow } = splitModules(all);
    expect(tabs.map((m) => m.name)).toEqual(['Dashboard', 'Tasks', 'MyDay', 'QA']);
    expect(overflow.map((m) => m.name)).toEqual(['Tickets', 'Sprints']);
    expect(splitModules([]).tabs).toEqual([]);
  });
});

describe('tab bar with every module granted, on a 320pt-wide screen', () => {
  it('has at most 5 tabs with short readable labels; Profile is not a tab', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    const names = ['Dashboard', 'Tasks', 'My Day', 'QA', 'Tickets', 'Sprints', 'Profile', 'More', 'Menu'];
    const present = names.filter((n) => screen.queryByLabelText(n));
    expect(present).toEqual(['Dashboard', 'Tasks', 'My Day', 'QA', 'Menu']); // no More tab any more: Menu opens the drawer
    expect(present.length).toBeLessThanOrEqual(5);
    for (const n of present) expect(n.length).toBeLessThanOrEqual(9); // fits ~64pt per tab at 320pt
    expect(Dimensions.get('window').width).toBe(320);
  });

  it('overflow modules (Tickets, Sprints) and Profile open from the drawer as pushed screens with a Back button', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    fireEvent.press(tab('Menu'));
    await settle();

    // Tickets
    fireEvent.press(await screen.findByLabelText(/^Tickets\. View only\. Opens Tickets/));
    await settle();
    expect(await screen.findByText('New ticket')).toBeTruthy();
    expect(tickets.getTickets).toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await settle();

    // Sprints
    fireEvent.press(tab('Menu'));
    await settle();
    fireEvent.press(await screen.findByLabelText(/^Sprints\. View only\. Opens Sprints/));
    await settle();
    expect(await screen.findByText('No sprints')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await settle();

    // Profile
    fireEvent.press(tab('Menu'));
    await settle();
    fireEvent.press(await screen.findByTestId('open-profile'));
    await settle();
    expect(await screen.findByText('ACCOUNT')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await settle();
    fireEvent.press(tab('Menu'));
    await settle();
    expect(await screen.findByTestId('open-profile')).toBeTruthy();
  });
});

describe('gating for the new modules', () => {
  it('only /tickets and /sprints granted: both get tabs (room is left) and nothing else is invented', async () => {
    menus.getMyMenus.mockResolvedValue([M.tickets, M.sprints]);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('New ticket')).toBeTruthy(); // lands on the first granted tab: Tickets
    await settle();
    expect(tab('Tickets')).toBeTruthy();
    expect(tab('Sprints')).toBeTruthy();
    for (const n of ['Dashboard', 'Tasks', 'My Day', 'QA']) expect(screen.queryByLabelText(n)).toBeNull();
    expect(dashboardApi.getDeveloperStats).not.toHaveBeenCalled();
  });

  it('not granted -> no tab, no request', async () => {
    menus.getMyMenus.mockResolvedValue([M.dashboard]);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    expect(screen.queryByLabelText('Tickets')).toBeNull();
    expect(screen.queryByLabelText('Sprints')).toBeNull();
    expect(tickets.getTickets).not.toHaveBeenCalled();
    expect(sprints.getSprints).not.toHaveBeenCalled();
  });

  it('granted but hidden from mobile (is_visible_on_mobile=false) -> not offered anywhere, not even in the drawer', async () => {
    menus.getMyMenus.mockResolvedValue([M.dashboard, { ...M.tickets, is_visible_on_mobile: false }, { ...M.sprints, is_visible_on_mobile: false }]);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    expect(screen.queryByLabelText('Tickets')).toBeNull();
    fireEvent.press(tab('Menu'));
    await settle();
    expect(screen.queryByText('Tickets')).toBeNull();
    expect(screen.queryByText('Sprints')).toBeNull();
  });

  it('a granted module that does not fit is listed in the drawer as OPENABLE, never as "not available"', async () => {
    menus.getMyMenus.mockResolvedValue(ALL);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    await screen.findByText('Active tasks');
    await settle();
    fireEvent.press(tab('Menu'));
    await settle();
    expect(await screen.findByLabelText(/^Tickets\. View only\. Opens Tickets/)).toBeTruthy();
    expect(screen.queryByText('Not available in this version yet')).toBeNull();
  });
});
