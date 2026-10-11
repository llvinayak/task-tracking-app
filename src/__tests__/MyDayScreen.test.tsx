import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import { AppError } from '@/api/errors';
import { useDirtyGuard } from '@/hooks/dailyReport';
import { MyDayScreen } from '@/features/myday/MyDayScreen';
import { useAuthStore } from '@/store/authStore';
import { sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

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

const raw = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-10',
  timezone: 'Asia/Kolkata',
  status: 'draft',
  exists: true,
  summary: '',
  blockers: '',
  tomorrow_plan: '',
  submitted_at: null,
  reopened_at: null,
  reopened_by: null,
  items: [
    { id: 1, task_id: 5, task_title: 'Fix login', project_id: 2, project_name: 'Alpha', project_color: '#3366ff', auto_minutes: 60, minutes: 60, note: '', source: 'auto', needs_review: false, session_count: 1, edited: false },
    { id: 2, task_id: 6, task_title: 'Write docs', project_id: 3, project_name: 'Beta', project_color: '#ff6633', auto_minutes: 90, minutes: 120, note: '', source: 'auto', needs_review: false, session_count: 3, edited: true },
  ],
  totalMinutes: 180,
  trackedMinutes: 150,
  needsReview: 0,
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

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useDirtyGuard.setState({ dirty: false, discardSignal: 0 });
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser() });
  api.getDailyReport.mockImplementation(async (date?: string) => day(date ? { date } : {}));
  api.getUnreviewedEntries.mockResolvedValue([]);
});
afterEach(() => alertSpy.mockRestore());

describe('My Day: date policy', () => {
  it('today omits the date param and shows the date the server returned', async () => {
    api.getDailyReport.mockResolvedValue(day({ date: '2026-10-10' }));
    render();
    expect(await screen.findByText('Sat, 10 Oct 2026')).toBeTruthy();
    expect(api.getDailyReport).toHaveBeenCalledWith(undefined);
  });

  it('Next and Today are disabled on today (no future days)', async () => {
    render();
    await screen.findByTestId('day-date');
    expect(screen.getByRole('button', { name: 'Next day' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Today' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous day' }).props.accessibilityState.disabled).toBe(false);
  });

  it('Previous computes the day from the RETURNED date (string arithmetic) and enables Next/Today', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(api.getDailyReport).toHaveBeenCalledWith('2026-10-09'));
    expect(await screen.findByText('Fri, 9 Oct 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next day' }).props.accessibilityState.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Today' }).props.accessibilityState.disabled).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(api.getDailyReport).toHaveBeenCalledWith('2026-10-08'));
  });

  it('Next from yesterday returns to the default (today) query, never a date past today', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText('Fri, 9 Oct 2026');
    api.getDailyReport.mockClear();
    fireEvent.press(screen.getByRole('button', { name: 'Next day' }));
    expect(await screen.findByText('Sat, 10 Oct 2026')).toBeTruthy();
    expect(api.getDailyReport).not.toHaveBeenCalledWith('2026-10-11');
    expect(screen.getByRole('button', { name: 'Next day' }).props.accessibilityState.disabled).toBe(true);
  });

  it('Today jumps back from an older day', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText('Fri, 9 Oct 2026');
    fireEvent.press(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByText('Sat, 10 Oct 2026')).toBeTruthy();
  });
});

describe('My Day: content', () => {
  it('groups items by project sorted by minutes, with tracked / sessions / variance / auto-closed', async () => {
    api.getDailyReport.mockResolvedValue(
      day({
        items: [
          { id: 1, task_id: 5, task_title: 'Fix login', project_id: 2, project_name: 'Alpha', auto_minutes: 60, minutes: 60, session_count: 1 },
          { id: 2, task_id: 6, task_title: 'Write docs', project_id: 3, project_name: 'Beta', auto_minutes: 90, minutes: 120, session_count: 3, needs_review: true },
        ],
        needsReview: 0,
      }),
    );
    render();
    expect(await screen.findByTestId('project-group-3')).toHaveTextContent(/Beta.*2h/);
    expect(screen.getByTestId('project-group-2')).toHaveTextContent(/Alpha.*1h/);
    const order = screen.getAllByTestId(/^project-group-/).map((n) => n.props.testID);
    expect(order).toEqual(['project-group-3', 'project-group-2']); // Beta (120) before Alpha (60)

    expect(screen.getByTestId('item-6')).toHaveTextContent(/tracked 1h 30m · 3 sessions · \+30m added/);
    expect(screen.getByTestId('item-5')).toHaveTextContent(/tracked 1h(?! 30)/);
    expect(screen.getByTestId('item-5')).not.toHaveTextContent(/sessions/);
    expect(screen.getByTestId('item-6')).toHaveTextContent(/Auto-closed/);
    expect(screen.getByTestId('day-totals')).toHaveTextContent(/^Total 3h( |$)/);
  });

  it('empty day', async () => {
    api.getDailyReport.mockResolvedValue(day({ items: [], totalMinutes: 0, trackedMinutes: 0 }));
    render();
    expect(await screen.findByText('Nothing tracked yet')).toBeTruthy();
  });

  it('load error with retry', async () => {
    api.getDailyReport.mockRejectedValueOnce(new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side.' }));
    render();
    expect(await screen.findByText('Something went wrong on our side.')).toBeTruthy();
    api.getDailyReport.mockResolvedValue(day());
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('day-date')).toBeTruthy();
  });
});

