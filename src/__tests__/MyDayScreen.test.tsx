import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Dimensions, ScrollView, type AlertButton } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import { AppError } from '@/api/errors';
import { useDirtyGuard } from '@/hooks/dailyReport';
import { MAX_NOTE } from '@/features/myday/dayForm';
import { MyDayScreen } from '@/features/myday/MyDayScreen';
import { useAuthStore } from '@/store/authStore';
import { menu, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { labelInNameViolations } from '@/test/a11y';

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
jest.mock('@/api/menuApi');
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
  // useMenuAccess() runs for the empty-day CTA: give the (auto-mocked) menus request a real answer, never undefined.
  (jest.requireMock('@/api/menuApi') as { getMyMenus: jest.Mock }).getMyMenus.mockResolvedValue([]);
});
afterEach(() => {
  alertSpy.mockRestore();
  jest.restoreAllMocks();
});

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

describe('My Day: Stage 2 layout (style-only; logic untouched)', () => {
  it('the date stepper is two icon buttons around the date; Timesheet lives in the header, apart from the stepper', async () => {
    render();
    await screen.findByTestId('day-date');
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeTruthy();
    expect(screen.queryByText('Previous day')).toBeNull(); // icon-only: no visible text
    expect(screen.getByRole('button', { name: 'Timesheet' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Timesheet' }));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Timesheet');
  });

  it('shows "x of 8h" and an 8dp progress bar for the 8h display target', async () => {
    render();
    await screen.findByTestId('day-date');
    expect(screen.getByTestId('day-totals')).toHaveTextContent(/^Total 3h of 8h/);
    const bar = screen.getByRole('progressbar', { name: 'Progress to the 8h day' });
    expect(bar.props.accessibilityValue).toMatchObject({ now: 38 }); // 180 / 480
    expect(screen.queryByText('8h target met')).toBeNull();
  });

  it('says when the target is met', async () => {
    api.getDailyReport.mockResolvedValue(
      day({ totalMinutes: 540, items: [{ id: 1, task_id: 5, task_title: 'Fix login', project_id: 2, project_name: 'Alpha', project_color: '#3366ff', auto_minutes: 540, minutes: 540, note: '', source: 'auto', needs_review: false, session_count: 1, edited: false }] }),
    );
    render();
    expect(await screen.findByText('8h target met')).toBeTruthy();
  });

  it('Save draft / Submit day sit in the sticky footer, outside the scroll area, and vanish when the day is locked', async () => {
    const first = render();
    await screen.findByTestId('day-date');
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.findAll((n: { props: { accessibilityLabel?: string } }) => n.props.accessibilityLabel === 'Save draft')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit day' })).toBeTruthy();
    first.unmount();
    api.getDailyReport.mockResolvedValue(day({ status: 'submitted', submitted_at: '2026-10-10T12:00:00Z' }));
    render();
    await screen.findByTestId('locked-banner');
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit day' })).toBeNull();
  });

  it('the buttons stack at large text with Submit FIRST in reading order and on top (no column-reverse)', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1.5 });
    render();
    await screen.findByTestId('day-date');
    const buttons = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(buttons.indexOf('Submit day')).toBeGreaterThan(-1);
    expect(buttons.indexOf('Submit day')).toBeLessThan(buttons.indexOf('Save draft'));
    let n = screen.getByRole('button', { name: 'Save draft' }).parent;
    while (n && Object.assign({}, ...[n.props.style].flat(4).filter(Boolean)).flexDirection === undefined) n = n.parent;
    expect(Object.assign({}, ...[n!.props.style].flat(4).filter(Boolean)).flexDirection).toBe('column');
  });

  it('side by side at normal text: Save draft first, then Submit day', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1 });
    render();
    await screen.findByTestId('day-date');
    const buttons = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(buttons.indexOf('Save draft')).toBeLessThan(buttons.indexOf('Submit day'));
  });

  it('Summary, Blockers and Tomorrow\'s plan are marked optional (visual only) and notes have a counter', async () => {
    render();
    await screen.findByTestId('day-date');
    expect(screen.getAllByText('(optional)')).toHaveLength(3);
    expect(screen.getByLabelText('Summary')).toBeTruthy(); // accessible name stays the label
    fireEvent.changeText(screen.getAllByLabelText('What did you do on this?')[0]!, 'x'.repeat(Math.floor(MAX_NOTE * 0.9)));
    expect(screen.getByText(`${Math.floor(MAX_NOTE * 0.9)}/${MAX_NOTE}`)).toBeTruthy();
  });

  it('an empty day offers "Go to Tasks" only when Tasks is granted', async () => {
    api.getDailyReport.mockResolvedValue(day({ items: [], totalMinutes: 0, trackedMinutes: 0 }));
    const menus = jest.requireMock('@/api/menuApi') as { getMyMenus: jest.Mock };
    menus.getMyMenus.mockResolvedValue([]);
    render();
    expect(await screen.findByText('Nothing tracked yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go to Tasks' })).toBeNull();
  });

  it('with Tasks granted, "Go to Tasks" navigates there (navigation only)', async () => {
    api.getDailyReport.mockResolvedValue(day({ items: [], totalMinutes: 0, trackedMinutes: 0 }));
    const menus = jest.requireMock('@/api/menuApi') as { getMyMenus: jest.Mock };
    menus.getMyMenus.mockResolvedValue([menu({ id: 2, menu_name: 'Task Board', menu_url: '/tasks' })]);
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Go to Tasks' }));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Tasks' });
  });

  it('a successful save fires the success haptic', async () => {
    api.saveDailyReport.mockResolvedValue(day());
    render();
    await screen.findByTestId('day-date');
    fireEvent.changeText(screen.getByLabelText('Minutes for Fix login'), '25');
    fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved');
    const haptics = jest.requireMock('expo-haptics') as { notificationAsync: jest.Mock };
    expect(haptics.notificationAsync).toHaveBeenCalledWith('success');
  });
});


describe('Label in Name on the whole My Day screen', () => {
  it('stepper, Today, Timesheet, line editors and the footer', async () => {
    render();
    await screen.findByTestId('day-date');
    expect(labelInNameViolations()).toEqual([]);
  });
});
