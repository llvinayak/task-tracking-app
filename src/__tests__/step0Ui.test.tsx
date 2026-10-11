import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import React from 'react';
import { AppState, Text as RNText } from 'react-native';

import { parseProjects } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RichText } from '@/components/RichText';
import { ProjectButton } from '@/features/projects/ProjectPicker';
import { useProjectSync } from '@/hooks/useProjectSync';
import { todayKey, useTodayKey } from '@/hooks/useToday';
import { createQueryClient } from '@/lib/queryClient';
import { useProjectStore } from '@/store/projectStore';
import { renderWithProviders } from '@/test/testUtils';
import * as htmlUtils from '@/utils/html';
import { resetNowProvider } from '@/utils/dates';
import { AppError } from '@/api/errors';

jest.mock('@/api/projectsApi');
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

afterEach(() => {
  jest.useRealTimers();
  resetNowProvider();
});

/* ── L2: "today" ticks at midnight and on resume ───────────────────────── */

function Probe() {
  const k = useTodayKey();
  return <RNText testID="today">{k}</RNText>;
}

describe('L2: the "today" tick', () => {
  const fake = (d: Date) => jest.useFakeTimers({ now: d, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });

  it('changes at local midnight', async () => {
    fake(new Date(2026, 9, 10, 23, 59, 30));
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-10');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000); // 23:59:50
    });
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-10');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(11_000); // 00:00:01
    });
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-11');
  });

  it('keeps rolling: a second midnight is scheduled after the first', async () => {
    fake(new Date(2026, 9, 10, 23, 59, 59));
    renderWithProviders(<Probe />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-11');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(24 * 3600 * 1000);
    });
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-12');
  });

  it('is re-checked when the app returns to the foreground (timers do not run in background)', async () => {
    fake(new Date(2026, 9, 10, 22, 0, 0));
    let handler: ((s: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
      handler = h;
      return { remove: jest.fn() };
    }) as never);
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-10');

    // Phone sleeps for 6 hours: the JS timer never fired.
    jest.setSystemTime(new Date(2026, 9, 11, 4, 0, 0));
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-10');
    await act(async () => {
      handler?.('active');
    });
    expect(screen.getByTestId('today')).toHaveTextContent('2026-10-11');
    spy.mockImplementation((() => ({ remove: jest.fn() })) as never);
  });

  it('does not leave timers behind after unmount', async () => {
    fake(new Date(2026, 9, 10, 12));
    const r = renderWithProviders(<Probe />);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    r.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('todayKey formats local yyyy-MM-dd', () => {
    fake(new Date(2026, 0, 5, 9));
    expect(todayKey()).toBe('2026-01-05');
  });
});

/* ── L4: project store hydration + app-level reconcile + warning chip ──── */

