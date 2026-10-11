import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import { parseProjects, parseStatusConfig } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import * as ticketsApi from '@/api/ticketsApi';
import * as tsApi from '@/api/timesheetApi';
import { MyDayScreen } from '@/features/myday/MyDayScreen';
import { CommentsTab } from '@/features/tasks/TaskDetailTabs';
import { TicketCreateScreen } from '@/features/tickets/TicketCreateScreen';
import { TicketDetailScreen } from '@/features/tickets/TicketDetailScreen';
import { TimeEntrySheet } from '@/features/timesheet/TimeEntrySheet';
import { captureSession, isEpochStale } from '@/hooks/sessionMutation';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useDirtyGuard } from '@/store/uiStores';
import { rawStatuses, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { ticketId: 12 } }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('react');
    R.useEffect(cb, [cb]);
  },
}));
jest.mock('@/api/ticketsApi', () => ({
  ...jest.requireActual('@/api/ticketsApi'),
  getTicket: jest.fn(),
  createTicket: jest.fn(),
  getTicketComments: jest.fn(),
  addTicketComment: jest.fn(),
  getAssignableUsers: jest.fn(),
}));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTaskComments: jest.fn(), addTaskComment: jest.fn() }));
jest.mock('@/api/dailyReportApi', () => ({
  ...jest.requireActual('@/api/dailyReportApi'),
  getDailyReport: jest.fn(),
  saveDailyReport: jest.fn(),
  submitDailyReport: jest.fn(),
  getUnreviewedEntries: jest.fn(),
  reviewEntry: jest.fn(),
}));
jest.mock('@/api/timesheetApi', () => ({
  ...jest.requireActual('@/api/timesheetApi'),
  getTimesheet: jest.fn(),
  createTimeEntry: jest.fn(),
  updateTimeEntry: jest.fn(),
  deleteTimeEntry: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const tickets = ticketsApi as jest.Mocked<typeof ticketsApi>;
const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const daily = dailyApi as jest.Mocked<typeof dailyApi>;
const ts = tsApi as jest.Mocked<typeof tsApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const logout = () => useAuthStore.setState((s) => ({ epoch: s.epoch + 1 }));
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tkt = (over: Record<string, unknown> = {}) =>
  ticketsApi.parseTicketDetail({
    id: 12, title: 'Login broken', description: 'x', status: 'open', severity: 3, project_id: 2,
    project: { id: 2, name: 'Alpha', color: '#3366ff' }, creator: { id: 1, name: 'Ada' }, assignee: { id: 7, name: 'Grace' },
    created_at: '2026-10-01T09:00:00Z', attachments: [], tasks: [], ...over,
  })!;

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useDirtyGuard.setState({ dirty: false, discardSignal: 0 });
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7 }) });
  useProjectStore.setState({ selected: { id: 2, name: 'Alpha', color: null, status: null, product_id: null } });
  projects.getProjects.mockResolvedValue(parseProjects([{ id: 2, name: 'Alpha' }]));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  tickets.getTicket.mockResolvedValue(tkt());
  tickets.getTicketComments.mockResolvedValue([]);
  tickets.getAssignableUsers.mockResolvedValue([]);
  tasks.getTaskComments.mockResolvedValue([]);
});
afterEach(() => alertSpy.mockRestore());

describe('helper', () => {
  it('captureSession is true until the epoch changes; isEpochStale ignores "nothing captured"', () => {
    const alive = captureSession();
    expect(alive()).toBe(true);
    expect(isEpochStale(undefined)).toBe(false);
    const e = useAuthStore.getState().epoch;
    expect(isEpochStale(e)).toBe(false);
    logout();
    expect(alive()).toBe(false);
    expect(isEpochStale(e)).toBe(true);
  });
});

