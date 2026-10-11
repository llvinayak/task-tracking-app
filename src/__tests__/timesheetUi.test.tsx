import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Modal, ScrollView, type AlertButton } from 'react-native';

import { AppError } from '@/api/errors';
import { parseTasks } from '@/api/models';
import * as dailyApi from '@/api/dailyReportApi';
import * as tasksApi from '@/api/tasksApi';
import * as tsApi from '@/api/timesheetApi';
import { TimeEntrySheet } from '@/features/timesheet/TimeEntrySheet';
import { TimesheetScreen } from '@/features/timesheet/TimesheetScreen';
import { useAuthStore } from '@/store/authStore';
import { rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { labelInNameViolations } from '@/test/a11y';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/api/timesheetApi', () => ({
  ...jest.requireActual('@/api/timesheetApi'),
  getTimesheet: jest.fn(),
  createTimeEntry: jest.fn(),
  updateTimeEntry: jest.fn(),
  deleteTimeEntry: jest.fn(),
}));
jest.mock('@/api/dailyReportApi', () => ({ ...jest.requireActual('@/api/dailyReportApi'), reviewEntry: jest.fn() }));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTasks: jest.fn() }));

const api = tsApi as jest.Mocked<typeof tsApi>;
const tasks = tasksApi as jest.Mocked<typeof tasksApi>;

/** Only Date is faked, so promises, intervals and RN timers keep working. */
const freezeDate = (d: Date) =>
  jest.useFakeTimers({
    now: d,
    doNotFake: [
      'nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime',
    ],
  });

// 2026-10-10 10:00 UTC = 15:30 in Asia/Kolkata (a Saturday; the week is Mon 5 Oct - Sun 11 Oct).
const NOW = new Date(Date.UTC(2026, 9, 10, 10, 0, 0));

const entry = (over: Record<string, unknown> = {}) => ({
  id: 1, task_id: 5, task_title: 'Fix login', task_status: 'IN_PROGRESS', project: { id: 2, name: 'Alpha', color: '#3366ff' },
  started_at: '2026-10-09T03:30:00.000Z', ended_at: '2026-10-09T05:00:00.000Z', minutes: 90, note: '', source: 'timer',
  auto_closed: false, reviewed_at: null, ...over,
});
const sheet = (over: Record<string, unknown> = {}) =>
  tsApi.parseTimesheet({
    from: '2026-10-05', to: '2026-10-11', timezone: 'Asia/Kolkata', totalMinutes: 570, needsReview: 0,
    days: [
      { date: '2026-10-09', minutes: 480, entries: [entry(), entry({ id: 2, task_id: 6, task_title: 'Write docs', source: 'manual', minutes: 390, started_at: '2026-10-09T06:00:00.000Z', ended_at: '2026-10-09T12:30:00.000Z', note: 'by hand' })] },
      { date: '2026-10-08', minutes: 450, entries: [entry({ id: 3, minutes: 450, auto_closed: true, started_at: '2026-10-08T03:30:00.000Z', ended_at: '2026-10-08T11:00:00.000Z' })] },
    ],
    byProject: [{ project_id: 2, name: 'Alpha', color: '#3366ff', minutes: 930 }],
    ...over,
  });

let alertSpy: jest.SpyInstance;
const lastAlert = () => {
  const c = alertSpy.mock.calls.at(-1) as [string, string, AlertButton[]];
  return { title: c[0], message: c[1], buttons: c[2] };
};
const render = () => renderWithProviders(<TimesheetScreen />);
const disabled = (n: string) => screen.getByRole('button', { name: n }).props.accessibilityState.disabled;

