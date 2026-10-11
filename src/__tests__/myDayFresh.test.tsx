import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, BackHandler, type AlertButton } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import { AppError } from '@/api/errors';
import { FOCUS_STALE_MS, MyDayScreen, isStaleForFocus } from '@/features/myday/MyDayScreen';
import { buildForm, mergeServerIntoForm, toSaveBody } from '@/features/myday/dayForm';
import { useAuthStore } from '@/store/authStore';
import { useDirtyGuard } from '@/store/uiStores';
import { sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider } from '@/utils/dates';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
  useNavigation: () => mockNavigation,
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('react');
    R.useEffect(cb, [cb]);
  },
}));
jest.mock('@/api/dailyReportApi', () => ({
  ...jest.requireActual('@/api/dailyReportApi'),
  getDailyReport: jest.fn(),
  saveDailyReport: jest.fn(),
  submitDailyReport: jest.fn(),
  getUnreviewedEntries: jest.fn(),
  reviewEntry: jest.fn(),
}));

const api = dailyApi as jest.Mocked<typeof dailyApi>;

const A = { id: 1, task_id: 5, task_title: 'Fix login', project_id: 2, project_name: 'Alpha', auto_minutes: 60, minutes: 60, session_count: 1 };
const B = { id: 2, task_id: 6, task_title: 'Write docs', project_id: 3, project_name: 'Beta', auto_minutes: 90, minutes: 120, session_count: 2 };
const raw = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-10', timezone: 'Asia/Kolkata', status: 'draft', exists: true,
  summary: '', blockers: '', tomorrow_plan: '', items: [A, B], totalMinutes: 180, trackedMinutes: 150, needsReview: 0,
  ...over,
});
const day = (over: Record<string, unknown> = {}) => dailyApi.parseDailyReport(raw(over)) as dailyApi.DailyReport;

let alertSpy: jest.SpyInstance;
const lastAlert = () => {
  const c = alertSpy.mock.calls.at(-1) as [string, string, AlertButton[]];
  return { title: c[0], message: c[1], buttons: c[2] };
};
const press = async (text: string) => {
  await act(async () => {
    lastAlert().buttons.find((b) => b.text === text)?.onPress?.();
  });
};
const render = () => renderWithProviders(<MyDayScreen />);
const disabled = (name: string) => screen.getByRole('button', { name }).props.accessibilityState.disabled;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useDirtyGuard.setState({ dirty: false, discardSignal: 0 });
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser() });
  api.getDailyReport.mockImplementation(async (date?: string) => day(date ? { date } : {}));
  api.getUnreviewedEntries.mockResolvedValue([]);
  api.saveDailyReport.mockImplementation(async (b) => dailyApi.parseDailyReport({ ...raw(), date: b.date }));
});
afterEach(() => {
  alertSpy.mockRestore();
  resetNowProvider();
  jest.useRealTimers();
});

