import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';

import { parseTasks, type Task, type TaskDetail, parseTaskDetail } from '@/api/models';
import { attachmentSchemes, validateApiBaseUrl, validateHealthUrl } from '@/config/env';
import { keys } from '@/hooks/queries';
import { applyOptimisticStatus } from '@/hooks/taskMutations';
import { healthUrl, isOnlineState, wireNetInfo } from '@/lib/connectivity';
import { rawTask } from '@/test/fixtures';
import { daysLeftFor, daysLeftLabel, resetNowProvider, setNowProvider } from '@/utils/dates';

describe('M3: sprint days-left is computed on the device calendar from end_date', () => {
  beforeEach(() => setNowProvider(() => new Date(2026, 9, 10, 15)));
  afterEach(resetNowProvider);

  it('a sprint that ended 3 days ago reads "3d overdue", whatever the server clamped to', () => {
    expect(daysLeftFor('2026-10-07', 0)).toBe(-3);
    expect(daysLeftLabel(daysLeftFor('2026-10-07', 0) as number)).toEqual({ text: '3d overdue', tone: 'danger' });
  });

  it('ends today / future / near deadline tones', () => {
    expect(daysLeftLabel(daysLeftFor('2026-10-10', 5) as number)).toEqual({ text: 'Ends today', tone: 'warning' });
    expect(daysLeftLabel(daysLeftFor('2026-10-12') as number)).toEqual({ text: '2d left', tone: 'warning' });
    expect(daysLeftLabel(daysLeftFor('2026-10-30') as number)).toEqual({ text: '20d left', tone: 'info' });
  });

  it('falls back to the server number only when there is no usable end date', () => {
    expect(daysLeftFor(null, 4)).toBe(4);
    expect(daysLeftFor('garbage', 4)).toBe(4);
    expect(daysLeftFor(null, null)).toBeNull();
  });

  it('the day flips at local midnight (23:59 vs 00:01)', () => {
    setNowProvider(() => new Date(2026, 9, 10, 23, 59));
    expect(daysLeftFor('2026-10-10')).toBe(0);
    setNowProvider(() => new Date(2026, 9, 11, 0, 1));
    expect(daysLeftFor('2026-10-10')).toBe(-1);
  });
});

describe('L9: https is required outside development', () => {
  it('accepts https in every build', () => {
    expect(validateApiBaseUrl('https://tasktrackapi.example.com/api', false)).toBeNull();
    expect(validateApiBaseUrl('https://tasktrackapi.example.com/api', true)).toBeNull();
  });

  it('allows plain http only in development', () => {
    expect(validateApiBaseUrl('http://10.0.2.2:5000/api', true)).toBeNull();
    expect(validateApiBaseUrl('http://10.0.2.2:5000/api', false)).toMatch(/requires an https/);
  });

  it('explains a missing or malformed URL', () => {
    expect(validateApiBaseUrl('', true)).toMatch(/EXPO_PUBLIC_API_BASE_URL is not set/);
    expect(validateApiBaseUrl('ftp://x.y', true)).toMatch(/must start with https/);
    expect(validateApiBaseUrl('localhost:5000/api', false)).toMatch(/must start with https/);
  });

  it('attachments: http only in development builds', () => {
    expect(attachmentSchemes(true)).toEqual(['https', 'http']);
    expect(attachmentSchemes(false)).toEqual(['https']);
  });
});

