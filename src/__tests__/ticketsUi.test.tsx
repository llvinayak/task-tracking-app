import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import { AppError } from '@/api/errors';
import { parseProjects } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as ticketsApi from '@/api/ticketsApi';
import { TicketCreateScreen } from '@/features/tickets/TicketCreateScreen';
import { TicketDetailScreen } from '@/features/tickets/TicketDetailScreen';
import { SEARCH_DEBOUNCE_MS, TicketsScreen } from '@/features/tickets/TicketsScreen';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
let mockParams: Record<string, unknown> = { ticketId: 12 };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
  useIsFocused: () => true,
}));
jest.mock('@/api/ticketsApi', () => ({
  ...jest.requireActual('@/api/ticketsApi'),
  getTickets: jest.fn(),
  getTicket: jest.fn(),
  createTicket: jest.fn(),
  updateTicket: jest.fn(),
  getTicketComments: jest.fn(),
  addTicketComment: jest.fn(),
  getAssignableUsers: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const api = ticketsApi as jest.Mocked<typeof ticketsApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const raw = (over: Record<string, unknown> = {}) => ({
  id: 12, title: 'Login broken', description: 'Cannot log in <b>at all</b>\nsecond line', status: 'open', severity: 3,
  project_id: 2, project: { id: 2, name: 'Alpha', color: '#3366ff' }, client: { id: 4, name: 'Acme' },
  creator: { id: 1, name: 'Ada' }, assignee: { id: 7, name: 'Grace' }, created_at: '2026-10-01T09:00:00Z',
  attachments: [], tasks: [], ...over,
});
const ticket = (over: Record<string, unknown> = {}) => ticketsApi.parseTicket(raw(over))!;
const detail = (over: Record<string, unknown> = {}) => ticketsApi.parseTicketDetail(raw(over))!;
const NETWORK = new AppError({ kind: 'network', message: "Can't reach the server. Check your connection and try again." });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { ticketId: 12 };
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, name: 'Grace Hopper' }) });
  useProjectStore.setState({ selected: null });
  projects.getProjects.mockResolvedValue(parseProjects([{ id: 2, name: 'Alpha', color: '#3366ff' }, { id: 5, name: 'Beta' }]));
  api.getTickets.mockResolvedValue([]);
  api.getTicket.mockResolvedValue(detail());
  api.getTicketComments.mockResolvedValue([]);
  api.getAssignableUsers.mockResolvedValue([{ id: 7, name: 'Grace' }, { id: 9, name: 'Linus' }]);
});