describe('M3-01: a cached day never overwrites newer tracked time', () => {
  it('mergeServerIntoForm: unedited lines take server values, edited lines keep the user\'s', () => {
    const base = buildForm(day());
    const mine = { ...base, items: base.items.map((i) => (i.key === 'task:5' ? { ...i, minutes: 70, note: 'mine' } : i)) };
    const fresh = day({ items: [{ ...A, minutes: 90, auto_minutes: 90 }, { ...B, minutes: 150, auto_minutes: 120 }] });
    const merged = mergeServerIntoForm(fresh, mine, base);
    expect(merged.form.items.find((i) => i.key === 'task:5')).toMatchObject({ minutes: 70, note: 'mine' }); // edited: kept
    expect(merged.form.items.find((i) => i.key === 'task:6')?.minutes).toBe(150); // untouched: server
    expect(merged.changed).toBe(true);
  });

  it('new server lines appear, vanished unedited lines go, vanished EDITED lines are reported (L1)', () => {
    const base = buildForm(day());
    const mine = { ...base, items: base.items.map((i) => (i.key === 'task:6' ? { ...i, minutes: 5 } : i)) };
    const fresh = day({ items: [{ ...A }, { id: 3, task_id: 7, task_title: 'New work', project_id: 2, minutes: 20, auto_minutes: 20 }] });
    const m = mergeServerIntoForm(fresh, mine, base);
    expect(m.form.items.map((i) => i.key).sort()).toEqual(['task:5', 'task:7']);
    expect(m.dropped.map((d) => d.key)).toEqual(['task:6']); // surfaced, not silently kept
    // The form and the PUT body agree: every form line is in the body.
    const body = toSaveBody(fresh, m.form);
    for (const i of m.form.items) expect(body.items.some((b) => b.task_id === Number(i.key.split(':')[1]))).toBe(true);
    const m2 = mergeServerIntoForm(fresh, base, base);
    expect(m2.form.items.map((i) => i.key).sort()).toEqual(['task:5', 'task:7']);
    expect(m2.dropped).toEqual([]); // unedited and gone: nothing to tell the user
  });

  it('text fields: typed text wins, untouched text follows the server', () => {
    const base = buildForm(day({ summary: 'old', blockers: 'b' }));
    const mine = { ...base, summary: 'typed' };
    const m = mergeServerIntoForm(day({ summary: 'server sum', blockers: 'server blockers' }), mine, base);
    expect(m.form.summary).toBe('typed');
    expect(m.form.blockers).toBe('server blockers');
  });

  it('Save refetches the day first and writes the SERVER minutes for lines the user did not touch', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'my summary');
    // Meanwhile the timer logged more time on task 5.
    api.getDailyReport.mockImplementation(async () => day({ items: [{ ...A, minutes: 90, auto_minutes: 90 }, B] }));
    api.getDailyReport.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalledTimes(1));
    expect(api.getDailyReport).toHaveBeenCalled(); // a fresh GET happened BEFORE the PUT
    const body = api.saveDailyReport.mock.calls[0]![0];
    expect(body.items.find((i) => i.task_id === 5)).toMatchObject({ minutes: 90, auto_minutes: 90 });
    expect(body.summary).toBe('my summary');
    expect(await screen.findByTestId('merge-note')).toHaveTextContent(/updated with newer tracked time/);
  });

  it('the user\'s own minutes edit survives the fresh read', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Minutes for Fix login'), '10'); // 70 min
    api.getDailyReport.mockImplementation(async () => day({ items: [{ ...A, minutes: 90, auto_minutes: 90 }, { ...B, minutes: 130, auto_minutes: 100 }] }));
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalledTimes(1));
    const items = api.saveDailyReport.mock.calls[0]![0].items;
    expect(items.find((i) => i.task_id === 5)).toMatchObject({ minutes: 70, auto_minutes: 90 }); // user value, fresh auto
    expect(items.find((i) => i.task_id === 6)).toMatchObject({ minutes: 130 }); // untouched: server
  });

  it('M2: inputs are locked from the START of the fresh GET, so typing during it cannot be lost', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'before');
    let release: (d: dailyApi.DailyReport) => void = () => undefined;
    api.getDailyReport.mockImplementation(() => new Promise<dailyApi.DailyReport>((r) => { release = r; }));
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(screen.getByLabelText('Summary').props.editable).toBe(false));
    expect(screen.getByLabelText('Minutes for Fix login').props.editable).toBe(false);
    expect(api.saveDailyReport).not.toHaveBeenCalled();
    await act(async () => release(day()));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalledTimes(1));
    expect(api.saveDailyReport.mock.calls[0]![0].summary).toBe('before');
    await waitFor(() => expect(screen.getByLabelText('Summary').props.editable).toBe(true)); // unlocked again
  });

  it('M2: a failed fresh GET unlocks the inputs again and writes nothing', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'x');
    api.getDailyReport.mockRejectedValue(new AppError({ kind: 'network', message: 'offline' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByTestId('day-error')).toBeTruthy();
    expect(screen.getByLabelText('Summary').props.editable).toBe(true);
    expect(api.saveDailyReport).not.toHaveBeenCalled();
  });

  it('L1: an edited line that vanished on the server is told to the user and not sent', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Minutes for Write docs'), '5');
    api.getDailyReport.mockImplementation(async () => day({ items: [A] }));
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalledTimes(1));
    expect(api.saveDailyReport.mock.calls[0]![0].items.map((i) => i.task_id)).toEqual([5]);
    expect(await screen.findByTestId('dropped-note')).toHaveTextContent(/Write docs is no longer on this day/);
  });

  it('Submit also starts from a fresh read', async () => {
    api.submitDailyReport.mockResolvedValue({ report: day({ status: 'submitted' }), message: 'Day submitted. Nice work.' });
    render();
    await screen.findByTestId('day-date');
    api.getDailyReport.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Submit day' }));
    await press('Submit');
    await waitFor(() => expect(api.submitDailyReport).toHaveBeenCalledTimes(1));
    expect(api.getDailyReport).toHaveBeenCalled();
  });

  it('if the fresh read fails nothing is written and the draft is kept', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'keep me');
    api.getDailyReport.mockRejectedValue(new AppError({ kind: 'network', message: "Can't reach the server." }));
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByTestId('day-error')).toHaveTextContent(/Can't reach the server/);
    expect(api.saveDailyReport).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Summary').props.value).toBe('keep me');
  });

  it('a background refetch while editing updates untouched lines and keeps the edits', async () => {
    const { queryClient } = render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'typing');
    api.getDailyReport.mockImplementation(async () => day({ items: [{ ...A, minutes: 90, auto_minutes: 90 }, B] }));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['daily-report'] });
    });
    expect(screen.getByLabelText('Summary').props.value).toBe('typing');
    await waitFor(() => expect(screen.getByLabelText('Minutes for Fix login').props.value).toBe('30')); // 1h 30m from the server
    expect(await screen.findByTestId('merge-note')).toBeTruthy();
  });

  it('focus refetch only for a day older than 30 seconds', () => {
    expect(FOCUS_STALE_MS).toBe(30_000);
    expect(isStaleForFocus(1000, 1000 + 29_000)).toBe(false);
    expect(isStaleForFocus(1000, 1000 + 31_000)).toBe(true);
    expect(isStaleForFocus(0, 999_999)).toBe(false); // never fetched: nothing to refresh
  });
});