describe('call-site continuations after a stale session', () => {
  it('TicketCreate: no navigation after logout (success) and no error banner (failure)', async () => {
    const d = deferred<ticketsApi.TicketDetail>();
    tickets.createTicket.mockReturnValue(d.promise);
    renderWithProviders(<TicketCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Broken');
    fireEvent.changeText(screen.getByLabelText('Description'), 'It is broken');
    fireEvent.press(screen.getByRole('button', { name: 'Create ticket' }));
    await waitFor(() => expect(tickets.createTicket).toHaveBeenCalled());
    logout();
    await act(async () => d.resolve(tkt({ id: 99 })));
    expect(mockNav.replace).not.toHaveBeenCalled();
  });

  it('TicketCreate: a failure after logout shows nothing', async () => {
    const d = deferred<ticketsApi.TicketDetail>();
    tickets.createTicket.mockReturnValue(d.promise);
    renderWithProviders(<TicketCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Broken');
    fireEvent.changeText(screen.getByLabelText('Description'), 'It is broken');
    fireEvent.press(screen.getByRole('button', { name: 'Create ticket' }));
    await waitFor(() => expect(tickets.createTicket).toHaveBeenCalled());
    logout();
    await act(async () => d.reject(new Error('Old user failure')));
    expect(screen.queryByTestId('ticket-create-error')).toBeNull();
  });

  it('TicketCreate (control): without logout it navigates', async () => {
    tickets.createTicket.mockResolvedValue(tkt({ id: 99 }));
    renderWithProviders(<TicketCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Broken');
    fireEvent.changeText(screen.getByLabelText('Description'), 'It is broken');
    fireEvent.press(screen.getByRole('button', { name: 'Create ticket' }));
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('TicketDetail', { ticketId: 99 }));
  });

  it('TicketDetail note: the draft is not cleared (and no error is shown) after logout', async () => {
    const d = deferred<ticketsApi.TicketComment>();
    tickets.addTicketComment.mockReturnValue(d.promise);
    renderWithProviders(<TicketDetailScreen />);
    await screen.findByText('Login broken');
    const box = screen.getByLabelText('Add a note');
    fireEvent.changeText(box, 'hello');
    fireEvent.press(screen.getByRole('button', { name: 'Post note' }));
    await waitFor(() => expect(tickets.addTicketComment).toHaveBeenCalled());
    logout();
    await act(async () => d.reject(new Error('Old user failure')));
    expect(screen.queryByText(/Old user failure/)).toBeNull();
    expect(screen.getByLabelText('Add a note').props.value).toBe('hello');
  });

  it('Task comment: the draft is not cleared after logout', async () => {
    const d = deferred<never>();
    tasks.addTaskComment.mockReturnValue(d.promise);
    renderWithProviders(<CommentsTab taskId={5} />);
    await screen.findByText('No comments yet');
    fireEvent.changeText(screen.getByLabelText('Add a comment'), 'hello');
    fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(tasks.addTaskComment).toHaveBeenCalled());
    logout();
    await act(async () => d.reject(new Error('Old user failure')));
    expect(screen.queryByTestId('comment-error')).toBeNull();
    expect(screen.getByLabelText('Add a comment').props.value).toBe('hello');
  });

  it('TimeEntrySheet: Confirm and note-only save do not close after logout', async () => {
    const entry = {
      id: 9, task_id: 5, task_title: 'Night deploy', task_status: null, project: null,
      started_at: '2026-10-08T17:30:00.000Z', ended_at: '2026-10-09T19:30:00.000Z', minutes: 120, note: 'n',
      source: 'timer', auto_closed: true, reviewed_at: null,
    };
    const d = deferred<undefined>();
    daily.reviewEntry.mockReturnValue(d.promise as Promise<void>);
    const onClose = jest.fn();
    renderWithProviders(<TimeEntrySheet visible onClose={onClose} timezone="Asia/Kolkata" defaultDate="2026-10-09" entry={entry} />);
    fireEvent.press(screen.getByRole('button', { name: 'Confirm entry as correct' }));
    await waitFor(() => expect(daily.reviewEntry).toHaveBeenCalled());
    logout();
    await act(async () => d.resolve(undefined));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TimeEntrySheet: a note-only save does not close after logout', async () => {
    const entry = {
      id: 9, task_id: 5, task_title: 'Night deploy', task_status: null, project: null,
      started_at: '2026-10-08T17:30:00.000Z', ended_at: '2026-10-09T19:30:00.000Z', minutes: 120, note: 'n',
      source: 'timer', auto_closed: false, reviewed_at: null,
    };
    const d2 = deferred<undefined>();
    ts.updateTimeEntry.mockReturnValue(d2.promise as Promise<void>);
    const onClose = jest.fn();
    renderWithProviders(<TimeEntrySheet visible onClose={onClose} timezone="Asia/Kolkata" defaultDate="2026-10-09" entry={entry} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(ts.updateTimeEntry).toHaveBeenCalled());
    logout();
    await act(async () => d2.resolve(undefined));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TimeEntrySheet (control): without logout Confirm closes the sheet', async () => {
    const entry = {
      id: 9, task_id: 5, task_title: 'Night deploy', task_status: null, project: null,
      started_at: '2026-10-08T17:30:00.000Z', ended_at: '2026-10-09T19:30:00.000Z', minutes: 120, note: '',
      source: 'timer', auto_closed: true, reviewed_at: null,
    };
    daily.reviewEntry.mockResolvedValue(undefined);
    const onClose = jest.fn();
    renderWithProviders(<TimeEntrySheet visible onClose={onClose} timezone="Asia/Kolkata" defaultDate="2026-10-09" entry={entry} />);
    fireEvent.press(screen.getByRole('button', { name: 'Confirm entry as correct' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  describe('My Day save/submit', () => {
    const A = { id: 1, task_id: 5, task_title: 'Fix login', project_id: 2, project_name: 'Alpha', auto_minutes: 60, minutes: 60, session_count: 1 };
    const day = (over: Record<string, unknown> = {}) =>
      dailyApi.parseDailyReport({
        date: '2026-10-10', timezone: 'Asia/Kolkata', status: 'draft', exists: true, summary: '', blockers: '', tomorrow_plan: '',
        items: [A], totalMinutes: 60, trackedMinutes: 60, needsReview: 0, ...over,
      }) as dailyApi.DailyReport;

    beforeEach(() => {
      daily.getDailyReport.mockImplementation(async () => day());
      daily.getUnreviewedEntries.mockResolvedValue([]);
    });

    it('Save: no toast and no settle when the session changed during the PUT', async () => {
      const d = deferred<dailyApi.DailyReport>();
      daily.saveDailyReport.mockReturnValue(d.promise);
      renderWithProviders(<MyDayScreen />);
      await screen.findByTestId('day-date');
      fireEvent.changeText(screen.getByLabelText('Summary'), 'mine');
      fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
      await waitFor(() => expect(daily.saveDailyReport).toHaveBeenCalled());
      logout();
      await act(async () => d.resolve(day({ summary: 'mine' })));
      expect(screen.queryByText('Draft saved')).toBeNull();
    });

    it('Save (control): without logout the toast appears', async () => {
      daily.saveDailyReport.mockResolvedValue(day({ summary: 'mine' }));
      renderWithProviders(<MyDayScreen />);
      await screen.findByTestId('day-date');
      fireEvent.changeText(screen.getByLabelText('Summary'), 'mine');
      fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
      expect(await screen.findByText('Draft saved')).toBeTruthy();
    });

    it('Submit: no toast when the session changed during the POST', async () => {
      const d = deferred<{ report: dailyApi.DailyReport; message: string }>();
      daily.submitDailyReport.mockReturnValue(d.promise);
      renderWithProviders(<MyDayScreen />);
      await screen.findByTestId('day-date');
      fireEvent.press(screen.getByRole('button', { name: 'Submit day' }));
      const c = alertSpy.mock.calls.at(-1) as [string, string, AlertButton[]];
      await act(async () => {
        c[2].find((b) => b.text === 'Submit')?.onPress?.();
      });
      await waitFor(() => expect(daily.submitDailyReport).toHaveBeenCalled());
      logout();
      await act(async () => d.resolve({ report: day({ status: 'submitted' }), message: 'Day submitted. Nice work.' }));
      expect(screen.queryByText('Day submitted. Nice work.')).toBeNull();
    });

    it('a failure after logout shows no day error', async () => {
      const d = deferred<dailyApi.DailyReport>();
      daily.saveDailyReport.mockReturnValue(d.promise);
      renderWithProviders(<MyDayScreen />);
      await screen.findByTestId('day-date');
      fireEvent.changeText(screen.getByLabelText('Summary'), 'mine');
      fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
      await waitFor(() => expect(daily.saveDailyReport).toHaveBeenCalled());
      logout();
      await act(async () => d.reject(new Error('Old user failure')));
      expect(screen.queryByTestId('day-error')).toBeNull();
    });
  });
});