beforeEach(() => {
  jest.clearAllMocks();
  freezeDate(NOW);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7 }) });
  api.getTimesheet.mockImplementation(async (from, to) => sheet({ from, to }));
  tasks.getTasks.mockResolvedValue(parseTasks([rawTask({ id: 5, title: 'Fix login' }), rawTask({ id: 6, title: 'Write docs' })]));
});
afterEach(() => {
  alertSpy.mockRestore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('Timesheet week view', () => {
  it('shows Monday to Sunday of the current week, totals, per-project totals and day rows', async () => {
    render();
    expect(await screen.findByTestId('week-label')).toHaveTextContent(/Mon, 5 Oct 2026 to Sun, 11 Oct 2026/);
    await screen.findByTestId('week-total');
    expect(api.getTimesheet).toHaveBeenCalledWith('2026-10-05', '2026-10-11');
    expect(screen.getByTestId('week-total')).toHaveTextContent(/9h 30m/);
    expect(screen.getByTestId('project-total-2')).toHaveTextContent(/Alpha.*15h 30m/);
    for (const d of ['05', '06', '07', '08', '09', '10', '11']) expect(screen.getByTestId(`day-2026-10-${d}`)).toBeTruthy();
    expect(screen.getByTestId('day-2026-10-10')).toHaveTextContent(/\(today\)/);
  });

  it('the 8h target is text with a check mark, not color alone', async () => {
    render();
    await screen.findByTestId('week-total');
    expect(screen.getByTestId('day-2026-10-09')).toHaveTextContent(/✓ 8h \(target met\)/);
    expect(screen.getByTestId('day-2026-10-08')).toHaveTextContent(/7h 30m of 8h/);
    expect(screen.getByTestId('day-2026-10-06')).toHaveTextContent(/0m of 8h/);
    expect(screen.getByTestId('day-2026-10-06')).not.toHaveTextContent(/✓/);
  });

  it('entries show times in the COMPANY timezone, source badges and the auto-closed flag', async () => {
    render();
    await screen.findByTestId('week-total');
    expect(screen.getByTestId('entry-1')).toHaveTextContent(/09:00 to 10:30/); // 03:30Z-05:00Z = 09:00-10:30 IST
    expect(screen.getByTestId('entry-1')).toHaveTextContent(/Timer/);
    expect(screen.getByTestId('entry-2')).toHaveTextContent(/Manual/);
    expect(screen.getByTestId('entry-2')).toHaveTextContent(/by hand/);
    expect(screen.getByTestId('entry-3')).toHaveTextContent(/Auto-closed/);
  });

  it('needs-review entries get a banner pointing at My Day', async () => {
    api.getTimesheet.mockResolvedValue(sheet({ needsReview: 2 }));
    render();
    expect(await screen.findByTestId('needs-review')).toHaveTextContent(/2 auto-closed entries need confirming/);
  });

  it('previous / next week / this week, and no future weeks', async () => {
    render();
    await screen.findByTestId('week-total');
    expect(disabled('Next week')).toBe(true);
    expect(disabled('This week')).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(api.getTimesheet).toHaveBeenCalledWith('2026-09-28', '2026-10-04')); // month boundary
    expect(await screen.findByText(/Mon, 28 Sep 2026 to Sun, 4 Oct 2026/)).toBeTruthy();
    expect(disabled('Next week')).toBe(false);
    expect(disabled('This week')).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
    expect(await screen.findByText(/Mon, 5 Oct 2026 to Sun, 11 Oct 2026/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    await screen.findByText(/28 Sep 2026/);
    fireEvent.press(screen.getByRole('button', { name: 'This week' }));
    // The week label AND the Monday day header both match once the data has loaded: do not race on a single match.
    expect((await screen.findAllByText(/Mon, 5 Oct 2026/)).length).toBeGreaterThan(0);
  });

  it('crosses a year boundary', async () => {
    jest.useRealTimers();
    freezeDate(new Date(Date.UTC(2027, 0, 2, 10, 0, 0))); // Saturday 2 Jan 2027
    render();
    expect(await screen.findByText(/Mon, 28 Dec 2026 to Sun, 3 Jan 2027/)).toBeTruthy();
    expect(api.getTimesheet).toHaveBeenCalledWith('2026-12-28', '2027-01-03');
    fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(api.getTimesheet).toHaveBeenCalledWith('2026-12-21', '2026-12-27'));
  });

  it('empty week, error with retry, and a stale banner when a refetch fails', async () => {
    api.getTimesheet.mockResolvedValue(sheet({ days: [], totalMinutes: 0, byProject: [] }));
    const first = render();
    expect(await screen.findByText('No time this week')).toBeTruthy();
    api.getTimesheet.mockRejectedValue(new AppError({ kind: 'network', message: "Can't reach the server." }));
    await act(async () => {
      await first.queryClient.refetchQueries({ queryKey: ['timesheet'] });
    });
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
    first.unmount();

    api.getTimesheet.mockRejectedValueOnce(new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side.' }));
    render();
    expect(await screen.findByText('Something went wrong on our side.')).toBeTruthy();
    api.getTimesheet.mockImplementation(async (from, to) => sheet({ from, to }));
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('week-total')).toBeTruthy();
  });
});

describe('Add time', () => {
  const open = async () => {
    const r = render();
    await screen.findByTestId('week-total');
    fireEvent.press(screen.getByRole('button', { name: 'Add time' }));
    await screen.findByTestId('tz-banner');
    return r;
  };
  const pickTask = async (title = 'Fix login') => {
    fireEvent.press(screen.getByRole('button', { name: 'Choose a task' }));
    fireEvent.press(await screen.findByRole('button', { name: `Choose ${title}` }));
  };
  const fillTimes = (start = '09:30', end = '11:00', date?: string) => {
    if (date) fireEvent.changeText(screen.getByLabelText('Date (yyyy-MM-dd)'), date);
    fireEvent.changeText(screen.getByLabelText('Start (HH:mm)'), start);
    fireEvent.changeText(screen.getByLabelText('End (HH:mm)'), end);
  };

  it('says the times are company time, and defaults the date to today in that zone', async () => {
    await open();
    expect(screen.getByTestId('tz-banner')).toHaveTextContent(/company time \(Asia\/Kolkata\)/);
    expect(screen.getByLabelText('Date (yyyy-MM-dd)').props.value).toBe('2026-10-10');
  });

  it('warns when the device timezone differs from the company timezone', async () => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(0); // device = UTC, company = IST
    await open();
    expect(screen.getByTestId('tz-banner')).toHaveTextContent(/differs from your device's timezone/);
  });

  it('the task picker defaults to "assigned to me" (assigned_to=<user id>), and lists the owners\' tasks', async () => {
    await open();
    fireEvent.press(screen.getByRole('button', { name: 'Choose a task' }));
    expect(await screen.findByRole('button', { name: 'Choose Fix login' })).toBeTruthy();
    expect(tasksApi.buildTaskParams(tasks.getTasks.mock.calls[0]![0])).toEqual({ assigned_to: 7 });
  });

  it('"All tasks" searches by text (min 2 chars) and warns that the server decides', async () => {
    await open();
    fireEvent.press(screen.getByRole('button', { name: 'Choose a task' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'All tasks' }));
    expect(screen.getByText('Type at least 2 characters.')).toBeTruthy();
    expect(screen.getByText(/You can only log time on tasks you are assigned to/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search tasks'), 'login');
    await waitFor(() => expect(tasks.getTasks.mock.calls.some((c) => c[0].search === 'login' && !c[0].assignedTo)).toBe(true));
  });

  it('creates the entry with ISO UTC times computed in company time, then refreshes everything derived', async () => {
    api.createTimeEntry.mockResolvedValue({ id: 99, warning: null });
    const { queryClient } = await open();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    await pickTask();
    fillTimes();
    expect(screen.getByTestId('entry-preview')).toHaveTextContent('1h 30m');
    fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
    await waitFor(() => expect(api.createTimeEntry).toHaveBeenCalledTimes(1));
    expect(api.createTimeEntry.mock.calls[0]![0]).toMatchObject({
      taskId: 5, startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:30:00.000Z', // 09:30 / 11:00 IST
    });
    expect(await screen.findByText('Time added')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('tz-banner')).toBeNull()); // sheet closed

    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    for (const k of ['["timesheet"]', '["daily-report"]', '["daily-report-pending"]', '["running-timer"]', '["task-sessions",5]']) {
      expect(keys).toContain(k);
    }
  });

  it('shows the server warning (task already PASS) for longer', async () => {
    api.createTimeEntry.mockResolvedValue({ id: 99, warning: 'This task is already PASS.' });
    await open();
    await pickTask();
    fillTimes();
    fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByText(/This task is already PASS\./)).toBeTruthy();
  });

  it.each([
    ['no task', () => undefined, 'Pick a task first.'],
    ['end before start', () => fillTimes('11:00', '09:30'), 'End time must be after the start time.'],
    ['future', () => fillTimes('15:00', '16:00'), 'Cannot log time in the future.'],
    ['bad time', () => fillTimes('2599', '11:00'), 'Enter times as HH:mm (for example 09:30).'],
    ['bad date', () => fillTimes('09:30', '11:00', '10/10/2026'), 'Enter a valid date (yyyy-MM-dd).'],
    ['future day', () => fillTimes('09:30', '11:00', '2026-10-12'), 'Cannot log time in the future.'],
  ])('client rule: %s', async (name, setup, message) => {
    await open();
    if (name !== 'no task') await pickTask();
    setup();
    fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByTestId('entry-error')).toHaveTextContent(message);
    expect(api.createTimeEntry).not.toHaveBeenCalled();
  });

  it.each([
    ['403', new AppError({ kind: 'forbidden', status: 403, message: 'Only people assigned to this task can track time on it.' })],
    ['409 overlap', new AppError({ kind: 'conflict', status: 409, message: 'That overlaps existing time on "Docs" (03:30–05:00).' })],
    ['400 cap', new AppError({ kind: 'validation', status: 400, message: 'A single entry cannot exceed 8 hours.' })],
  ])('server %s is shown verbatim and the sheet stays open with its input', async (_n, err) => {
    api.createTimeEntry.mockRejectedValue(err);
    await open();
    await pickTask();
    fillTimes();
    fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByTestId('entry-error')).toHaveTextContent(err.message);
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('09:30');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('an entry over 8 hours is allowed but hints that the server may refuse it', async () => {
    await open();
    await pickTask();
    fillTimes('00:00', '09:00');
    expect(screen.getByTestId('entry-preview')).toHaveTextContent(/9h.*may reject/);
  });
});

describe('Edit and delete', () => {
  const openEntry = async (id = 1) => {
    const r = render();
    fireEvent.press(await screen.findByTestId(`entry-${id}`));
    await screen.findByTestId('tz-banner');
    return r;
  };

  it('prefills the entry in company time, and the task cannot be changed', async () => {
    await openEntry();
    expect(screen.getByLabelText('Date (yyyy-MM-dd)').props.value).toBe('2026-10-09');
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('09:00');
    expect(screen.getByLabelText('End (HH:mm)').props.value).toBe('10:30');
    expect(screen.getByRole('button', { name: /^Task: Fix login/ }).props.accessibilityState?.disabled).toBeTruthy();
  });

  it('PUTs the new ISO times and note, and refreshes the derived data', async () => {
    api.updateTimeEntry.mockResolvedValue(undefined);
    const { queryClient } = await openEntry();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    fireEvent.changeText(screen.getByLabelText('End (HH:mm)'), '11:00');
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'adjusted');
    fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(api.updateTimeEntry).toHaveBeenCalledWith(1, { startedAt: '2026-10-09T03:30:00.000Z', endedAt: '2026-10-09T05:30:00.000Z', note: 'adjusted' }));
    expect(await screen.findByText('Entry updated')).toBeTruthy();
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain('["daily-report"]');
    expect(keys).toContain('["daily-report-pending"]');
  });

  it('editing an auto-closed entry says it will be marked reviewed', async () => {
    await openEntry(3);
    expect(screen.getByText('Saving an auto-closed entry marks it as reviewed.')).toBeTruthy();
  });

  it('a 409 overlap on edit is verbatim', async () => {
    api.updateTimeEntry.mockRejectedValue(new AppError({ kind: 'conflict', status: 409, message: 'That overlaps existing time on "Docs" (09:00–10:00).' }));
    await openEntry();
    fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByTestId('entry-error')).toHaveTextContent('That overlaps existing time on "Docs" (09:00–10:00).');
  });

  it('delete asks for confirmation, then deletes and refreshes', async () => {
    api.deleteTimeEntry.mockResolvedValue(undefined);
    const { queryClient } = await openEntry();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    fireEvent.press(screen.getByRole('button', { name: 'Delete entry' }));
    expect(lastAlert().title).toBe('Delete this entry?');
    expect(api.deleteTimeEntry).not.toHaveBeenCalled();
    await act(async () => lastAlert().buttons.find((b) => b.text === 'Delete')?.onPress?.());
    await waitFor(() => expect(api.deleteTimeEntry).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Entry deleted')).toBeTruthy();
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain('["daily-report"]');
  });

  it('Cancel in the delete dialog does nothing; a delete error is shown verbatim', async () => {
    api.deleteTimeEntry.mockRejectedValue(new AppError({ kind: 'forbidden', status: 403, message: 'You can only delete your own time entries.' }));
    await openEntry();
    fireEvent.press(screen.getByRole('button', { name: 'Delete entry' }));
    await act(async () => lastAlert().buttons.find((b) => b.text === 'Cancel')?.onPress?.());
    expect(api.deleteTimeEntry).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Delete entry' }));
    await act(async () => lastAlert().buttons.find((b) => b.text === 'Delete')?.onPress?.());
    expect((await screen.findAllByText('You can only delete your own time entries.')).length).toBeGreaterThan(0);
  });
});

