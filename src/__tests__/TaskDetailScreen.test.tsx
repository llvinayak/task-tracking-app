import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ScrollView, Text as RNText } from 'react-native';
import { Alert, Linking, type AlertButton } from 'react-native';

import { AppError } from '@/api/errors';
import {
  parseAssignees,
  parseAttachments,
  parseComments,
  parseProjects,
  parseStatusConfig,
  parseTaskDetail,
  parseTaskPermissions,
  parseTeam,
  type TaskDetail,
} from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import { TaskDetailScreen } from '@/features/tasks/TaskDetailScreen';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider, setNowProvider } from '@/utils/dates';
import { labelInNameViolations } from '@/test/a11y';

const mockNav = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { taskId: 15 } }),
  useIsFocused: () => true,
}));
jest.mock('@/api/tasksApi', () => ({
  ...jest.requireActual('@/api/tasksApi'),
  getTask: jest.fn(),
  getTaskPermissions: jest.fn(),
  getTaskComments: jest.fn(),
  addTaskComment: jest.fn(),
  getTaskAssignees: jest.fn(),
  addTaskAssignee: jest.fn(),
  removeTaskAssignee: jest.fn(),
  setPrimaryAssignee: jest.fn(),
  getTaskAttachments: jest.fn(),
  changeTaskStatus: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const api = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const detail = (over: Record<string, unknown> = {}): TaskDetail =>
  parseTaskDetail({
    ...rawTask(),
    statusLogs: [
      { id: 1, from_status: 'NOT_STARTED', to_status: 'IN_PROGRESS', notes: 'Started', created_at: '2026-10-01T09:00:00.000Z', changedBy: { id: 7, name: 'Grace Hopper' } },
      { id: 2, from_status: 'IN_PROGRESS', to_status: 'DEV_DONE', created_at: '2026-10-05T09:00:00.000Z', changedBy: { id: 7, name: 'Grace Hopper' } },
    ],
    attachments: [{ id: 5, original_name: 'spec.pdf', file_size: 2048, s3_url: 'https://old.example/spec.pdf' }],
    ...over,
  }) as TaskDetail;

const perms = (canEdit: boolean, canAssign = false) =>
  parseTaskPermissions({ canEdit, canAssign, canDelete: false, isAssignee: canEdit });

/** People / History / Files live under the "More" tab (plan 7.4): open More first, then the section. */
const openTab = (name: string) => {
  if (['People', 'History', 'Files'].includes(name)) fireEvent.press(screen.getByRole('tab', { name: 'More' }));
  fireEvent.press(screen.getByRole('tab', { name }));
};
const render = () => renderWithProviders(<TaskDetailScreen />);

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10));
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7, name: 'Grace Hopper' }) });
  api.getTask.mockResolvedValue(detail());
  api.getTaskPermissions.mockResolvedValue(perms(true));
  api.getTaskComments.mockResolvedValue([]);
  api.getTaskAssignees.mockResolvedValue([]);
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  projects.getProjects.mockResolvedValue(parseProjects([]));
  projects.getProjectTeam.mockResolvedValue(parseTeam({ members: [] }));
});
afterEach(resetNowProvider);

