import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import { AppError } from '@/api/errors';
import * as menuApi from '@/api/menuApi';
import * as timeApi from '@/api/timeApi';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { buildSignOutDialog } from '@/screens/signOutDialog';
import { LOGOUT_FAILED_MESSAGE, useAuthStore } from '@/store/authStore';
import { menu, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { labelInNameViolations } from '@/test/a11y';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@/api/authApi');
jest.mock('@/api/menuApi');
jest.mock('@/api/dailyReportApi', () => ({ ...jest.requireActual('@/api/dailyReportApi'), getPendingDay: jest.fn() }));
jest.mock('@/api/timeApi', () => ({ ...jest.requireActual('@/api/timeApi'), getRunningTimer: jest.fn(), stopTimer: jest.fn() }));

const ss = jest.mocked(SecureStore);
const store = () => (ss as unknown as { __store: Map<string, string> }).__store;
const daily = dailyApi as jest.Mocked<typeof dailyApi>;
const time = timeApi as jest.Mocked<typeof timeApi>;
const menus = menuApi as jest.Mocked<typeof menuApi>;

let alertSpy: jest.SpyInstance;
const lastAlert = () => {
  const call = alertSpy.mock.calls.at(-1) as [string, string, AlertButton[]];
  return { title: call[0], message: call[1], buttons: call[2] };
};
const press = async (text: string) => {
  await act(async () => {
    lastAlert().buttons.find((b) => b.text === text)?.onPress?.();
  });
};
const tapSignOut = async () => {
  fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
};

const runningTimer = (title = 'Fix login') =>
  timeApi.parseRunningTimer({ id: 1, started_at: '2026-10-10T09:00:00Z', task: { id: 5, title, status: 'IN_PROGRESS' } });

beforeEach(() => {
  jest.clearAllMocks();
  store().clear();
  store().set('tt.auth.token', 'jwt');
  useAuthStore.setState({ status: 'authenticated', user: sessionUser(), token: 'jwt', notice: null, signingOut: false });
  menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'My Day', menu_url: '/my-day' })]);
  daily.getPendingDay.mockResolvedValue(dailyApi.parsePending({ date: '2026-10-10', needsSubmit: false }));
  time.getRunningTimer.mockResolvedValue(null);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => alertSpy.mockRestore());