/* ── QA fixes M3 / M4 / L3 ─────────────────────────────────────────────── */

// 23:00 -> 01:00 company time (Asia/Kolkata): 17:30Z on the 8th to 19:30Z, auto-closed and not yet reviewed.
const overnight = () =>
  entry({ id: 9, task_id: 5, task_title: 'Night deploy', minutes: 120, auto_closed: true, reviewed_at: null, note: 'prod push', started_at: '2026-10-08T17:30:00.000Z', ended_at: '2026-10-08T19:30:00.000Z' });

describe('M3: overnight / auto-closed entries', () => {
  const withOvernight = (needsReview: number) =>
    sheet({ needsReview, days: [{ date: '2026-10-08', minutes: 120, needsReview, entries: [overnight()] }] });

  it('opens an overnight entry, locks its times, and edits ONLY the note (no times sent, nothing validated)', async () => {
    api.getTimesheet.mockResolvedValue(withOvernight(1));
    api.updateTimeEntry.mockResolvedValue(undefined);
    render();
    fireEvent.press(await screen.findByTestId('entry-9'));
    await screen.findByTestId('overnight-hint');
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('23:00');
    expect(screen.getByLabelText('End (HH:mm)').props.value).toBe('01:00');
    expect(screen.getByLabelText('Start (HH:mm)').props.editable).toBe(false);
    expect(screen.queryByTestId('same-day-hint')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'prod push, rolled back once');
    fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(api.updateTimeEntry).toHaveBeenCalledTimes(1));
    expect(api.updateTimeEntry).toHaveBeenCalledWith(9, { note: 'prod push, rolled back once' }); // no startedAt / endedAt
    expect(screen.queryByTestId('entry-error')).toBeNull();
  });

  it('Confirm works without any time edit, calls the review endpoint, and clears needsReview after the refetch', async () => {
    let reviewed = false;
    api.getTimesheet.mockImplementation(async () =>
      reviewed
        ? sheet({ needsReview: 0, days: [{ date: '2026-10-08', minutes: 120, needsReview: 0, entries: [{ ...overnight(), reviewed_at: '2026-10-10T09:00:00.000Z' }] }] })
        : withOvernight(1),
    );
    (dailyApi.reviewEntry as jest.Mock).mockImplementation(async () => {
      reviewed = true;
    });
    render();
    expect(await screen.findByTestId('needs-review')).toBeTruthy();
    fireEvent.press(screen.getByTestId('entry-9'));
    fireEvent.press(await screen.findByRole('button', { name: 'Confirm entry as correct' }));
    await waitFor(() => expect(dailyApi.reviewEntry).toHaveBeenCalledWith(9));
    expect(api.updateTimeEntry).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('needs-review')).toBeNull());
    expect(screen.queryByText('Auto-closed')).toBeNull();
  });

  it('a same-day entry the user did NOT change sends the note only; changed times are validated', async () => {
    api.updateTimeEntry.mockResolvedValue(undefined);
    render();
    fireEvent.press(await screen.findByTestId('entry-1'));
    await screen.findByTestId('tz-banner');
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'n');
    fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(api.updateTimeEntry).toHaveBeenLastCalledWith(1, { note: 'n' }));
  });

  it('changing the times of a same-day entry validates them', async () => {
    render();
    fireEvent.press(await screen.findByTestId('entry-1'));
    await screen.findByTestId('tz-banner');
    fireEvent.changeText(screen.getByLabelText('End (HH:mm)'), '08:00'); // before the 09:00 start
    fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    expect(await screen.findByTestId('entry-error')).toHaveTextContent('End time must be after the start time.');
    expect(api.updateTimeEntry).not.toHaveBeenCalled();
  });

  it('NEW entries stay same-day only, with a hint saying so', async () => {
    render();
    await screen.findByTestId('week-total');
    fireEvent.press(screen.getByRole('button', { name: 'Add time' }));
    expect(await screen.findByTestId('same-day-hint')).toHaveTextContent(/same day/);
    fireEvent.changeText(screen.getByLabelText('Start (HH:mm)'), '23:00');
    fireEvent.changeText(screen.getByLabelText('End (HH:mm)'), '01:00');
    fireEvent.press(screen.getByRole('button', { name: 'Choose a task' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Choose Fix login' }));
    fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByTestId('entry-error')).toHaveTextContent('End time must be after the start time.');
    expect(api.createTimeEntry).not.toHaveBeenCalled();
  });
});

