import { NavigationRouteContext } from '@react-navigation/native';
import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Keyboard, Text as RNText } from 'react-native';

import * as timeApi from '@/api/timeApi';
import { Banner, Screen } from '@/components/ui';
import { RunningTimerBanner } from '@/features/timer/RunningTimerBanner';
import { useAuthStore } from '@/store/authStore';
import { sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { FONT_TIMEOUT_MS, useAppFonts } from '@/theme/useAppFonts';

const mockNavigate = jest.fn();
const mockUseFonts = jest.fn();
jest.mock('expo-font', () => ({ useFonts: (...a: unknown[]) => mockUseFonts(...a) }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@/api/timeApi', () => ({
  ...jest.requireActual('@/api/timeApi'),
  getRunningTimer: jest.fn(),
  stopTimer: jest.fn(),
}));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useAppFonts', () => {
  const splash = () => jest.requireMock('expo-splash-screen') as { hideAsync: jest.Mock };

  it('ready and fontsLoaded once the fonts load', () => {
    mockUseFonts.mockReturnValue([true, null]);
    const { result } = renderHook(() => useAppFonts());
    expect(result.current).toEqual({ fontsLoaded: true, ready: true });
  });

  it('while loading: not ready; after the timeout: ready WITHOUT fontsLoaded (system font fallback)', () => {
    jest.useFakeTimers();
    mockUseFonts.mockReturnValue([false, null]);
    const { result } = renderHook(() => useAppFonts());
    expect(result.current).toEqual({ fontsLoaded: false, ready: false });
    act(() => void jest.advanceTimersByTime(FONT_TIMEOUT_MS + 10));
    expect(result.current).toEqual({ fontsLoaded: false, ready: true });
  });

  it('a font error releases the app immediately and never claims fonts are loaded', () => {
    mockUseFonts.mockReturnValue([false, new Error('boom')]);
    const { result } = renderHook(() => useAppFonts());
    expect(result.current).toEqual({ fontsLoaded: false, ready: true });
    // The splash is held at module load and hidden by the first laid-out frame, not by this hook.
    expect(splash().hideAsync).not.toHaveBeenCalled();
  });

  it('no timer is left running once the fonts are loaded', () => {
    jest.useFakeTimers();
    mockUseFonts.mockReturnValue([true, null]);
    renderHook(() => useAppFonts());
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('timer strip row', () => {
  const running = () =>
    timeApi.parseRunningTimer({
      id: 1,
      started_at: '2026-10-10T09:00:00Z',
      task: { id: 5, title: 'Fix login', status: 'IN_PROGRESS', project: { id: 2, name: 'Alpha' } },
    });
  const open = () => screen.getByRole('button', { name: /Timer running on Fix login/ });

  beforeEach(() => {
    mockNavigate.mockClear();
    useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
    (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(running());
  });

  it('opens the task from another screen', async () => {
    renderWithProviders(<RunningTimerBanner />);
    await screen.findByText('Fix login');
    fireEvent.press(open());
    expect(mockNavigate).toHaveBeenCalledWith('TaskDetail', { taskId: 5 });
  });

  it('is disabled (not a link) while already on that task, but still a link on another task', async () => {
    const route = (taskId: number) => ({ key: 'k', name: 'TaskDetail' as const, params: { taskId } });
    const first = renderWithProviders(
      <NavigationRouteContext.Provider value={route(5)}>
        <RunningTimerBanner />
      </NavigationRouteContext.Provider>,
    );
    await screen.findByText('Fix login');
    expect(open().props.accessibilityState).toMatchObject({ disabled: true });
    first.unmount();
    renderWithProviders(
      <NavigationRouteContext.Provider value={route(9)}>
        <RunningTimerBanner />
      </NavigationRouteContext.Provider>,
    );
    await screen.findByText('Fix login');
    expect(open().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('the project line uses the muted tone (contrast on the brand tint)', async () => {
    renderWithProviders(<RunningTimerBanner />);
    await screen.findByText('Alpha');
    const style = Object.assign({}, ...[screen.getByText('Alpha').props.style].flat(5).filter(Boolean));
    expect(style.color).toBe('rgb(75, 85, 99)'); // fgMuted (light)
  });
});

describe('Banner announce and Screen footer', () => {
  it('announces assertive (danger) banners on iOS, not the calm ones', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    renderWithProviders(
      <>
        <Banner message="Saved failed" tone="danger" />
        <Banner message="FYI" tone="info" />
      </>,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Saved failed');
  });

  it('the footer is hidden while the keyboard is open and returns afterwards', () => {
    const handlers = new Map<string, ((e: object) => void)[]>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (e: object) => void) => {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
      return { remove: () => undefined };
    }) as never);
    renderWithProviders(
      <Screen footer={<RNText>FOOT</RNText>}>
        <RNText>body</RNText>
      </Screen>,
    );
    expect(screen.getByText('FOOT')).toBeTruthy();
    act(() => (handlers.get('keyboardDidShow') ?? []).forEach((h) => h({ endCoordinates: { height: 300, screenY: 500 } })));
    expect(screen.queryByText('FOOT')).toBeNull();
    act(() => (handlers.get('keyboardDidHide') ?? []).forEach((h) => h({})));
    expect(screen.getByText('FOOT')).toBeTruthy();
  });
});