describe('TaskDetailScreen states', () => {
  it('loading then header + overview', async () => {
    render();
    expect(screen.getByLabelText('Loading task...')).toBeTruthy();
    expect(await screen.findByText('Fix login redirect')).toBeTruthy();
    expect(screen.getByText(/ALPH-0015 · Alpha Project/)).toBeTruthy();
    expect(screen.getByText('In Progress')).toBeTruthy();
  });

  it.each([
    [404, 'not_found', 'Task not found'],
    [403, 'forbidden', 'You are not a member of this project'],
  ] as const)('shows the %i message verbatim with retry and a way back', async (status, kind, message) => {
    api.getTask.mockRejectedValue(new AppError({ kind, status, message }));
    render();
    expect(await screen.findByText(message)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(mockNav.goBack).toHaveBeenCalled();
    api.getTask.mockResolvedValue(detail());
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Fix login redirect')).toBeTruthy();
    expect(useAuthStore.getState().status).toBe('authenticated'); // 403/404 never log out
  });
});

describe('Overview and description', () => {
  it('renders the whitelisted description and drops scripts/images/bad links', async () => {
    api.getTask.mockResolvedValue(
      detail({
        description:
          '<p>Redirect <strong>loops</strong> <a href="javascript:alert(1)">bad</a> <a href="https://ok.example">good</a></p><script>alert(1)</script><img src="x" onerror="y">',
      }),
    );
    render();
    expect(await screen.findByText('loops')).toBeTruthy();
    expect(screen.queryByText(/alert/)).toBeNull();
    // Link text that hides the destination shows the real host next to it.
    expect(screen.getByText('good (ok.example)').props.accessibilityRole).toBe('link');
    expect(screen.getByText('bad').props.accessibilityRole).toBeUndefined(); // link dropped, text kept

    // ...and asks before opening it.
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(screen.getByText('good (ok.example)'));
    expect(open).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]![1]).toContain('ok.example');
    const buttons = alert.mock.calls[0]![2] as AlertButton[];
    await act(async () => buttons.find((b) => b.text === 'Open')?.onPress?.());
    expect(open).toHaveBeenCalledWith('https://ok.example');
    open.mockRestore();
    alert.mockRestore();
  });

  it('shows a placeholder for an empty description (<p>&nbsp;</p>)', async () => {
    api.getTask.mockResolvedValue(detail({ description: '<p>&nbsp;</p>' }));
    render();
    expect(await screen.findByText('No description.')).toBeTruthy();
  });

  it('parent task and subtasks navigate to their own detail', async () => {
    api.getTask.mockResolvedValue(
      detail({
        parentTask: { id: 3, title: 'Parent epic', status: 'IN_PROGRESS' },
        subtasks: [{ id: 21, title: 'Sub A', status: 'PASS' }],
        subtaskCount: 1,
        completedSubtaskCount: 1,
      }),
    );
    render();
    fireEvent.press(await screen.findByLabelText('Open parent task Parent epic'));
    expect(mockNav.push).toHaveBeenCalledWith('TaskDetail', { taskId: 3 });
    fireEvent.press(screen.getByLabelText('Open subtask Sub A, Pass'));
    expect(mockNav.push).toHaveBeenCalledWith('TaskDetail', { taskId: 21 });
  });

  it('formats dates as local calendar days', async () => {
    api.getTask.mockResolvedValue(detail({ due_date: '2026-10-12', start_date: '2026-10-01', estimated_hours: '8' }));
    render();
    expect(await screen.findByText('12 Oct')).toBeTruthy();
    expect(screen.getByText('1 Oct')).toBeTruthy();
    expect(screen.getByText('8h')).toBeTruthy();
  });
});

describe('Status area (authoritative /permissions, allowed transitions only)', () => {
  it('shows Move only when the server says canEdit, listing only allowed targets', async () => {
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Move to...' }));
    expect(await screen.findByRole('button', { name: 'Move to Dev Done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move to Not Started' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move to Pass' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to Deferred' })).toBeNull();
  });

  it('hides Move when canEdit is false', async () => {
    api.getTaskPermissions.mockResolvedValue(perms(false));
    render();
    await screen.findByText('Fix login redirect');
    await waitFor(() => expect(api.getTaskPermissions).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Move to...' })).toBeNull();
  });

  it('hides Move while permissions are unknown or failed (never optimistic about rights)', async () => {
    api.getTaskPermissions.mockRejectedValue(new AppError({ kind: 'server', message: 'x' }));
    render();
    await screen.findByText('Fix login redirect');
    await waitFor(() => expect(api.getTaskPermissions).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Move to...' })).toBeNull();
  });

  it('hides Move for a terminal status even when editable', async () => {
    api.getTask.mockResolvedValue(detail({ status: 'PASS' }));
    render();
    await screen.findByText('Fix login redirect');
    await waitFor(() => expect(api.getTaskPermissions).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Move to...' })).toBeNull();
  });

  it('a rejected move rolls back and shows the server message', async () => {
    api.changeTaskStatus.mockRejectedValue(
      new AppError({ kind: 'forbidden', status: 403, message: 'You do not have permission to edit this task.' }),
    );
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Move to...' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Move to Dev Done' }));
    expect(await screen.findByText('You do not have permission to edit this task.')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0));
    expect(screen.queryByText('Dev Done')).toBeNull();
  });
});