describe('M3-04: midnight while a draft is open', () => {
  const setup = async () => {
    let rolled = false;
    api.getDailyReport.mockImplementation(async (date?: string) => {
      if (date) return day({ date });
      return day({ date: rolled ? '2026-10-11' : '2026-10-10' });
    });
    const r = render();
    await screen.findByText('Sat, 10 Oct 2026');
    return { ...r, roll: () => { rolled = true; } };
  };

  it('keeps the draft bound to ITS date, shows a banner, and enables Today', async () => {
    const { queryClient, roll } = await setup();
    fireEvent.changeText(screen.getByLabelText('Summary'), 'my draft');
    expect(disabled('Today')).toBe(true);
    roll();
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['daily-report', 'today'] });
    });
    expect(await screen.findByTestId('rolled-banner')).toHaveTextContent(/A new day started\. Your draft is for Sat, 10 Oct 2026\. Save it, then go to today\./);
    expect(screen.getByText('Sat, 10 Oct 2026')).toBeTruthy(); // not swapped to the 11th
    expect(screen.getByLabelText('Summary').props.value).toBe('my draft');
    expect(disabled('Today')).toBe(false);
    expect(disabled('Next day')).toBe(false);
  });

  it('saving writes to the draft\'s date; then Today shows the new day', async () => {
    const { queryClient, roll } = await setup();
    fireEvent.changeText(screen.getByLabelText('Summary'), 'my draft');
    roll();
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['daily-report', 'today'] });
    });
    await screen.findByTestId('rolled-banner');
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalledTimes(1));
    expect(api.saveDailyReport.mock.calls[0]![0].date).toBe('2026-10-10');

    await waitFor(() => expect(disabled('Save draft')).toBe(true)); // clean again
    fireEvent.press(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByText('Sun, 11 Oct 2026')).toBeTruthy();
    expect(screen.queryByTestId('rolled-banner')).toBeNull();
  });

  it('without edits the screen simply moves to the new day', async () => {
    const { queryClient, roll } = await setup();
    roll();
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['daily-report', 'today'] });
    });
    expect(await screen.findByText('Sun, 11 Oct 2026')).toBeTruthy();
    expect(screen.queryByTestId('rolled-banner')).toBeNull();
  });

  it('the device midnight tick re-asks the server what today is', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 10, 23, 59, 40), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    render();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    const before = api.getDailyReport.mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(api.getDailyReport.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('M3-05: Android back while dirty', () => {
  let handler: (() => boolean) | undefined;
  let exit: jest.SpyInstance;
  beforeEach(() => {
    handler = undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_n: string, h: () => boolean) => {
      handler = h;
      return { remove: jest.fn() };
    }) as never);
    exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    mockNavigation.canGoBack.mockReturnValue(true);
  });
  afterEach(() => {
    jest.mocked(BackHandler.addEventListener).mockImplementation((() => ({ remove: jest.fn() })) as never);
    exit.mockRestore();
  });

  it('a clean day lets back through untouched', async () => {
    render();
    await screen.findByTestId('day-date');
    expect(handler?.()).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('dirty: asks first; Keep editing swallows back and keeps the draft', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'draft');
    expect(handler?.()).toBe(true);
    expect(lastAlert().title).toBe('Discard changes?');
    await press('Keep editing');
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Summary').props.value).toBe('draft');
  });

  it('Discard resets the form AND then lets back proceed (goBack)', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'draft');
    handler?.();
    await press('Discard');
    expect(screen.getByLabelText('Summary').props.value).toBe('');
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    expect(useDirtyGuard.getState().dirty).toBe(false);
  });

  it('with nothing to go back to, Discard exits the app instead of swallowing back', async () => {
    mockNavigation.canGoBack.mockReturnValue(false);
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'draft');
    handler?.();
    await press('Discard');
    expect(exit).toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });
});