describe('My Day: editing, dirty, save', () => {
  it('Save draft is disabled until something changes, then saves the FULL list and toasts', async () => {
    api.saveDailyReport.mockResolvedValue(day());
    render();
    await screen.findByTestId('day-date');
    expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Hours for Fix login'), '1');
    fireEvent.changeText(screen.getByLabelText('Minutes for Fix login'), '25');
    expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('item-5')).toHaveTextContent(/\+25m added/); // 85 vs tracked 60
    expect(screen.getByTestId('day-totals')).toHaveTextContent(/^Total 3h 25m/);
    expect(useDirtyGuard.getState().dirty).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.saveDailyReport).toHaveBeenCalledTimes(1));
    const body = api.saveDailyReport.mock.calls[0]![0];
    expect(body.date).toBe('2026-10-10');
    expect(body.items).toHaveLength(2); // PUT replaces everything: all items sent
    expect(body.items.find((i) => i.task_id === 5)?.minutes).toBe(85);
    expect(await screen.findByText('Draft saved')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(true));
    expect(useDirtyGuard.getState().dirty).toBe(false);
  });

  it('minutes editor rejects invalid values with a message and does not change the total', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Minutes for Fix login'), '75');
    expect(await screen.findByText('Minutes must be between 0 and 59.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('day-totals')).toHaveTextContent(/^Total 3h( |$)/);
  });

  it('notes and summary fields mark the day dirty', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getAllByLabelText('What did you do on this?')[0]!, 'Fixed the redirect');
    expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(false);
  });

  it('a failed save keeps the draft, shows the server message and stays dirty', async () => {
    api.saveDailyReport.mockRejectedValue(
      new AppError({ kind: 'conflict', status: 409, message: 'This day has been submitted. Ask a manager to reopen it before editing.' }),
    );
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'My summary');
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByTestId('day-error')).toHaveTextContent('This day has been submitted. Ask a manager to reopen it before editing.');
    expect(screen.getByLabelText('Summary').props.value).toBe('My summary');
    expect(screen.getByRole('button', { name: 'Save draft' }).props.accessibilityState.disabled).toBe(false);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('a background refetch does not overwrite unsaved edits', async () => {
    const { queryClient } = render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'typing...');
    api.getDailyReport.mockResolvedValue(day({ summary: 'from server' }));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['daily-report'] });
    });
    expect(screen.getByLabelText('Summary').props.value).toBe('typing...');
  });
});

describe('My Day: submit', () => {
  it('confirms with the total and task count, then submits the current form', async () => {
    api.submitDailyReport.mockResolvedValue({ report: day({ status: 'submitted' }), message: 'Day submitted. Nice work.' });
    render();
    await screen.findByTestId('day-date');
    fireEvent.press(screen.getByRole('button', { name: 'Submit day' }));
    expect(lastAlert().message).toBe('Filing 3h across 2 tasks. It locks after this. A manager can reopen it.');
    expect(api.submitDailyReport).not.toHaveBeenCalled();

    await press('Submit');
    await waitFor(() => expect(api.submitDailyReport).toHaveBeenCalledTimes(1));
    expect(api.submitDailyReport.mock.calls[0]![0].items).toHaveLength(2);
    expect(await screen.findByText('Day submitted. Nice work.')).toBeTruthy();
  });

  it('Cancel in the confirm dialog submits nothing', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.press(screen.getByRole('button', { name: 'Submit day' }));
    await press('Cancel');
    expect(api.submitDailyReport).not.toHaveBeenCalled();
  });

  it.each([
    ['400 auto-closed', 400, 'validation', '1 entries auto-closed and not yet confirmed. Confirm them in your timesheet first.'],
    ['400 nothing to report', 400, 'validation', 'Nothing to report for this day.'],
    ['409 already submitted', 409, 'conflict', 'This day has already been submitted.'],
  ] as const)('%s: message verbatim and the draft is kept', async (_n, status, kind, message) => {
    api.submitDailyReport.mockRejectedValue(new AppError({ kind, status, message }));
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Blockers'), 'waiting on infra');
    fireEvent.press(screen.getByRole('button', { name: 'Submit day' }));
    await press('Submit');
    expect(await screen.findByTestId('day-error')).toHaveTextContent(message);
    expect(screen.getByLabelText('Blockers').props.value).toBe('waiting on infra');
  });
});