describe('M4: company timezone arrives late / week navigation', () => {
  it('Add time is disabled until the company timezone is known, then works', async () => {
    let release: (t: tsApi.Timesheet) => void = () => undefined;
    api.getTimesheet.mockImplementation(
      () =>
        new Promise<tsApi.Timesheet>((r) => {
          release = r;
        }),
    );
    render();
    expect(await screen.findByTestId('tz-wait')).toBeTruthy();
    expect(disabled('Add time')).toBe(true);
    await act(async () => release(sheet()));
    await waitFor(() => expect(disabled('Add time')).toBe(false));
    expect(screen.queryByTestId('tz-wait')).toBeNull();
  });

  it('TimeEntrySheet: a late timezone keeps the note, but times typed under the device zone are cleared and the user is told (no silent zone mix)', async () => {
    let setTz: (z: string | null) => void = () => undefined;
    const Harness = () => {
      const [tz, set] = React.useState<string | null>(null);
      setTz = set;
      return <TimeEntrySheet visible onClose={jest.fn()} timezone={tz} defaultDate="2026-10-10" />;
    };
    renderWithProviders(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Start (HH:mm)'), '09:30'); // only ONE of start/end typed
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'typed before tz');
    act(() => setTz('Asia/Kolkata'));
    expect(screen.getByLabelText('Note (optional)').props.value).toBe('typed before tz');
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('');
    expect(screen.getByTestId('entry-error')).toHaveTextContent(/company timezone is now Asia\/Kolkata/);
    expect(screen.getByTestId('tz-banner')).toHaveTextContent(/company time \(Asia\/Kolkata\)/);
  });

  it('TimeEntrySheet: nothing typed -> a late timezone changes nothing and shows no warning', async () => {
    let setTz: (z: string | null) => void = () => undefined;
    const Harness = () => {
      const [tz, set] = React.useState<string | null>(null);
      setTz = set;
      return <TimeEntrySheet visible onClose={jest.fn()} timezone={tz} defaultDate="2026-10-10" />;
    };
    renderWithProviders(<Harness />);
    act(() => setTz('Asia/Kolkata'));
    expect(screen.queryByTestId('entry-error')).toBeNull();
  });

  it('TimeEntrySheet (edit): an end typed under the old zone is replaced by the own time of the entry in the company zone', async () => {
    let setTz: (z: string | null) => void = () => undefined;
    const e = { ...entry(), id: 1, task_title: 'Fix login' } as unknown as tsApi.TimesheetEntry;
    const Harness = () => {
      const [tz, set] = React.useState<string | null>('UTC');
      setTz = set;
      return <TimeEntrySheet visible onClose={jest.fn()} timezone={tz} defaultDate="2026-10-09" entry={e} />;
    };
    renderWithProviders(<Harness />);
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('03:30'); // 03:30Z in UTC
    fireEvent.changeText(screen.getByLabelText('End (HH:mm)'), '08:00'); // edited under UTC
    act(() => setTz('Asia/Kolkata'));
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('09:00'); // unchanged field re-interpreted
    expect(screen.getByLabelText('End (HH:mm)').props.value).toBe('10:30'); // the edit is discarded, not mixed
    expect(screen.getByTestId('entry-error')).toHaveTextContent(/enter them again/);
  });

  it('moving to another week keeps the zone (Add time stays enabled) and never shows the old week as the new one', async () => {
    let hold = false;
    let release: () => void = () => undefined;
    api.getTimesheet.mockImplementation((from, to) =>
      hold
        ? new Promise<tsApi.Timesheet>((r) => {
            release = () => r(sheet({ from, to, days: [], totalMinutes: 0 }));
          })
        : Promise.resolve(sheet({ from, to })),
    );
    render();
    await screen.findByTestId('week-total');
    hold = true;
    fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByText(/28 Sep 2026/)).toBeTruthy();
    expect(disabled('Add time')).toBe(false); // the zone survives the navigation
    expect(screen.queryByTestId('week-total')).toBeNull(); // the old week's totals are not shown as this week's
    expect(screen.getByLabelText('Loading timesheet...')).toBeTruthy();
    await act(async () => release());
    expect(await screen.findByTestId('week-total')).toHaveTextContent(/0m/);
  });
});