describe('Tickets list', () => {
  const list = () => [
    ticket({ id: 1, title: 'Crash on start', severity: 4, status: 'open', assignee: null }),
    ticket({ id: 2, title: 'Typo in footer', severity: 1, status: 'closed' }),
    ticket({ id: 3, title: 'Slow search', severity: 2, status: 'in_progress', project: null, client: null, client_name: 'Walk-in' }),
  ];

  it('loading, then cards with text severity and status (never color alone)', async () => {
    api.getTickets.mockResolvedValue(list());
    renderWithProviders(<TicketsScreen />);
    expect(screen.getByLabelText('Loading tickets...')).toBeTruthy();
    expect(await screen.findByText('Crash on start')).toBeTruthy();
    const card = screen.getByTestId('ticket-1');
    expect(card).toHaveTextContent(/Critical/);
    expect(card).toHaveTextContent(/Open/);
    expect(card).toHaveTextContent(/Unassigned/);
    expect(card).toHaveTextContent(/Alpha · Acme/);
    expect(screen.getByTestId('ticket-3')).toHaveTextContent(/Walk-in/);
    expect(screen.getByLabelText(/^Crash on start\. Critical severity\. Open\. Unassigned/)).toBeTruthy();
  });

  it('with no project picked it asks for ALL tickets; with a picked project it sends project_id', async () => {
    const first = renderWithProviders(<TicketsScreen />);
    await screen.findByText('No tickets yet');
    expect(ticketsApi.buildTicketParams(api.getTickets.mock.calls[0]![0])).toEqual({});
    first.unmount(); // a mounted screen would re-render on the store change below, outside act()
    api.getTickets.mockClear();
    useProjectStore.setState({ selected: { id: 2, name: 'Alpha', color: null, status: null, product_id: null } });
    renderWithProviders(<TicketsScreen />);
    await waitFor(() => expect(api.getTickets).toHaveBeenCalled());
    expect(ticketsApi.buildTicketParams(api.getTickets.mock.calls[0]![0])).toEqual({ project_id: 2 });
  });

  it('search is client-side on the title and does not call the server', async () => {
    api.getTickets.mockResolvedValue(list());
    renderWithProviders(<TicketsScreen />);
    await screen.findByText('Crash on start');
    const calls = api.getTickets.mock.calls.length;
    // L6: deterministic debounce. Only setTimeout is faked, so nothing depends on machine speed.
    jest.useFakeTimers({
      doNotFake: ['Date', 'nextTick', 'setImmediate', 'queueMicrotask', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime'],
    });
    try {
      fireEvent.changeText(screen.getByLabelText('Search tickets'), 'FOOTER');
      expect(SEARCH_DEBOUNCE_MS).toBe(250);
      act(() => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
      });
      expect(screen.getByText('Crash on start')).toBeTruthy(); // not yet
      act(() => {
        jest.advanceTimersByTime(1);
      });
    } finally {
      jest.useRealTimers();
    }
    expect(screen.queryByText('Crash on start')).toBeNull();
    expect(screen.getByText('Typo in footer')).toBeTruthy();
    expect(api.getTickets.mock.calls.length).toBe(calls);
  });

  it('status chips show counts and filter; a second tap clears', async () => {
    api.getTickets.mockResolvedValue(list());
    renderWithProviders(<TicketsScreen />);
    await screen.findByText('Crash on start');
    expect(screen.getByRole('button', { name: 'All, 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Converted, 0' })).toBeTruthy();
    fireEvent.press(screen.getByTestId('ticket-chip-closed'));
    expect(screen.getByText('Typo in footer')).toBeTruthy();
    expect(screen.queryByText('Crash on start')).toBeNull();
    fireEvent.press(screen.getByTestId('ticket-chip-closed'));
    expect(screen.getByText('Crash on start')).toBeTruthy();
  });

  it('no match / empty / error with retry / stale data banner', async () => {
    api.getTickets.mockResolvedValue(list());
    const first = renderWithProviders(<TicketsScreen />);
    await screen.findByText('Crash on start');
    fireEvent.changeText(screen.getByLabelText('Search tickets'), 'zzz');
    expect(await screen.findByText('No tickets match', {}, { timeout: 5000 })).toBeTruthy();

    api.getTickets.mockRejectedValue(NETWORK);
    await act(async () => {
      await first.queryClient.refetchQueries({ queryKey: ['tickets'] });
    });
    expect(await screen.findByTestId('stale-banner')).toBeTruthy(); // data kept, banner shown
    first.unmount();

    api.getTickets.mockRejectedValueOnce(NETWORK);
    renderWithProviders(<TicketsScreen />);
    expect(await screen.findByText(NETWORK.message)).toBeTruthy();
    api.getTickets.mockResolvedValue(list());
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Crash on start')).toBeTruthy();
  });

  it('cards open the detail and New ticket opens the form', async () => {
    api.getTickets.mockResolvedValue(list());
    renderWithProviders(<TicketsScreen />);
    fireEvent.press(await screen.findByLabelText(/^Crash on start\./));
    expect(mockNav.navigate).toHaveBeenCalledWith('TicketDetail', { ticketId: 1 });
    fireEvent.press(screen.getByRole('button', { name: 'New ticket' }));
    expect(mockNav.navigate).toHaveBeenCalledWith('TicketCreate');
  });
});