describe('Comments', () => {
  it('empty state, and posting is blocked for empty / whitespace-only text', async () => {
    render();
    await screen.findByText('Fix login redirect');
    openTab('Comments');
    expect(await screen.findByText('No comments yet')).toBeTruthy();
    const post = screen.getByRole('button', { name: 'Post comment' });
    expect(post.props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Add a comment'), '   \n  ');
    fireEvent.press(post);
    expect(api.addTaskComment).not.toHaveBeenCalled();
  });

  it('lists comments oldest first, as plain text with newlines preserved', async () => {
    api.getTaskComments.mockResolvedValue(
      parseComments([
        { id: 2, content: 'second <b>not bold</b>', created_at: '2026-10-02T10:00:00Z', author: { id: 8, name: 'Linus' } },
        { id: 1, content: 'first\nline two', created_at: '2026-10-01T10:00:00Z', author: { id: 9, name: 'Ada' } },
      ]),
    );
    render();
    await screen.findByText('Fix login redirect');
    openTab('Comments');
    const first = await screen.findByTestId('comment-1');
    const second = screen.getByTestId('comment-2');
    const all = screen.getAllByTestId(/comment-\d/);
    expect(all[0]).toBe(first);
    expect(all[1]).toBe(second);
    expect(screen.getByText('first\nline two')).toBeTruthy();
    expect(screen.getByText('second <b>not bold</b>')).toBeTruthy(); // never rendered as HTML
  });

  it('posting trims, adds the comment with the CURRENT USER as author and clears the box', async () => {
    api.addTaskComment.mockImplementation(async (_id, content, author) => {
      const created = { id: 77, content, created_at: '2026-10-10T10:00:00Z', author };
      // The server now includes it (with its author) on the follow-up refetch.
      api.getTaskComments.mockResolvedValue([created]);
      return created;
    });
    render();
    await screen.findByText('Fix login redirect');
    openTab('Comments');
    fireEvent.changeText(await screen.findByLabelText('Add a comment'), '  Looks good  ');
    fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(api.addTaskComment).toHaveBeenCalledWith(15, 'Looks good', { id: 7, name: 'Grace Hopper' }));
    const c = await screen.findByTestId('comment-77');
    expect(c).toHaveTextContent(/Grace Hopper/);
    expect(c).toHaveTextContent(/Looks good/);
    expect(screen.getByLabelText('Add a comment').props.value).toBe('');
  });

  it('failure shows an error and keeps the draft (the web is silent here)', async () => {
    api.addTaskComment.mockRejectedValue(
      new AppError({ kind: 'forbidden', status: 403, message: 'You are not a member of this project' }),
    );
    render();
    await screen.findByText('Fix login redirect');
    openTab('Comments');
    fireEvent.changeText(await screen.findByLabelText('Add a comment'), 'Will fail');
    fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));
    expect(await screen.findByTestId('comment-error')).toHaveTextContent('You are not a member of this project');
    expect(screen.getByLabelText('Add a comment').props.value).toBe('Will fail');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});