describe('M3-06: a write can not race a date change', () => {
  it('navigation is disabled while a save is in flight and re-enabled after; the new day is untouched', async () => {
    let finish!: (v: dailyApi.DailyReport | null) => void;
    api.saveDailyReport.mockImplementation(() => new Promise((r) => { finish = r; }));
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'x');
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalled());
    expect(disabled('Previous day')).toBe(true);
    expect(disabled('Today')).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(api.getDailyReport).not.toHaveBeenCalledWith('2026-10-09');
    await act(async () => finish(day()));
    await waitFor(() => expect(disabled('Previous day')).toBe(false));
  });
});

describe('M3-07: invalid minutes block Save and Submit', () => {
  it('shows the error, blocks both actions, and unblocks when fixed', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'x'); // dirty, so Save would otherwise be enabled
    expect(disabled('Save draft')).toBe(false);

    fireEvent.changeText(screen.getByLabelText('Minutes for Fix login'), '75');
    expect(await screen.findByTestId('editor-errors')).toHaveTextContent('Fix the highlighted times before saving or submitting.');
    expect(screen.getByTestId('minutes-error')).toHaveTextContent('Minutes must be between 0 and 59.');
    expect(disabled('Save draft')).toBe(true);
    expect(disabled('Submit day')).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Submit day' }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(api.saveDailyReport).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Minutes for Fix login'), '30');
    await waitFor(() => expect(screen.queryByTestId('editor-errors')).toBeNull());
    expect(disabled('Save draft')).toBe(false);
    expect(disabled('Submit day')).toBe(false);
  });
});

describe('M3-08: lines without a task id are preserved', () => {
  const MANUAL = { id: 9, task_id: null, task_title: 'Stand-up', project_id: 2, project_name: 'Alpha', project_color: '#3366ff', auto_minutes: 0, minutes: 30, note: 'daily', source: 'manual', custom_field: 'keep me' };

  it('shows them read-only, counts them, and PUTs them back VERBATIM with unparsed entries', async () => {
    api.getDailyReport.mockImplementation(async () => day({ items: [A, MANUAL, null, 'weird'], unused: 1 }));
    render();
    expect(await screen.findByText('Stand-up')).toBeTruthy();
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.queryByLabelText('Hours for Stand-up')).toBeNull(); // no editor
    expect(screen.getByTestId('day-totals')).toHaveTextContent(/^Total 1h 30m/); // 60 + 30

    fireEvent.changeText(screen.getByLabelText('Summary'), 'x');
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalledTimes(1));
    const items = api.saveDailyReport.mock.calls[0]![0].items;
    expect(items).toHaveLength(4); // nothing dropped: PUT replaces EVERY line
    expect(items).toContainEqual(MANUAL); // the server's own object, unchanged (custom_field included)
    expect(items).toContain(null);
    expect(items).toContain('weird');
    expect(items.find((i) => i && (i as { task_id: unknown }).task_id === 5)).toMatchObject({ minutes: 60 });
  });

  it('parsing: key stays stable across a replace-all PUT (task based, not id based)', () => {
    const a = dailyApi.parseDailyReport(raw({ items: [{ ...A, id: 1 }] })) as dailyApi.DailyReport;
    const b = dailyApi.parseDailyReport(raw({ items: [{ ...A, id: 99 }] })) as dailyApi.DailyReport;
    expect(a.items[0]!.key).toBe(b.items[0]!.key);
  });
});
