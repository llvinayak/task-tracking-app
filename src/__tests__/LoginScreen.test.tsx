import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as authApi from '@/api/authApi';
import { AppError } from '@/api/errors';
import type { ApiUser } from '@/api/types';
import { LoginScreen } from '@/auth/LoginScreen';
import { useAuthStore } from '@/store/authStore';

import { renderWithProviders } from '@/test/testUtils';
import { labelInNameViolations } from '@/test/a11y';

jest.mock('@/api/authApi');
const api = authApi as jest.Mocked<typeof authApi>;

const apiUser: ApiUser = { id: 1, name: 'Ada Lovelace', email: 'ada@x.io', role_id: 5, role_name: 'Developer' };

const fill = (email: string, password: string) => {
  fireEvent.changeText(screen.getByLabelText('Email'), email);
  fireEvent.changeText(screen.getByLabelText('Password'), password);
};
const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'unauthenticated', user: null, token: null, notice: null });
});

describe('LoginScreen', () => {
  it('validates empty and malformed input without calling the API', async () => {
    renderWithProviders(<LoginScreen />);
    submit();
    expect(await screen.findByText('Enter your email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();

    fill('not-an-email', 'pw');
    submit();
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('shows loading and blocks double submit while the request is pending', async () => {
    let resolve!: (v: { user: ApiUser; token: string }) => void;
    api.login.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderWithProviders(<LoginScreen />);
    fill('ada@x.io', 'secret123');
    submit();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true,
      }),
    );
    submit();
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.login).toHaveBeenCalledWith({ email: 'ada@x.io', password: 'secret123' });

    await act(async () => resolve({ user: apiUser, token: 'jwt' }));
  });

  it('success authenticates the store (navigation swaps on this state)', async () => {
    api.login.mockResolvedValue({ user: apiUser, token: 'jwt' });
    renderWithProviders(<LoginScreen />);
    fill('  ada@x.io ', 'secret123');
    submit();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(api.login).toHaveBeenCalledWith({ email: 'ada@x.io', password: 'secret123' });
    expect(useAuthStore.getState().user?.roleName).toBe('Developer');
  });

  it.each([
    [401, 'unauthorized', 'Invalid email or password'],
    [403, 'forbidden', 'Account is deactivated'],
  ] as const)('shows the server message for %i', async (status, kind, message) => {
    api.login.mockRejectedValue(new AppError({ kind, status, message }));
    renderWithProviders(<LoginScreen />);
    fill('ada@x.io', 'wrong');
    submit();
    expect(await screen.findByTestId('login-error')).toHaveTextContent(message);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('shows a network error and lets the user retry', async () => {
    api.login.mockRejectedValueOnce(new AppError({ kind: 'network', message: "Can't reach the server. Check your connection and try again." }));
    renderWithProviders(<LoginScreen />);
    fill('ada@x.io', 'secret123');
    submit();
    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy();

    api.login.mockResolvedValueOnce({ user: apiUser, token: 'jwt' });
    submit();
    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
  });

  it('429 disables the button for Retry-After seconds', async () => {
    api.login.mockRejectedValue(
      new AppError({ kind: 'rate_limited', status: 429, message: 'Too many attempts. Try again in 1 minute(s).', retryAfterSeconds: 60 }),
    );
    renderWithProviders(<LoginScreen />);
    fill('ada@x.io', 'secret123');
    submit();
    expect(await screen.findByText(/You can try again in 1m 00s/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState.disabled).toBe(true);
    submit();
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it('shows the session-expired notice after a 401 logout', () => {
    useAuthStore.setState({ notice: 'expired' });
    renderWithProviders(<LoginScreen />);
    expect(screen.getByTestId('session-expired-banner')).toHaveTextContent(/Your session expired/);
  });

  it('exposes labelled inputs and a 44pt submit target', () => {
    renderWithProviders(<LoginScreen />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    const style = screen.getByRole('button', { name: 'Sign in' }).props.style;
    const flat = Object.assign({}, ...[style].flat(3).filter(Boolean));
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
  });
});


describe('Label in Name on Login', () => {
  it('Show/Hide, Sign in and the inputs', () => {
    renderWithProviders(<LoginScreen />);
    expect(labelInNameViolations()).toEqual([]);
  });
});