describe('connectivity (NetInfo -> TanStack onlineManager)', () => {
  it('online = connected and not known-unreachable; unknown reachability counts as online', () => {
    expect(isOnlineState({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnlineState({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnlineState({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isOnlineState({ isConnected: false, isInternetReachable: false })).toBe(false);
    expect(isOnlineState({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('wireNetInfo forwards NetInfo changes to onlineManager', () => {
    let push: ((s: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void) | undefined;
    const add = jest.mocked(NetInfo.addEventListener);
    add.mockImplementation(((cb: typeof push) => {
      push = cb;
      return jest.fn();
    }) as never);
    wireNetInfo();
    onlineManager.setOnline(true); // (re)subscribes through the listener we just installed
    push?.({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    push?.({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    onlineManager.setOnline(true);
  });
});

describe('M5: per-task rollback (concurrent moves)', () => {
  const makeClient = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const rows = parseTasks([
      rawTask({ id: 1, status: 'IN_PROGRESS' }),
      rawTask({ id: 2, status: 'IN_PROGRESS' }),
      rawTask({ id: 3, status: 'NOT_STARTED' }),
    ]);
    qc.setQueryData(keys.tasks({}), rows);
    qc.setQueryData(keys.tasks({ projectId: 3 }), rows);
    qc.setQueryData(keys.task(1), parseTaskDetail({ ...rawTask({ id: 1, status: 'IN_PROGRESS' }) }) as TaskDetail);
    return qc;
  };
  const status = (qc: QueryClient, id: number, f: Parameters<typeof keys.tasks>[0] = {}) =>
    qc.getQueryData<Task[]>(keys.tasks(f))?.find((t) => t.id === id)?.status;

  it('A fails while B succeeds: only A is reverted, B keeps its new status', async () => {
    const qc = makeClient();
    const rollbackA = await applyOptimisticStatus(qc, 1, 'DEV_DONE');
    await applyOptimisticStatus(qc, 2, 'DEV_DONE'); // B: succeeds, never rolled back
    expect(status(qc, 1)).toBe('DEV_DONE');
    expect(status(qc, 2)).toBe('DEV_DONE');

    rollbackA(); // A's request failed
    expect(status(qc, 1)).toBe('IN_PROGRESS');
    expect(status(qc, 1, { projectId: 3 })).toBe('IN_PROGRESS'); // every cached list
    expect(qc.getQueryData<TaskDetail>(keys.task(1))?.status).toBe('IN_PROGRESS');
    expect(status(qc, 2)).toBe('DEV_DONE'); // B untouched
    expect(status(qc, 3)).toBe('NOT_STARTED');
  });

  it('B fails while A succeeds (reverse order of completion)', async () => {
    const qc = makeClient();
    await applyOptimisticStatus(qc, 1, 'DEV_DONE');
    const rollbackB = await applyOptimisticStatus(qc, 2, 'DEV_DONE');
    rollbackB();
    expect(status(qc, 2)).toBe('IN_PROGRESS');
    expect(status(qc, 1)).toBe('DEV_DONE');
  });

  it('does not clobber a newer value: if the task moved again meanwhile, rollback leaves it alone', async () => {
    const qc = makeClient();
    const rollback = await applyOptimisticStatus(qc, 1, 'DEV_DONE');
    await applyOptimisticStatus(qc, 1, 'READY_FOR_QA'); // a second, later move on the same task
    rollback();
    expect(status(qc, 1)).toBe('READY_FOR_QA');
  });

  it('cancels an in-flight list refetch so a stale response cannot overwrite the optimistic value', async () => {
    const qc = makeClient();
    const oldList = qc.getQueryData<Task[]>(keys.tasks({})) as Task[];
    let resolveSlow!: (v: Task[]) => void;
    const inFlight = qc
      .fetchQuery({ queryKey: keys.tasks({}), queryFn: () => new Promise<Task[]>((r) => { resolveSlow = r; }), staleTime: 0 })
      .catch(() => undefined);
    await applyOptimisticStatus(qc, 1, 'DEV_DONE');
    resolveSlow(oldList); // the stale server snapshot arrives late
    await inFlight;
    expect(status(qc, 1)).toBe('DEV_DONE');
  });

  it('works when the task is in only some caches, and when nothing is cached', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    qc.setQueryData(keys.tasks({}), parseTasks([rawTask({ id: 9, status: 'NOT_STARTED' })]));
    const rollback = await applyOptimisticStatus(qc, 1, 'DEV_DONE'); // task 1 not cached anywhere
    expect(() => rollback()).not.toThrow();
    expect(status(qc, 9)).toBe('NOT_STARTED');
  });
});

describe('M7: optional EXPO_PUBLIC_HEALTH_URL override', () => {
  const api = 'https://host.example.com/tasktracking/api';
  it('is derived from the API origin when no override is set', () => {
    expect(healthUrl(api, '')).toBe('https://host.example.com/health');
  });
  it('a valid https override wins (reverse-proxy path prefix)', () => {
    expect(healthUrl(api, 'https://host.example.com/tasktracking/health', false)).toBe('https://host.example.com/tasktracking/health');
  });
  it('http is accepted only in development; an invalid override is ignored, never trusted', () => {
    expect(validateHealthUrl('http://10.0.2.2:5000/health', true)).toBeNull();
    expect(validateHealthUrl('http://10.0.2.2:5000/health', false)).toMatch(/https/);
    expect(validateHealthUrl('ftp://x/health', true)).toMatch(/http\(s\)/);
    expect(validateHealthUrl('', false)).toBeNull();
    expect(healthUrl(api, 'http://evil.example/health', false)).toBe('https://host.example.com/health');
    expect(healthUrl(api, 'not a url', true)).toBe('https://host.example.com/health');
    expect(healthUrl(api, 'http://10.0.2.2:5000/health', true)).toBe('http://10.0.2.2:5000/health');
  });
});
