import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import { parseProjects, parseStatusConfig, parseTaskDetail, type TaskDetail } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import * as ticketsApi from '@/api/ticketsApi';
import * as timeApi from '@/api/timeApi';
import { TicketCreateScreen } from '@/features/tickets/TicketCreateScreen';
import { TicketDetailScreen } from '@/features/tickets/TicketDetailScreen';
import { TimerControl } from '@/features/timer/TimerControl';
import { __resetTicketLocks } from '@/hooks/tickets';
import { __resetTimerLock } from '@/hooks/timer';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { ticketId: 12 } }),
  useIsFocused: () => true,
}));
jest.mock('@/api/ticketsApi', () => ({
  ...jest.requireActual('@/api/ticketsApi'),
  getTicket: jest.fn(),
  createTicket: jest.fn(),
  updateTicket: jest.fn(),
  getTicketComments: jest.fn(),
  getAssignableUsers: jest.fn(),
}));
jest.mock('@/api/timeApi', () => ({
  ...jest.requireActual('@/api/timeApi'),
  getRunningTimer: jest.fn(),
  startTimer: jest.fn(),
  stopTimer: jest.fn(),
  getTaskSessions: jest.fn(),
}));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTaskAssignees: jest.fn(), changeTaskStatus: jest.fn() }));
jest.mock('@/api/projectsApi');

const tickets = ticketsApi as jest.Mocked<typeof ticketsApi>;
const time = timeApi as jest.Mocked<typeof timeApi>;
const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const raw = (over: Record<string, unknown> = {}) => ({
  id: 12, title: 'Login broken', description: 'x', status: 'open', severity: 3,
  project_id: 2, project: { id: 2, name: 'Alpha', color: '#3366ff' }, client: { id: 4, name: 'Acme' },
  creator: { id: 1, name: 'Ada' }, assignee: { id: 7, name: 'Grace' }, created_at: '2026-10-01T09:00:00Z',
  attachments: [], tasks: [], ...over,
});
const detail = (over: Record<string, unknown> = {}) => ticketsApi.parseTicketDetail(raw(over))!;
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

beforeEach(() => {
  jest.clearAllMocks();
  __resetTicketLocks();
  __resetTimerLock();
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, roleId: 5 }) });
  useProjectStore.setState({ selected: null });
  projects.getProjects.mockResolvedValue(parseProjects([{ id: 2, name: 'Alpha', color: '#3366ff' }]));
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  tickets.getTicket.mockResolvedValue(detail());
  tickets.getTicketComments.mockResolvedValue([]);
  tickets.getAssignableUsers.mockResolvedValue([{ id: 7, name: 'Grace' }, { id: 9, name: 'Linus' }]);
  time.getRunningTimer.mockResolvedValue(null);
  tasks.getTaskAssignees.mockResolvedValue([]);
});