describe('L4: useProjectSync', () => {
  const wrapper = (qc = createQueryClient({ retry: false, gcTime: Infinity })) =>
    function W({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    };
  const sel = (id: number) => ({ id, name: `P${id}`, color: null, status: null, product_id: null });

  beforeEach(() => {
    jest.clearAllMocks();
    useProjectStore.setState({ selected: null });
  });

  it('reconciles only AFTER hydration, then drops a project that is no longer visible', async () => {
    let finish: (() => void) | undefined;
    const hydrated = jest.spyOn(useProjectStore.persist, 'hasHydrated').mockReturnValue(false);
    const onFinish = jest.spyOn(useProjectStore.persist, 'onFinishHydration').mockImplementation(((cb: () => void) => {
      finish = cb;
      return () => undefined;
    }) as never);
    projects.getProjects.mockResolvedValue(parseProjects([{ id: 1, name: 'P1' }]));
    useProjectStore.setState({ selected: sel(99) }); // stale selection read from storage

    renderHook(() => useProjectSync(), { wrapper: wrapper() });
    await waitFor(() => expect(projects.getProjects).toHaveBeenCalled());
    await act(async () => undefined);
    // The list is loaded but hydration has not finished: nothing may be decided yet.
    expect(useProjectStore.getState().selected?.id).toBe(99);

    hydrated.mockReturnValue(true);
    await act(async () => finish?.());
    await waitFor(() => expect(useProjectStore.getState().selected).toBeNull());
    hydrated.mockRestore();
    onFinish.mockRestore();
  });

  it('keeps a still-visible selection and refreshes its name', async () => {
    projects.getProjects.mockResolvedValue(parseProjects([{ id: 5, name: 'Renamed', color: '#112233' }]));
    useProjectStore.setState({ selected: sel(5) });
    renderHook(() => useProjectSync(), { wrapper: wrapper() });
    await waitFor(() => expect(useProjectStore.getState().selected?.name).toBe('Renamed'));
  });

  it('keeps the selection when /projects fails', async () => {
    projects.getProjects.mockRejectedValue(new AppError({ kind: 'network', message: 'offline' }));
    useProjectStore.setState({ selected: sel(5) });
    renderHook(() => useProjectSync(), { wrapper: wrapper() });
    await waitFor(() => expect(projects.getProjects).toHaveBeenCalled());
    await act(async () => undefined);
    expect(useProjectStore.getState().selected?.id).toBe(5);
  });
});

describe('L4: project button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProjectStore.setState({ selected: null });
  });

  it('is labelled "All Projects" by default', async () => {
    projects.getProjects.mockResolvedValue(parseProjects([]));
    renderWithProviders(<ProjectButton onPress={() => undefined} />);
    expect(screen.getByLabelText('Project: All Projects. Change project')).toBeTruthy();
    expect(screen.getByText('All Projects')).toBeTruthy();
  });

  it('shows a warning chip (selection kept) when /projects fails, and not when it succeeds', async () => {
    useProjectStore.setState({ selected: { id: 5, name: 'Alpha', color: null, status: null, product_id: null } });
    projects.getProjects.mockRejectedValue(new AppError({ kind: 'server', status: 500, message: 'x' }));
    const first = renderWithProviders(<ProjectButton onPress={() => undefined} />);
    expect(await screen.findByTestId('project-unverified')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    first.unmount();

    projects.getProjects.mockResolvedValue(parseProjects([{ id: 5, name: 'Alpha' }]));
    renderWithProviders(<ProjectButton onPress={() => undefined} />);
    await waitFor(() => expect(projects.getProjects).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(screen.queryByTestId('project-unverified')).toBeNull();
  });
});

/* ── NetInfo: Offline banner ───────────────────────────────────────────── */

describe('Offline banner', () => {
  afterEach(() => {
    act(() => onlineManager.setOnline(true));
  });

  it('is hidden online, appears when offline, hides again on reconnect', () => {
    renderWithProviders(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/Offline/);
    expect(screen.getByTestId('offline-banner').props.accessibilityRole).toBe('alert');
    act(() => onlineManager.setOnline(true));
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});

/* ── ErrorBoundary ─────────────────────────────────────────────────────── */

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('SECRET internal detail at /src/foo.ts:12');
  return <RNText>all good</RNText>;
}

describe('ErrorBoundary', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errSpy.mockRestore());

  it('renders a friendly full-screen fallback with no message or stack, and recovers on retry', () => {
    let explode = true;
    const Wrapper = () => <Bomb explode={explode} />;
    renderWithProviders(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText(/SECRET/)).toBeNull();
    expect(screen.queryByText(/foo\.ts/)).toBeNull();

    explode = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('reports only a short sanitized message to onError', () => {
    const onError = jest.fn();
    renderWithProviders(
      <ErrorBoundary onError={onError}>
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(typeof onError.mock.calls[0][0]).toBe('string');
    expect(onError.mock.calls[0][0].length).toBeLessThanOrEqual(200);
  });

  it('the inline variant keeps the rest of the screen alive', () => {
    renderWithProviders(
      <>
        <RNText>sibling stays</RNText>
        <ErrorBoundary inline message="This part broke.">
          <Bomb explode />
        </ErrorBoundary>
      </>,
    );
    expect(screen.getByText('sibling stays')).toBeTruthy();
    expect(screen.getByText('This part broke.')).toBeTruthy();
    expect(screen.queryByText(/SECRET/)).toBeNull();
  });

  it('RichText is wrapped: a renderer crash shows an inline message instead of taking the screen down', () => {
    const spy = jest.spyOn(htmlUtils, 'parseRichTextEx').mockImplementation(() => {
      throw new Error('parser exploded');
    });
    renderWithProviders(
      <>
        <RNText>screen survives</RNText>
        <RichText html="<p>x</p>" />
      </>,
    );
    expect(screen.getByText('screen survives')).toBeTruthy();
    expect(screen.getByText("This description couldn't be displayed.")).toBeTruthy();
    expect(screen.queryByText(/parser exploded/)).toBeNull();
    spy.mockRestore();
  });
});