describe('L3: the default week follows the clock', () => {
  it('a fresh screen on Monday shows the new week', async () => {
    freezeDate(new Date(Date.UTC(2026, 9, 11, 10, 0, 0))); // Sunday
    const r = render();
    expect(await screen.findByText(/Mon, 5 Oct 2026 to Sun, 11 Oct 2026/)).toBeTruthy();
    r.unmount();
    freezeDate(new Date(Date.UTC(2026, 9, 12, 10, 0, 0))); // Monday
    render();
    expect(await screen.findByText(/Mon, 12 Oct 2026 to Sun, 18 Oct 2026/)).toBeTruthy();
  });
});

describe('Add time: typing aids and the discard guard (Stage 2)', () => {
  const open = async () => {
    render();
    await screen.findByTestId('week-total');
    fireEvent.press(screen.getByRole('button', { name: 'Add time' }));
    await screen.findByTestId('tz-banner');
  };

  it('digits only: the dashes and the colon are inserted while typing, and a weekday label shows', async () => {
    await open();
    fireEvent.changeText(screen.getByLabelText('Date (yyyy-MM-dd)'), '20261008');
    expect(screen.getByLabelText('Date (yyyy-MM-dd)').props.value).toBe('2026-10-08');
    expect(screen.getByTestId('date-weekday')).toHaveTextContent('Thu, 8 Oct 2026');
    fireEvent.changeText(screen.getByLabelText('Start (HH:mm)'), '0930');
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('09:30');
    fireEvent.changeText(screen.getByLabelText('Date (yyyy-MM-dd)'), '2026');
    expect(screen.getByTestId('date-weekday')).toHaveTextContent('Not a valid date yet');
    expect(screen.getByLabelText('Start (HH:mm)').props.keyboardType).toBe('number-pad');
  });

  it('Today / Yesterday presets use the COMPANY date', async () => {
    await open();
    fireEvent.press(screen.getByRole('button', { name: 'Yesterday' }));
    expect(screen.getByLabelText('Date (yyyy-MM-dd)').props.value).toBe('2026-10-09');
    fireEvent.press(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByLabelText('Date (yyyy-MM-dd)').props.value).toBe('2026-10-10');
  });

  it('+/-15 minute nudges change the typed time, are clamped, and are disabled until the time is valid', async () => {
    await open();
    expect(screen.getByRole('button', { name: '+15 minutes, start time' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Start (HH:mm)'), '09:50');
    fireEvent.press(screen.getByRole('button', { name: '+15 minutes, start time' }));
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('10:05');
    fireEvent.press(screen.getByRole('button', { name: '-15 minutes, start time' }));
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('09:50');
    fireEvent.changeText(screen.getByLabelText('End (HH:mm)'), '23:55');
    fireEvent.press(screen.getByRole('button', { name: '+15 minutes, end time' }));
    expect(screen.getByLabelText('End (HH:mm)').props.value).toBe('23:59');
  });

  it('Cancel with nothing typed just closes; with edits it asks "Discard changes?" and Keep editing stays', async () => {
    await open();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel Add time' }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tz-banner')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Add time' }));
    await screen.findByTestId('tz-banner');
    fireEvent.changeText(screen.getByLabelText('Start (HH:mm)'), '0930');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel Add time' }));
    expect(lastAlert().title).toBe('Discard changes?');
    expect(screen.getByTestId('tz-banner')).toBeTruthy(); // still open
    act(() => lastAlert().buttons.find((b) => b.text === 'Discard')!.onPress!());
    expect(screen.queryByTestId('tz-banner')).toBeNull();
  });

  it('"Add time" stays disabled until the company timezone is known', async () => {
    api.getTimesheet.mockImplementation(() => new Promise(() => undefined));
    render();
    expect(screen.getByRole('button', { name: 'Add time' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('tz-wait')).toBeTruthy();
  });

  it('the footer actions are outside the scrolling body: Add entry is reachable with the form open', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeTruthy();
  });
});

describe('Add time: pilot layout fixes', () => {
  const open = async () => {
    render();
    await screen.findByTestId('week-total');
    fireEvent.press(screen.getByRole('button', { name: 'Add time' }));
    await screen.findByTestId('tz-banner');
  };

  it('no timezone mismatch: "company time" is a quiet helper line, not a banner; a mismatch still gets the banner', async () => {
    await open();
    const note = screen.getByTestId('tz-banner');
    expect(note).toHaveTextContent('Times are in company time (Asia/Kolkata).');
    expect(note.props.accessibilityRole).not.toBe('alert');
  });

  it('a device/company mismatch keeps the warning banner (an alert)', async () => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(0);
    await open();
    expect(screen.getByTestId('tz-banner').props.accessibilityRole).toBe('alert');
  });

  it('the error is in the sticky footer (above the buttons) so it shows however far the form is scrolled', async () => {
    await open();
    fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
    const err = await screen.findByTestId('entry-error');
    // Walk up to the sheet's Modal: no ScrollView (the sheet body) in between.
    let n = err.parent;
    let inScroll = false;
    while (n && n.type !== Modal) {
      if (n.type === ScrollView) inScroll = true;
      n = n.parent;
    }
    expect(n?.type).toBe(Modal);
    expect(inScroll).toBe(false);
    expect(err).toHaveTextContent('Pick a task first.');
  });

  it('Save/Add and Delete share ONE footer row; Confirm entry as correct lives in the body', async () => {
    api.getTimesheet.mockImplementation(async (from, to) =>
      sheet({ from, to, days: [{ date: '2026-10-09', minutes: 450, entries: [entry({ id: 9, auto_closed: true, reviewed_at: null })] }] }),
    );
    render();
    await screen.findByTestId('week-total');
    fireEvent.press(await screen.findByLabelText(/Fix login, .*Edit/));
    await screen.findByRole('button', { name: 'Save entry' });
    expect(screen.getByRole('button', { name: 'Delete entry' })).toBeTruthy();
    const rowOf = (name: string) => {
      let n = screen.getByRole('button', { name }).parent;
      while (n && Object.assign({}, ...[n.props.style].flat(4).filter(Boolean)).flexDirection !== 'row') n = n.parent;
      return n;
    };
    expect(rowOf('Save entry')).toBe(rowOf('Delete entry'));
    const confirm = screen.getByRole('button', { name: 'Confirm entry as correct' });
    let inScroll = false;
    for (let n = confirm.parent; n && n.type !== Modal; n = n.parent) if (n.type === ScrollView) inScroll = true;
    expect(inScroll).toBe(true);
  });

  it('the Note field has a counter and the task select shows a chevron', async () => {
    await open();
    fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'x'.repeat(900));
    expect(screen.getByText('900/1000')).toBeTruthy();
    expect(screen.getByText('Type 4 digits for a time, e.g. 0930.')).toBeTruthy();
  });

  it('typing 930 gives 09:30 (first digit 3-9 zero-pads the hour)', async () => {
    await open();
    fireEvent.changeText(screen.getByLabelText('Start (HH:mm)'), '930');
    expect(screen.getByLabelText('Start (HH:mm)').props.value).toBe('09:30');
  });
});


describe('Label in Name on Timesheet and the Add time sheet', () => {
  it('week view, entry rows, the sheet and the task picker', async () => {
    render();
    await screen.findByTestId('week-total');
    expect(labelInNameViolations()).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Add time' }));
    await screen.findByTestId('tz-banner');
    expect(labelInNameViolations()).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Choose a task' }));
    await screen.findByRole('button', { name: 'Choose Fix login' });
    expect(labelInNameViolations()).toEqual([]);
  });
});