describe('People / assignee management (UI gating is a courtesy, not security)', () => {
  const assignees = parseAssignees([
    { id: 1, user_id: 7, role: 'DEV', is_primary: true, user: { id: 7, name: 'Grace Hopper' } },
    { id: 2, user_id: 8, role: 'DEV', is_primary: false, user: { id: 8, name: 'Linus T' } },
  ]);

  it('read-only users see people but no controls', async () => {
    api.getTaskAssignees.mockResolvedValue(assignees);
    api.getTaskPermissions.mockResolvedValue(perms(true, false));
    render();
    await screen.findByText('Fix login redirect');
    openTab('People');
    expect(await screen.findByText('Linus T')).toBeTruthy();
    await waitFor(() => expect(api.getTaskPermissions).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Add assignee' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(screen.queryByRole('button', { name: /primary$/ })).toBeNull();
  });

  it('canAssign shows add / remove / make-primary; only non-primary gets make-primary', async () => {
    api.getTaskAssignees.mockResolvedValue(assignees);
    api.getTaskPermissions.mockResolvedValue(perms(true, true));
    render();
    await screen.findByText('Fix login redirect');
    openTab('People');
    expect(await screen.findByRole('button', { name: 'Add assignee' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Grace Hopper' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make primary: Linus T' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make primary: Grace Hopper' })).toBeNull();

    api.setPrimaryAssignee.mockResolvedValue({});
    fireEvent.press(screen.getByRole('button', { name: 'Make primary: Linus T' }));
    await waitFor(() => expect(api.setPrimaryAssignee).toHaveBeenCalledWith(15, 2));
  });

  it('remove asks for confirmation first', async () => {
    api.getTaskAssignees.mockResolvedValue(assignees);
    api.getTaskPermissions.mockResolvedValue(perms(true, true));
    api.removeTaskAssignee.mockResolvedValue({});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render();
    await screen.findByText('Fix login redirect');
    openTab('People');
    fireEvent.press(await screen.findByRole('button', { name: 'Remove Linus T' }));
    expect(api.removeTaskAssignee).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2] as AlertButton[];
    await act(async () => buttons.find((b) => b.text === 'Remove')?.onPress?.());
    await waitFor(() => expect(api.removeTaskAssignee).toHaveBeenCalledWith(15, 2));
    alert.mockRestore();
  });

  it('candidates exclude clients and deactivated users; 409 message is shown verbatim', async () => {
    api.getTaskAssignees.mockResolvedValue([]);
    api.getTaskPermissions.mockResolvedValue(perms(true, true));
    projects.getProjectTeam.mockResolvedValue(
      parseTeam({
        members: [
          { id: 1, user_id: 10, user: { id: 10, name: 'Dev Dana', role_id: 5, is_active: true } },
          { id: 2, user_id: 11, user: { id: 11, name: 'Client Carl', role_id: 6, is_active: true } },
          { id: 3, user_id: 12, user: { id: 12, name: 'Gone Gary', role_id: 5, is_active: false } },
        ],
      }),
    );
    api.addTaskAssignee.mockRejectedValue(
      new AppError({ kind: 'conflict', status: 409, message: 'Dev Dana is already assigned as DEV on this task.' }),
    );
    render();
    await screen.findByText('Fix login redirect');
    openTab('People');
    fireEvent.press(await screen.findByRole('button', { name: 'Add assignee' }));

    expect(await screen.findByRole('button', { name: 'Assign Dev Dana as Developer' })).toBeTruthy();
    expect(screen.queryByText('Client Carl')).toBeNull();
    expect(screen.queryByText('Gone Gary')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Assign Dev Dana as Developer' }));
    await waitFor(() => expect(api.addTaskAssignee).toHaveBeenCalledWith(15, { user_id: 10, role: 'DEV' }));
    expect((await screen.findAllByText('Dev Dana is already assigned as DEV on this task.')).length).toBeGreaterThan(0);
  });
});

describe('History and attachments', () => {
  it('history lists status logs newest first with who and notes', async () => {
    render();
    await screen.findByText('Fix login redirect');
    openTab('History');
    const first = await screen.findByText('In Progress → Dev Done');
    const second = screen.getByText('Not Started → In Progress');
    const all = screen.getAllByText(/→/);
    expect(all[0]).toBe(first);
    expect(all[1]).toBe(second);
    expect(screen.getByText('Started')).toBeTruthy();
  });

  it('opening an attachment re-fetches a fresh signed URL (they expire) and opens it externally', async () => {
    api.getTaskAttachments.mockResolvedValue(
      parseAttachments([{ id: 5, original_name: 'spec.pdf', file_size: 2048, s3_url: 'https://fresh.example/spec.pdf?sig=2' }]),
    );
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render();
    await screen.findByText('Fix login redirect');
    openTab('Files');
    fireEvent.press(await screen.findByLabelText('Open spec.pdf, 2.0 KB'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://fresh.example/spec.pdf?sig=2'));
    expect(api.getTaskAttachments).toHaveBeenCalledWith(15);
    expect(open).not.toHaveBeenCalledWith('https://old.example/spec.pdf');
    open.mockRestore();
  });

  it('refuses to open a non-http(s) attachment URL', async () => {
    api.getTaskAttachments.mockResolvedValue(
      parseAttachments([{ id: 5, original_name: 'spec.pdf', s3_url: 'javascript:alert(1)' }]),
    );
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render();
    await screen.findByText('Fix login redirect');
    openTab('Files');
    fireEvent.press(await screen.findByLabelText(/^Open spec\.pdf/));
    expect(await screen.findByText('This file is not available to open right now.')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('shows empty states', async () => {
    api.getTask.mockResolvedValue(detail({ statusLogs: [], attachments: [] }));
    render();
    await screen.findByText('Fix login redirect');
    openTab('History');
    expect(await screen.findByText('No history yet')).toBeTruthy();
    openTab('Files');
    expect(await screen.findByText('No attachments')).toBeTruthy();
  });
});

describe('Stage 2 layout: action row, sticky tab strip, More', () => {
  it('shows Overview, Time, Comments and More; QA only when the task is in the QA flow (or /qa is granted)', async () => {
    render();
    await screen.findByText('Fix login redirect');
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Overview', 'Time', 'Comments', 'More']);
    expect(screen.queryByRole('tab', { name: 'People' })).toBeNull(); // People / History / Files are inside More
  });

  it('a task that is Ready for QA gets the QA tab', async () => {
    api.getTask.mockResolvedValue(detail({ status: 'READY_FOR_QA' }));
    render();
    await screen.findByText('Fix login redirect');
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Overview', 'Time', 'QA', 'Comments', 'More']);
  });

  it('the tab strip is a DIRECT child of the scroll view and is the sticky header', async () => {
    render();
    await screen.findByText('Fix login redirect');
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.stickyHeaderIndices).toEqual([1]); // [head, strip, body, sheet]
    const kids = React.Children.toArray(scroll.props.children as React.ReactNode) as React.ReactElement[];
    expect((kids[1]!.type as { name?: string }).name).toBe('TabStrip');
  });

  it('the status badge and Move to... share one action row; the title is xl', async () => {
    render();
    await screen.findByText('Fix login redirect');
    expect(screen.getByRole('button', { name: 'Move to...' })).toBeTruthy();
    const title = screen.getByText('Fix login redirect');
    expect(Object.assign({}, ...[title.props.style].flat(3).filter(Boolean)).fontSize).toBe(18);
  });

  it('read-only people: a notice explains why the controls are missing', async () => {
    api.getTaskPermissions.mockResolvedValue(perms(false, false));
    render();
    await screen.findByText('Fix login redirect');
    openTab('People');
    expect(await screen.findByText('Only people with edit access can change assignees.')).toBeTruthy();
  });

  it('a blocked task shows the banner above the description', async () => {
    api.getTask.mockResolvedValue(detail({ is_blocked: true, blocker_description: 'Waiting on API' }));
    render();
    await screen.findByText('Blocked: Waiting on API');
    const texts = screen.UNSAFE_getAllByType(RNText).map((n: { props: { children?: unknown } }) => [n.props.children].flat().filter((c) => typeof c === 'string').join(''));
    expect(texts.indexOf('Blocked: Waiting on API')).toBeLessThan(texts.indexOf('DESCRIPTION'));
  });
});

describe('Pilot fixes (Task Detail)', () => {
  it('a meta line under the title: due date, Dev and QA as text', async () => {
    api.getTask.mockResolvedValue(detail({ due_date: '2026-10-12', dev_owner_id: 7, devOwner: { id: 7, name: 'Priya' }, qa_owner_id: 8, qaOwner: { id: 8, name: 'Rahul' } }));
    render();
    await screen.findByText('Fix login redirect');
    expect(screen.getByTestId('task-meta')).toHaveTextContent('Due 12 Oct · Dev: Priya · QA: Rahul');
  });

  it('the pinned tab strip bleeds out to the screen edges (no gutters)', async () => {
    render();
    await screen.findByText('Fix login redirect');
    const strip = screen.UNSAFE_root.findAll((n: { props: { accessibilityRole?: string } }) => n.props.accessibilityRole === 'tablist')[0]!;
    expect(Object.assign({}, ...[strip.props.style].flat(3).filter(Boolean)).marginHorizontal).toBe(-16);
  });

  it('People roles read as words (Developer, QA, Support, Reviewer), not upper-case codes', async () => {
    api.getTaskPermissions.mockResolvedValue(perms(true, true));
    render();
    await screen.findByText('Fix login redirect');
    openTab('People');
    fireEvent.press(await screen.findByRole('button', { name: 'Add assignee' }));
    for (const r of ['Developer', 'QA', 'Support', 'Reviewer']) expect(screen.getByRole('radio', { name: r })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'DEV' })).toBeNull();
  });

  it('the comment composer has a counter once it is nearly full', async () => {
    render();
    await screen.findByText('Fix login redirect');
    openTab('Comments');
    fireEvent.changeText(await screen.findByLabelText('Add a comment'), 'x'.repeat(4100));
    expect(screen.getByText('4100/5000')).toBeTruthy();
  });
});


describe('Label in Name on the whole Task Detail screen', () => {
  it('header, tabs, Overview, More/People with the assignee sheet, Comments', async () => {
    api.getTaskPermissions.mockResolvedValue(perms(true, true));
    api.getTask.mockResolvedValue(detail({ status: 'READY_FOR_QA', subtasks: [{ id: 3, title: 'Sub', status: 'NOT_STARTED' }], subtaskCount: 1 }));
    render();
    await screen.findByText('Fix login redirect');
    expect(labelInNameViolations()).toEqual([]);
    openTab('People');
    fireEvent.press(await screen.findByRole('button', { name: 'Add assignee' }));
    expect(labelInNameViolations()).toEqual([]);
    openTab('Comments');
    expect(labelInNameViolations()).toEqual([]);
  });
});