describe('My Day: locked and reopened', () => {
  it('a submitted day is read-only with the filed time and no actions', async () => {
    api.getDailyReport.mockResolvedValue(day({ status: 'submitted', submitted_at: '2026-10-10T12:30:00.000Z' }));
    render();
    expect(await screen.findByTestId('locked-banner')).toHaveTextContent(/Submitted\. Filed .*Ask a manager to reopen it\./);
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit day' })).toBeNull();
    expect(screen.getByLabelText('Hours for Fix login').props.editable).toBe(false);
    expect(screen.getByLabelText('Summary').props.editable).toBe(false);
    expect(useDirtyGuard.getState().dirty).toBe(false);
  });

  it('shows who reopened the day and when', async () => {
    api.getDailyReport.mockResolvedValue(day({ reopened_at: '2026-10-10T08:00:00.000Z', reopened_by: { id: 3, name: 'Manager Mo' } }));
    render();
    expect(await screen.findByTestId('reopened-line')).toHaveTextContent(/Reopened by Manager Mo on /);
    // A reopened day is a draft again: editable.
    expect(screen.getByRole('button', { name: 'Submit day' })).toBeTruthy();
  });
});

describe('My Day: unsaved-changes guard', () => {
  it('changing the date while dirty asks first; Keep editing stays, Discard moves on', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'unsaved');
    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(lastAlert().title).toBe('Discard changes?');
    expect(api.getDailyReport).not.toHaveBeenCalledWith('2026-10-09');

    await press('Keep editing');
    expect(screen.getByText('Sat, 10 Oct 2026')).toBeTruthy();
    expect(screen.getByLabelText('Summary').props.value).toBe('unsaved');

    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    await press('Discard');
    expect(await screen.findByText('Fri, 9 Oct 2026')).toBeTruthy();
    expect(screen.getByLabelText('Summary').props.value).toBe('');
  });

  it('does not ask when nothing changed', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.press(screen.getByRole('button', { name: 'Previous day' }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Fri, 9 Oct 2026')).toBeTruthy();
  });

  it('publishes the dirty state for the tab bar guard, and a tab-bar "Discard" resets the form', async () => {
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Summary'), 'unsaved');
    expect(useDirtyGuard.getState().dirty).toBe(true);
    act(() => useDirtyGuard.getState().requestDiscard());
    await waitFor(() => expect(screen.getByLabelText('Summary').props.value).toBe(''));
    expect(useDirtyGuard.getState().dirty).toBe(false);
  });
});

describe('My Day: auto-closed review flow', () => {
  it('lists auto-closed entries for THIS day and Confirm calls the review endpoint, then refreshes', async () => {
    api.getDailyReport.mockResolvedValue(day({ needsReview: 1 }));
    api.getUnreviewedEntries.mockResolvedValueOnce([
      { id: 77, task_id: 5, task_title: 'Fix login', minutes: 480, started_at: null, ended_at: null },
    ]);
    api.getUnreviewedEntries.mockResolvedValue([]);
    api.reviewEntry.mockImplementation(async () => {
      api.getDailyReport.mockResolvedValue(day({ needsReview: 0 }));
    });
    render();
    expect(await screen.findByTestId('review-77')).toHaveTextContent(/Fix login.*8h · auto-closed/);
    expect(api.getUnreviewedEntries).toHaveBeenCalledWith('2026-10-10');

    fireEvent.press(screen.getByRole('button', { name: 'Confirm Fix login' }));
    await waitFor(() => expect(api.reviewEntry).toHaveBeenCalledWith(77));
    await waitFor(() => expect(screen.queryByTestId('review-card')).toBeNull());
  });

  it('a review error is shown verbatim', async () => {
    api.getDailyReport.mockResolvedValue(day({ needsReview: 1 }));
    api.getUnreviewedEntries.mockResolvedValue([{ id: 77, task_id: 5, task_title: 'Fix login', minutes: 480, started_at: null, ended_at: null }]);
    api.reviewEntry.mockRejectedValue(new AppError({ kind: 'forbidden', status: 403, message: 'You can only review your own time entries.' }));
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Confirm Fix login' }));
    expect(await screen.findByText('You can only review your own time entries.')).toBeTruthy();
  });

  it('no review card when nothing needs review', async () => {
    render();
    await screen.findByTestId('day-date');
    expect(screen.queryByTestId('review-card')).toBeNull();
    expect(api.getUnreviewedEntries).not.toHaveBeenCalled();
  });
});
