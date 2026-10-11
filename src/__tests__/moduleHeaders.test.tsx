import { act, screen } from '@testing-library/react-native';
import React from 'react';

import { AppError } from '@/api/errors';
import * as timeApi from '@/api/timeApi';
import { HeaderVariantContext } from '@/components/ui/Screen';
import { MOBILE_MODULES } from '@/navigation/modules';
import { useAuthStore } from '@/store/authStore';
import { sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

/**
 * Every self-headed module screen must keep ONE header (title + global strips + Back when
 * pushed) in EVERY state. Data requests either never resolve (loading) or fail (error).
 */
let mockMode: 'loading' | 'error' = 'loading';
const pending = () => new Promise<never>(() => undefined);
const failing = () => Promise.reject(new AppError({ kind: 'server', status: 500, message: 'Server exploded' }));
const stub = (path: string) => {
  const actual = jest.requireActual(path) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(actual).map(([k, v]) => [k, typeof v === 'function' && /^get[A-Z]/.test(k) ? jest.fn(() => (mockMode === 'loading' ? pending() : failing())) : v]),
  );
};
jest.mock('@/api/dashboardApi', () => stub('@/api/dashboardApi'));
jest.mock('@/api/tasksApi', () => stub('@/api/tasksApi'));
jest.mock('@/api/dailyReportApi', () => stub('@/api/dailyReportApi'));
jest.mock('@/api/qaApi', () => stub('@/api/qaApi'));
jest.mock('@/api/ticketsApi', () => stub('@/api/ticketsApi'));
jest.mock('@/api/sprintsApi', () => stub('@/api/sprintsApi'));
jest.mock('@/api/projectsApi', () => stub('@/api/projectsApi'));
jest.mock('@/api/menuApi', () => stub('@/api/menuApi'));
jest.mock('@/api/timeApi', () => {
  const actual = jest.requireActual('@/api/timeApi') as Record<string, unknown>;
  return { ...actual, getRunningTimer: jest.fn() };
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });

const TITLES: Record<string, string> = {
  Dashboard: 'Hi, Grace',
  Tasks: 'Tasks',
  MyDay: 'My Day',
  QA: 'QA',
  Tickets: 'Tickets',
  Sprints: 'Sprints',
};

beforeEach(() => {
  mockMode = 'loading';
  useAuthStore.setState({
    status: 'authenticated',
    token: 't',
    notice: null,
    user: { ...sessionUser({ id: 7, roleId: 5 }), name: 'Grace Hopper' },
  });
  (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(
    timeApi.parseRunningTimer({
      id: 1,
      started_at: '2026-10-10T09:00:00Z',
      task: { id: 5, title: 'Fix login', status: 'IN_PROGRESS', project: { id: 2, name: 'Alpha' } },
    }),
  );
});

describe.each(['tab', 'push'] as const)('module screens hosted as %s', (variant) => {
  describe.each(['loading', 'error'] as const)('in the %s state', (mode) => {
    it.each(MOBILE_MODULES.map((m) => [m.name, m.screen] as const))('%s keeps exactly one header, one title and the strips', async (name, Screen) => {
      mockMode = mode;
      renderWithProviders(
        <HeaderVariantContext.Provider value={variant}>
          <Screen />
        </HeaderVariantContext.Provider>,
        { navigation: true },
      );
      await settle();
      const title = TITLES[name]!;
      expect(screen.getAllByTestId('page-header')).toHaveLength(1);
      const titles = screen.getAllByRole('header').filter((h) => h.props.children === title);
      expect(titles).toHaveLength(1);
      expect(await screen.findByTestId('running-timer-banner')).toBeTruthy();
      const back = screen.queryAllByRole('button', { name: 'Back' });
      expect(back).toHaveLength(variant === 'push' ? 1 : 0);
    });
  });
});
