import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import * as authApi from '@/api/authApi';
import { AppError } from '@/api/errors';
import { LoginScreen } from '@/auth/LoginScreen';
import { renderWithProviders } from '@/test/testUtils';
import { useAuthStore } from '@/store/authStore';

jest.mock('@/api/authApi');
const api = authApi as jest.Mocked<typeof authApi>;

const fill = () => {
  fireEvent.changeText(screen.getByLabelText('Email'), 'ada@x.io');
  fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
};
const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'unauthenticated', user: null, token: null, notice: null });
});
afterEach(() => jest.useRealTimers());

describe('LoginScreen 429 cooldown (monotonic, self-stopping)', () => {
  it('counts down, re-enables the button at zero and leaves NO interval running', async () => {
    jest.useFakeTimers();
    api.login.mockRejectedValue(
      new AppError({ kind: 'rate_limited', status: 429, message: 'Too many attempts.', retryAfterSeconds: 3 }),
    );
    renderWithProviders(<LoginScreen />);
    fill();
    submit();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(/You can try again in 3s/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/You can try again in 2s/)).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText(/You can try again/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState.disabled).toBe(false);
    expect(jest.getTimerCount()).toBe(0); // L1: the 1s ticker stopped itself
  });

  it('is not extended or skipped by changing the wall clock', async () => {
    jest.useFakeTimers();
    api.login.mockRejectedValue(
      new AppError({ kind: 'rate_limited', status: 429, message: 'x', retryAfterSeconds: 10 }),
    );
    renderWithProviders(<LoginScreen />);
    fill();
    submit();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    // Wall clock jumps a day forward; the countdown is driven by performance.now().
    jest.setSystemTime(Date.now() + 86_400_000);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/You can try again in (9|10)s/)).toBeTruthy();
  });
});

describe('LoginScreen under React.StrictMode (L2)', () => {
  it('still shows the error after a failed login (mounted ref survives mount/unmount/mount)', async () => {
    api.login.mockRejectedValue(new AppError({ kind: 'unauthorized', status: 401, message: 'Invalid email or password' }));
    renderWithProviders(
      <React.StrictMode>
        <LoginScreen />
      </React.StrictMode>,
    );
    fill();
    submit();
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Invalid email or password');
    // and the button leaves its busy state
    expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState.busy).toBe(false);
  });
});

describe('LoginScreen notices', () => {
  it('shows the session-expired notice and no other notice', () => {
    useAuthStore.setState({ notice: 'expired' });
    renderWithProviders(<LoginScreen />);
    expect(screen.getByTestId('session-expired-banner')).toHaveTextContent(/session expired/);
    expect(screen.queryByTestId('account-unavailable-banner')).toBeNull();
  });
});