describe('Sign out: confirmation and failure handling', () => {
  it('asks for confirmation and does nothing on Cancel', async () => {
    renderWithProviders(<ProfileScreen />);
    await tapSignOut();
    expect(lastAlert().title).toBe('Sign out?');
    await press('Cancel');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(store().get('tt.auth.token')).toBe('jwt');
  });

  it('signs out after confirmation', async () => {
    renderWithProviders(<ProfileScreen />);
    await tapSignOut();
    await press('Sign out');
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(store().has('tt.auth.token')).toBe(false);
  });

  it('shows a visible error and stays signed in when the token cannot be removed', async () => {
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b'));
    renderWithProviders(<ProfileScreen />);
    await tapSignOut();
    await press('Sign out');
    expect(await screen.findByText(LOGOUT_FAILED_MESSAGE)).toBeTruthy();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(store().get('tt.auth.token')).toBe('jwt');
  });

  it('ignores a tap while a sign-out is in progress', () => {
    useAuthStore.setState({ signingOut: true });
    renderWithProviders(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('Sign out: unfiled day and running timer', () => {
  it('needsSubmit: warns with tracked time and offers "Sign out anyway" / "Review & submit"', async () => {
    daily.getPendingDay.mockResolvedValue(
      dailyApi.parsePending({ date: '2026-10-10', needsSubmit: true, trackedMinutes: 135, taskCount: 3 }),
    );
    const { queryClient } = renderWithProviders(<ProfileScreen />);
    // canView('/my-day') needs the menus; wait until they are cached.
    await waitFor(() => expect(queryClient.getQueryData(['my-menus', 5])).toBeDefined());
    await tapSignOut();
    expect(lastAlert().message).toBe("You tracked 2h 15m across 3 tasks today, but your day hasn't been filed yet.");
    expect(lastAlert().buttons.map((b) => b.text)).toEqual(['Sign out anyway', 'Review & submit']);

    await press('Review & submit');
    expect(mockNavigate).toHaveBeenCalledWith('Main', { screen: 'MyDay' });
    expect(useAuthStore.getState().status).toBe('authenticated'); // did not sign out
  });

  it('needsSubmit: "Sign out anyway" signs out', async () => {
    daily.getPendingDay.mockResolvedValue(dailyApi.parsePending({ needsSubmit: true, trackedMinutes: 60, taskCount: 1 }));
    renderWithProviders(<ProfileScreen />);
    await tapSignOut();
    await press('Sign out anyway');
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
  });

  it('a running timer is mentioned and is NOT stopped by signing out', async () => {
    time.getRunningTimer.mockResolvedValue(runningTimer('Fix login'));
    renderWithProviders(<ProfileScreen />);
    await tapSignOut();
    expect(lastAlert().message).toContain('A timer is still running (Fix login)');
    await press('Sign out');
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
    expect(time.getRunningTimer).toHaveBeenCalled();
    expect(time.stopTimer).not.toHaveBeenCalled(); // never auto-stopped
  });

  it('both: unfiled day + running timer in one dialog', async () => {
    daily.getPendingDay.mockResolvedValue(dailyApi.parsePending({ needsSubmit: true, trackedMinutes: 30, taskCount: 1 }));
    time.getRunningTimer.mockResolvedValue(runningTimer('Deploy'));
    renderWithProviders(<ProfileScreen />);
    await tapSignOut();
    expect(lastAlert().message).toContain("hasn't been filed yet");
    expect(lastAlert().message).toContain('A timer is still running (Deploy)');
  });

  it('a failing pending check never blocks sign out (falls back to the plain dialog)', async () => {
    daily.getPendingDay.mockRejectedValue(new AppError({ kind: 'server', status: 500, message: 'x' }));
    time.getRunningTimer.mockRejectedValue(new AppError({ kind: 'network', message: 'offline' }));
    renderWithProviders(<ProfileScreen />);
    await tapSignOut();
    expect(lastAlert().title).toBe('Sign out?');
    await press('Sign out');
    await waitFor(() => expect(useAuthStore.getState().status).toBe('unauthenticated'));
  });

  it('a hanging pending check is abandoned after the time box', async () => {
    jest.useFakeTimers();
    daily.getPendingDay.mockReturnValue(new Promise(() => undefined));
    time.getRunningTimer.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<ProfileScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(alertSpy).toHaveBeenCalled();
    expect(lastAlert().title).toBe('Sign out?');
    jest.useRealTimers();
  });
});

describe('buildSignOutDialog (pure)', () => {
  it('hides "Review & submit" when My Day is not available to this user', () => {
    const d = buildSignOutDialog({
      pending: dailyApi.parsePending({ needsSubmit: true, trackedMinutes: 30, taskCount: 2 }),
      runningTaskTitle: null,
      canReview: false,
    });
    expect(d.buttons.map((b) => b.text)).toEqual(['Sign out anyway', 'Cancel']);
  });

  it('singular task wording', () => {
    const d = buildSignOutDialog({
      pending: dailyApi.parsePending({ needsSubmit: true, trackedMinutes: 45, taskCount: 1 }),
      runningTaskTitle: null,
      canReview: true,
    });
    expect(d.message).toContain('45m across 1 task today');
  });

  it('pending=null (check failed) behaves like nothing is pending', () => {
    expect(buildSignOutDialog({ pending: null, runningTaskTitle: null, canReview: true }).title).toBe('Sign out?');
  });
});


describe('Label in Name on Profile', () => {
  it('theme radios and Sign out', () => {
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser() });
    renderWithProviders(<ProfileScreen />);
    expect(labelInNameViolations()).toEqual([]);
  });
});