describe('Ticket detail', () => {
  const render = () => renderWithProviders(<TicketDetailScreen />);

  it('shows the facts and the plain-text description exactly as written (no HTML rendering)', async () => {
    render();
    expect(await screen.findByText('Login broken')).toBeTruthy();
    expect(screen.getByText('High severity')).toBeTruthy(); // severity 3, as text
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByTestId('ticket-assignee')).toHaveTextContent('Grace');
    expect(screen.getByTestId('ticket-description')).toHaveTextContent(/Cannot log in <b>at all<\/b>/);
    expect(screen.getByTestId('ticket-description')).toHaveTextContent(/second line/);
  });

  it('an invalid id shows an error and never calls the server', async () => {
    mockParams = { ticketId: 'abc' };
    render();
    expect(await screen.findByText('That ticket link is not valid.')).toBeTruthy();
    expect(api.getTicket).not.toHaveBeenCalled();
    expect(api.getTicketComments).not.toHaveBeenCalled();
  });

  it('404 and 403 are verbatim; a failed refetch keeps the ticket with a banner', async () => {
    api.getTicket.mockRejectedValueOnce(new AppError({ kind: 'not_found', status: 404, message: 'Ticket not found' }));
    const first = render();
    expect(await screen.findByText('Ticket not found')).toBeTruthy();
    first.unmount();

    api.getTicket.mockResolvedValue(detail());
    const second = render();
    await screen.findByText('Login broken');
    api.getTicket.mockRejectedValue(NETWORK);
    await act(async () => {
      await second.queryClient.refetchQueries({ queryKey: ['ticket', 12] });
    });
    expect(screen.getByText('Login broken')).toBeTruthy();
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
  });

  describe('status changes', () => {
    it('open ticket offers In progress and Closed (not Converted); sends ONLY {status}', async () => {
      api.updateTicket.mockResolvedValue(detail({ status: 'in_progress' }));
      render();
      await screen.findByText('Login broken');
      expect(screen.getByTestId('ticket-status-in_progress')).toBeTruthy();
      expect(screen.getByTestId('ticket-status-closed')).toBeTruthy();
      expect(screen.queryByTestId('ticket-status-converted')).toBeNull();
      expect(screen.queryByTestId('ticket-status-open')).toBeNull();
      fireEvent.press(screen.getByTestId('ticket-status-in_progress'));
      await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith(12, { status: 'in_progress' }));
      expect(await screen.findByText('Ticket updated')).toBeTruthy();
    });

    it('a CONVERTED ticket can only be closed, and says so', async () => {
      api.getTicket.mockResolvedValue(detail({ status: 'converted', tasks: [{ id: 5, title: 'Task', status: 'NOT_STARTED', priority: 'HIGH' }] }));
      render();
      expect(await screen.findByText('Converted tickets can only be closed.')).toBeTruthy();
      expect(screen.getByTestId('ticket-status-closed')).toBeTruthy();
      expect(screen.queryByTestId('ticket-status-open')).toBeNull();
      expect(screen.queryByTestId('ticket-status-in_progress')).toBeNull();
    });

    it('a server rejection is shown verbatim', async () => {
      api.updateTicket.mockRejectedValue(new AppError({ kind: 'validation', status: 400, message: 'Invalid status' }));
      render();
      await screen.findByText('Login broken');
      fireEvent.press(screen.getByTestId('ticket-status-closed'));
      expect(await screen.findByText('Invalid status')).toBeTruthy();
    });
  });

  describe('assignee', () => {
    it('lists people by NAME only and sends only {assigned_to}', async () => {
      api.updateTicket.mockResolvedValue(detail({ assignee: { id: 9, name: 'Linus' } }));
      render();
      await screen.findByText('Login broken');
      fireEvent.press(screen.getByRole('button', { name: 'Change assignee' }));
      expect(await screen.findByRole('radio', { name: 'Linus' })).toBeTruthy();
      expect(screen.queryByText(/@/)).toBeNull();
      fireEvent.press(screen.getByRole('radio', { name: 'Linus' }));
      await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith(12, { assigned_to: 9 }));
    });

    it('Unassigned sends null; the current assignee is marked selected', async () => {
      api.updateTicket.mockResolvedValue(detail({ assignee: null }));
      render();
      await screen.findByText('Login broken');
      fireEvent.press(screen.getByRole('button', { name: 'Change assignee' }));
      const grace = await screen.findByRole('radio', { name: 'Grace' });
      expect(grace.props.accessibilityState.selected).toBe(true);
      fireEvent.press(screen.getByRole('radio', { name: 'Unassigned' }));
      await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith(12, { assigned_to: null }));
    });

    it('a failed people list shows an error with retry', async () => {
      api.getAssignableUsers.mockRejectedValueOnce(NETWORK);
      render();
      await screen.findByText('Login broken');
      fireEvent.press(screen.getByRole('button', { name: 'Change assignee' }));
      expect(await screen.findByText(NETWORK.message)).toBeTruthy();
    });
  });

  describe('convert to task (deferred)', () => {
    it('explains that conversion is web-only, only when it would otherwise be offered', async () => {
      render();
      expect(await screen.findByTestId('convert-note')).toHaveTextContent(/only available on the web/);
      expect(screen.queryByRole('button', { name: /convert/i })).toBeNull();
    });
    it('no note for a converted ticket or one with linked tasks', async () => {
      api.getTicket.mockResolvedValue(detail({ status: 'closed', tasks: [{ id: 5, title: 'Linked', status: 'PASS', priority: 'LOW' }] }));
      render();
      await screen.findByText('Linked');
      expect(screen.queryByTestId('convert-note')).toBeNull();
    });
  });

  it('linked tasks open Task Detail', async () => {
    api.getTicket.mockResolvedValue(detail({ tasks: [{ id: 5, title: 'Fix the login', status: 'IN_PROGRESS', priority: 'HIGH' }] }));
    render();
    fireEvent.press(await screen.findByLabelText('Open task Fix the login'));
    expect(mockNav.navigate).toHaveBeenCalledWith('TaskDetail', { taskId: 5 });
  });

  describe('attachments (list and open only; no upload)', () => {
    it('opens http(s) files, and refuses anything else', async () => {
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      api.getTicket.mockResolvedValue(
        detail({
          attachments: [
            { filename: 'shot.png', url: 'https://files.example/shot.png' },
            { filename: 'evil.html', url: 'javascript:alert(1)' },
            { filename: 'noscheme', url: 'files.example/x' },
            { filename: 'private', url: null },
          ],
        }),
      );
      render();
      fireEvent.press(await screen.findByLabelText('Open shot.png'));
      expect(open).toHaveBeenCalledWith('https://files.example/shot.png');
      expect(screen.getByLabelText('evil.html, cannot be opened here')).toBeTruthy();
      expect(screen.getByLabelText('noscheme, cannot be opened here')).toBeTruthy();
      expect(screen.getByLabelText('private, cannot be opened here')).toBeTruthy();
      expect(open).toHaveBeenCalledTimes(1);
      open.mockRestore();
    });
  });

  describe('notes (comments)', () => {
    it('adds the note, shows the current user as author (the 201 has none) and clears the box', async () => {
      api.addTicketComment.mockImplementation(async (_id, content, author) => {
        const c = { id: 90, content, created_at: '2026-10-10T10:00:00Z', author };
        api.getTicketComments.mockResolvedValue([c]);
        return c;
      });
      render();
      await screen.findByText('Login broken');
      fireEvent.changeText(screen.getByLabelText('Add a note'), '  Called the client  ');
      fireEvent.press(screen.getByRole('button', { name: 'Post note' }));
      await waitFor(() => expect(api.addTicketComment).toHaveBeenCalledWith(12, 'Called the client', { id: 7, name: 'Grace Hopper' }));
      const c = await screen.findByTestId('ticket-comment-90');
      expect(c).toHaveTextContent(/Grace Hopper/);
      expect(c).toHaveTextContent(/Called the client/);
      expect(screen.getByLabelText('Add a note').props.value).toBe('');
    });

    it('a 422 is verbatim and the draft is kept', async () => {
      api.addTicketComment.mockRejectedValue(new AppError({ kind: 'validation', status: 422, message: 'Invalid value' }));
      render();
      await screen.findByText('Login broken');
      fireEvent.changeText(screen.getByLabelText('Add a note'), 'draft');
      fireEvent.press(screen.getByRole('button', { name: 'Post note' }));
      expect(await screen.findByTestId('ticket-comment-error')).toHaveTextContent('Invalid value');
      expect(screen.getByLabelText('Add a note').props.value).toBe('draft');
    });

    it('is capped at 5000 characters and Post is disabled while empty', async () => {
      render();
      await screen.findByText('Login broken');
      expect(screen.getByLabelText('Add a note').props.maxLength).toBe(5000);
      expect(screen.getByRole('button', { name: 'Post note' }).props.accessibilityState.disabled).toBe(true);
      fireEvent.changeText(screen.getByLabelText('Add a note'), '   ');
      expect(screen.getByRole('button', { name: 'Post note' }).props.accessibilityState.disabled).toBe(true);
    });

    it('notes list oldest first and keeps stale notes when a refetch fails', async () => {
      api.getTicketComments.mockResolvedValue(
        ticketsApi.parseTicketComments([
          { id: 1, content: 'first', created_at: '2026-10-01T10:00:00Z', author: { id: 2, name: 'Ada' } },
          { id: 2, content: 'second', created_at: '2026-10-02T10:00:00Z', author: { id: 3, name: 'Linus' } },
        ]),
      );
      const r = render();
      expect(await screen.findByText('first')).toBeTruthy();
      expect(screen.getAllByTestId(/^ticket-comment-\d/).map((n) => n.props.testID)).toEqual(['ticket-comment-1', 'ticket-comment-2']);
      api.getTicketComments.mockRejectedValue(NETWORK);
      await act(async () => {
        await r.queryClient.refetchQueries({ queryKey: ['ticket-comments', 12] });
      });
      expect(screen.getByText('first')).toBeTruthy();
      expect(await screen.findByTestId('comments-stale')).toBeTruthy();
    });
  });
});