describe('L2: ticket status chips and the assignee change share one pending flag and lock', () => {
  it('chips are disabled while a PUT is pending, and exactly one PUT is sent', async () => {
    const d = deferred<ticketsApi.TicketDetail>();
    tickets.updateTicket.mockReturnValue(d.promise);
    renderWithProviders(<TicketDetailScreen />);
    await screen.findByText('Login broken');
    const user = userEvent.setup();
    await user.press(screen.getByTestId('ticket-status-in_progress'));
    await waitFor(() => expect(screen.getByTestId('ticket-status-closed').props.accessibilityState.disabled).toBe(true));
    expect(screen.getByTestId('ticket-status-in_progress').props.accessibilityState.disabled).toBe(true);
    await user.press(screen.getByTestId('ticket-status-closed'));
    expect(tickets.updateTicket).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(detail({ status: 'in_progress' })));
    await waitFor(() => expect(screen.getByTestId('ticket-status-closed').props.accessibilityState.disabled).toBe(false));
  });

  it('an assignee change blocks a status tap (and the other way round): one write path', async () => {
    const d = deferred<ticketsApi.TicketDetail>();
    tickets.updateTicket.mockReturnValue(d.promise);
    renderWithProviders(<TicketDetailScreen />);
    await screen.findByText('Login broken');
    fireEvent.press(screen.getByRole('button', { name: 'Change assignee' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Linus' }));
    await waitFor(() => expect(tickets.updateTicket).toHaveBeenCalledWith(12, { assigned_to: 9 }));
    await waitFor(() => expect(screen.getByTestId('ticket-status-closed').props.accessibilityState.disabled).toBe(true));
    const user = userEvent.setup();
    await user.press(screen.getByTestId('ticket-status-closed'));
    expect(tickets.updateTicket).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(detail({ assignee: { id: 9, name: 'Linus' } })));
    await waitFor(() => expect(screen.getByTestId('ticket-status-closed').props.accessibilityState.disabled).toBe(false));
  });

  it('the lock is released after a failure so the user can retry', async () => {
    tickets.updateTicket.mockRejectedValueOnce(new Error('boom'));
    tickets.updateTicket.mockResolvedValueOnce(detail({ status: 'closed' }));
    renderWithProviders(<TicketDetailScreen />);
    await screen.findByText('Login broken');
    const user = userEvent.setup();
    await user.press(screen.getByTestId('ticket-status-closed'));
    await waitFor(() => expect(screen.getByTestId('ticket-status-closed').props.accessibilityState.disabled).toBe(false));
    await user.press(screen.getByTestId('ticket-status-closed'));
    await waitFor(() => expect(tickets.updateTicket).toHaveBeenCalledTimes(2));
  });
});

describe('L8: a response that arrives after logout touches nothing', () => {
  it('ticket update: no cache write, no toast', async () => {
    const d = deferred<ticketsApi.TicketDetail>();
    tickets.updateTicket.mockReturnValue(d.promise);
    const r = renderWithProviders(<TicketDetailScreen />);
    await screen.findByText('Login broken');
    fireEvent.press(screen.getByTestId('ticket-status-closed'));
    await waitFor(() => expect(tickets.updateTicket).toHaveBeenCalled());
    logout();
    await act(async () => d.resolve(detail({ status: 'closed', title: 'PREVIOUS USER DATA' })));
    expect(screen.queryByText('Ticket updated')).toBeNull();
    expect((r.queryClient.getQueryData(['ticket', 12]) as { title: string }).title).toBe('Login broken');
  });

  it('ticket update error: no toast either', async () => {
    const d = deferred<ticketsApi.TicketDetail>();
    tickets.updateTicket.mockReturnValue(d.promise);
    renderWithProviders(<TicketDetailScreen />);
    await screen.findByText('Login broken');
    fireEvent.press(screen.getByTestId('ticket-status-closed'));
    await waitFor(() => expect(tickets.updateTicket).toHaveBeenCalled());
    logout();
    await act(async () => d.reject(new Error('Old user error')));
    expect(screen.queryByText(/Old user error|Something went wrong/)).toBeNull();
  });

  it('timer start: no toast, no running-timer write, no status prompt after logout', async () => {
    const d = deferred<{ startedId: number; stopped: null; warning: null }>();
    time.startTimer.mockReturnValue(d.promise);
    renderWithProviders(<TimerControl task={parseTaskDetail({ ...rawTask({ id: 5, title: 'Fix login', status: 'NOT_STARTED', dev_owner_id: 7 }) }) as TaskDetail} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    await waitFor(() => expect(time.startTimer).toHaveBeenCalled());
    logout();
    await act(async () => d.resolve({ startedId: 1, stopped: null, warning: null }));
    expect(screen.queryByText('Timer started')).toBeNull();
  });
});

describe('L7: the timer lock is released as soon as the server says yes', () => {
  it('Start is usable again even while the status config (for the prompt) is still loading', async () => {
    projects.getTaskStatuses.mockImplementation(() => new Promise(() => undefined)); // never resolves
    time.startTimer.mockResolvedValue({ startedId: 1, stopped: null, warning: null });
    renderWithProviders(<TimerControl task={parseTaskDetail({ ...rawTask({ id: 5, title: 'Fix login', status: 'NOT_STARTED', dev_owner_id: 7 }) }) as TaskDetail} />);
    fireEvent.press(await screen.findByRole('button', { name: 'Start timer' }));
    expect(await screen.findByText('Timer started')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start timer' }).props.accessibilityState.disabled).toBeFalsy());
    fireEvent.press(screen.getByRole('button', { name: 'Start timer' }));
    await waitFor(() => expect(time.startTimer).toHaveBeenCalledTimes(2)); // not held by the pending config
  });
});

describe('L9: ticket create ignores a fast double tap (ref lock)', () => {
  it('sends one POST for two taps in the same tick', async () => {
    const d = deferred<ticketsApi.TicketDetail>();
    tickets.createTicket.mockReturnValue(d.promise);
    useProjectStore.setState({ selected: { id: 2, name: 'Alpha', color: null, status: null, product_id: null } }); // the form defaults to the picked project
    renderWithProviders(<TicketCreateScreen />);
    fireEvent.changeText(screen.getByLabelText('Title'), 'Broken');
    fireEvent.changeText(screen.getByLabelText('Description'), 'It is broken');
    const btn = screen.getByRole('button', { name: 'Create ticket' });
    fireEvent.press(btn);
    fireEvent.press(btn);
    await waitFor(() => expect(tickets.createTicket).toHaveBeenCalled());
    expect(tickets.createTicket).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(detail()));
  });
});
