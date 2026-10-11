import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import * as dashboardApi from '@/api/dashboardApi';
import { AppError } from '@/api/errors';
import * as menuApi from '@/api/menuApi';
import * as projectsApi from '@/api/projectsApi';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { menu, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

jest.mock('@/api/menuApi');
jest.mock('@/api/authApi');
jest.mock('@/api/dashboardApi');
jest.mock('@/api/tasksApi', () => ({
  ...jest.requireActual('@/api/tasksApi'),
  getTasks: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/api/projectsApi');
const menus = menuApi as jest.Mocked<typeof menuApi>;
const dash = dashboardApi as jest.Mocked<typeof dashboardApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const signedIn = (roleId = 5) =>
  useAuthStore.setState({
    status: 'authenticated',
    token: 'tok',
    notice: null,
    user: sessionUser({ roleId }),
  });

const emptyDev = {
  todayTasks: [], problemTasks: [], upcomingTasks: [], oldPendingTasks: [],
  stats: { activeTasks: 0, completedToday: 0, overdueTasks: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'unauthenticated', user: null, token: null, notice: null });
  dash.getDeveloperStats.mockResolvedValue(emptyDev);
  projects.getTaskStatuses.mockResolvedValue([]);
  projects.getProjects.mockResolvedValue([]);
});

// React Navigation's tab view clears its animation state on a 32ms timer; let it
// fire inside act() so it neither warns nor outlives the test.
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
afterEach(settle);

const tab = (name: string) => screen.getByLabelText(name);

describe('RootNavigator (protected navigation)', () => {
  it('shows the splash while the session is being restored', () => {
    useAuthStore.setState({ status: 'loading' });
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(screen.getByLabelText('Loading your workspace...')).toBeTruthy();
  });

  it('signed out -> only the login screen, no app content, no menu request', () => {
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('Profile')).toBeNull();
    expect(menus.getMyMenus).not.toHaveBeenCalled();
  });

  it('restore failure -> retry screen', () => {
    useAuthStore.setState({ status: 'error', bootstrapError: 'offline' });
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(screen.getByText("Couldn't restore your session")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('builds tabs ONLY from server-granted, mobile-visible menus that have a mobile screen', async () => {
    menus.getMyMenus.mockResolvedValue([
      menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard' }),
      menu({ id: 2, menu_name: 'Task Board', menu_url: '/tasks', can_edit: true, access_level: 'edit' }),
      menu({ id: 3, menu_name: 'Calendar', menu_url: '/calendar' }),
      menu({ id: 4, menu_name: 'Releases', menu_url: '/releases', is_visible_on_mobile: false }),
    ]);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });

    // Lands on the first granted tab (Dashboard).
    expect(await screen.findByText('Active tasks')).toBeTruthy();
    await settle();
    expect(tab('Dashboard')).toBeTruthy();
    expect(tab('Tasks')).toBeTruthy();
    expect(tab('More')).toBeTruthy();
    expect(screen.queryByLabelText('Profile')).toBeNull(); // Profile lives in More, not in the tab bar

    // Not-yet-built modules are listed as unavailable, hidden menus are not listed at all.
    fireEvent.press(tab('More'));
    await settle();
    expect(screen.getByLabelText('Profile and settings')).toBeTruthy();
    // Web-only menus sit behind a collapsed disclosure: one title, rows only after expanding.
    expect(await screen.findByText('Not available in this version yet')).toBeTruthy();
    expect(screen.queryByText('Calendar')).toBeNull();
    fireEvent.press(screen.getByLabelText('Not available in this version yet, 1'));
    expect(await screen.findByText('Calendar')).toBeTruthy();
    expect(screen.queryByText('Releases')).toBeNull();
    expect(screen.getAllByText('Not available in this version yet')).toHaveLength(1);
    expect(screen.getByLabelText(/Calendar\. View only\. Not available in this version yet/)).toBeTruthy();
  });

  it('a role without /tasks gets no Tasks tab even though Phase B has a Tasks screen', async () => {
    menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard' })]);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('Active tasks')).toBeTruthy();
    await settle();
    expect(screen.queryByLabelText('Tasks')).toBeNull();
  });

  it('a granted module hidden from mobile (is_visible_on_mobile=false) gets no tab', async () => {
    menus.getMyMenus.mockResolvedValue([
      menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard', is_visible_on_mobile: false }),
      menu({ id: 2, menu_name: 'Task Board', menu_url: '/tasks' }),
    ]);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByLabelText('Tasks')).toBeTruthy();
    await settle();
    expect(screen.queryByLabelText('Dashboard')).toBeNull();
  });

  it('shows an error with retry (and sign out) when menus fail to load, then recovers', async () => {
    menus.getMyMenus.mockRejectedValue(new AppError({ kind: 'forbidden', message: 'Nope' }));
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('Nope')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();

    menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard' })]);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Active tasks')).toBeTruthy();
    await settle();
  });

  it('empty menu list -> More shows an empty state', async () => {
    menus.getMyMenus.mockResolvedValue([]);
    signedIn();
    renderWithProviders(<RootNavigator />, { navigation: true });
    expect(await screen.findByText('Nothing here yet')).toBeTruthy();
  });
});