describe('New ticket', () => {
  const render = () => renderWithProviders(<TicketCreateScreen />);
  const fill = async () => {
    fireEvent.changeText(screen.getByLabelText('Title'), '  Broken page ');
    fireEvent.changeText(screen.getByLabelText('Description'), ' It crashes ');
    fireEvent.press(screen.getByRole('button', { name: /^Project:/ }));
    fireEvent.press(await screen.findByRole('radio', { name: 'Beta' }));
  };

  it('shows inline errors for every missing field and sends nothing', async () => {
    render();
    fireEvent.press(screen.getByRole('button', { name: 'Create ticket' }));
    expect(await screen.findByText('Title required')).toBeTruthy();
    expect(screen.getByText('Description required')).toBeTruthy();
    expect(screen.getByText('Select the project this ticket is about')).toBeTruthy();
    expect(api.createTicket).not.toHaveBeenCalled();
  });

  it('the project selector lists every project from /projects, and defaults to the picker project', async () => {
    useProjectStore.setState({ selected: { id: 2, name: 'Alpha', color: null, status: null, product_id: null } });
    render();
    expect(screen.getByRole('button', { name: /Project: Alpha/ })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /^Project:/ }));
    expect(await screen.findByRole('radio', { name: 'Beta' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Alpha' }).props.accessibilityState.selected).toBe(true);
  });

  it('creates with JSON fields (default severity Medium) and replaces the screen with the detail', async () => {
    api.createTicket.mockResolvedValue(detail({ id: 77 }));
    render();
    await fill();
    fireEvent.press(screen.getByTestId('severity-4'));
    fireEvent.press(screen.getByRole('button', { name: 'Create ticket' }));
    await waitFor(() => expect(api.createTicket).toHaveBeenCalledTimes(1));
    expect(api.createTicket.mock.calls[0]![0]).toMatchObject({ title: '  Broken page ', description: ' It crashes ', project_id: 5, severity: 4 });
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('TicketDetail', { ticketId: 77 }));
  });

  it('server errors (422 / 404 / 502) are verbatim and the form keeps its input', async () => {
    api.createTicket.mockRejectedValue(new AppError({ kind: 'validation', status: 422, message: 'Severity 1-4 required' }));
    render();
    await fill();
    fireEvent.press(screen.getByRole('button', { name: 'Create ticket' }));
    expect(await screen.findByTestId('ticket-create-error')).toHaveTextContent('Severity 1-4 required');
    expect(screen.getByLabelText('Title').props.value).toBe('  Broken page ');
    expect(mockNav.replace).not.toHaveBeenCalled();
  });

  it('a project list failure shows a retry inside the picker, not a crash', async () => {
    projects.getProjects.mockRejectedValue(NETWORK);
    render();
    fireEvent.press(screen.getByRole('button', { name: /^Project:/ }));
    expect(await screen.findByText(NETWORK.message)).toBeTruthy();
  });
});
