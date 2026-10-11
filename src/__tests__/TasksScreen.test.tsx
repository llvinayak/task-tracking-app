import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ScrollView, SectionList } from 'react-native';

import { AppError } from '@/api/errors';
import { parseProjects, parseStatusConfig, parseTasks } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import { TasksScreen } from '@/features/tasks/TasksScreen';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { menu, rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider, setNowProvider } from '@/utils/dates';
import * as menuApi from '@/api/menuApi';
import { labelInNameViolations } from '@/test/a11y';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, push: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/api/tasksApi', () => ({
  ...jest.requireActual('@/api/tasksApi'),
  getTasks: jest.fn(),
  changeTaskStatus: jest.fn(),
}));
jest.mock('@/api/projectsApi');
jest.mock('@/api/menuApi');

const api = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const menus = menuApi as jest.Mocked<typeof menuApi>;

const tasks = (...rows: Record<string, unknown>[]) => parseTasks(rows);

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10, 0));
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7 }) });
  useProjectStore.setState({ selected: null });
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  projects.getProjects.mockResolvedValue(
    parseProjects([
      { id: 3, name: 'Alpha Project', color: '#3366ff', status: 'active' },
      { id: 4, name: 'Beta', color: '#ff6633', status: 'on_hold' },
    ]),
  );
  projects.getProjectTeam.mockResolvedValue({ project_id: 3, can_manage: false, members: [] });
  menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Projects', menu_url: '/projects' })]);
});
afterEach(resetNowProvider);

const render = () => renderWithProviders(<TasksScreen />);

describe('TasksScreen states', () => {
  it('shows loading, then groups by status (config order), hides empty groups and shows counts', async () => {
    api.getTasks.mockResolvedValue(
      tasks(
        rawTask({ id: 1, title: 'Done thing', status: 'PASS' }),
        rawTask({ id: 2, title: 'Started thing', status: 'IN_PROGRESS' }),
        rawTask({ id: 3, title: 'Another started', status: 'IN_PROGRESS' }),
      ),
    );
    render();
    expect(screen.getByLabelText('Loading tasks...')).toBeTruthy();
    expect(await screen.findByText('Started thing')).toBeTruthy();

    const names = screen
      .getAllByText(/^(In Progress|Pass|Not Started)$/)
      .map((n) => n.props.children as string);
    expect(names[0]).toBe('In Progress'); // config order: In Progress before Pass
    expect(names.indexOf('Pass')).toBeGreaterThan(names.indexOf('In Progress'));
    expect(names).not.toContain('Not Started'); // empty group hidden
    expect(screen.getByText(/^3 tasks/)).toBeTruthy(); // "3 tasks · Grouped by status" (scrolls with the list)
  });

  it('empty list -> empty state (no filters)', async () => {
    api.getTasks.mockResolvedValue([]);
    render();
    expect(await screen.findByText('No tasks yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('error -> message with retry, retry reloads', async () => {
    api.getTasks.mockRejectedValueOnce(new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side.' }));
    render();
    expect(await screen.findByText('Something went wrong on our side.')).toBeTruthy();
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 9, title: 'Recovered' })));
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Recovered')).toBeTruthy();
  });
});

describe('TasksScreen filters', () => {
  it('debounces search (~300ms) and sends only non-empty params', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask()));
    render();
    await screen.findByText('Fix login redirect');
    expect(tasksApi.buildTaskParams(api.getTasks.mock.calls[0]![0])).toEqual({});

    api.getTasks.mockClear();
    fireEvent.changeText(screen.getByLabelText('Search tasks'), '#1');
    fireEvent.changeText(screen.getByLabelText('Search tasks'), '#15');
    expect(api.getTasks).not.toHaveBeenCalled(); // not yet: debounced
    await waitFor(() => expect(api.getTasks).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(tasksApi.buildTaskParams(api.getTasks.mock.calls[0]![0])).toEqual({ search: '#15' });
  });

  it('priority, type and backlog chips map to params', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask()));
    render();
    await screen.findByText('Fix login redirect');

    // Priority / type / Backlog moved into the Filters sheet (plan 7.4).
    fireEvent.press(screen.getByTestId('open-filters'));
    fireEvent.press(screen.getByTestId('chip-priority-HIGH'));
    await waitFor(() =>
      expect(tasksApi.buildTaskParams(api.getTasks.mock.calls.at(-1)![0])).toEqual({ priority: 'HIGH' }),
    );
    fireEvent.press(screen.getByTestId('chip-type-BUG'));
    fireEvent.press(screen.getByRole('button', { name: 'Not in a sprint' }));
    expect(screen.getByTestId('show-tasks')).toBeTruthy(); // live count button
    await waitFor(() =>
      expect(tasksApi.buildTaskParams(api.getTasks.mock.calls.at(-1)![0])).toEqual({
        priority: 'HIGH',
        task_type: 'BUG',
        sprint_id: 'none',
      }),
    );
  });

  it('quick chips show counts and filter client-side without refetching', async () => {
    api.getTasks.mockResolvedValue(
      tasks(
        rawTask({ id: 1, title: 'Normal one' }),
        rawTask({ id: 2, title: 'Blocked one', is_blocked: true }),
        rawTask({ id: 3, title: 'Late one', due_date: '2026-10-01' }),
        rawTask({ id: 4, title: 'Orphan', dev_owner_id: null, devOwner: null }),
      ),
    );
    render();
    await screen.findByText('Normal one');
    expect(screen.getByRole('button', { name: 'Overdue, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Blocked, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unassigned, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'QA overdue, 0' })).toBeTruthy();

    const calls = api.getTasks.mock.calls.length;
    fireEvent.press(screen.getByRole('button', { name: 'Blocked, 1' }));
    expect(screen.getByText('Blocked one')).toBeTruthy();
    expect(screen.queryByText('Normal one')).toBeNull();
    expect(api.getTasks.mock.calls.length).toBe(calls);
    expect(screen.getByRole('button', { name: 'Blocked, 1' }).props.accessibilityState.selected).toBe(true);
  });

  it('filter with no matches offers Clear filters', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1, title: 'Plain' })));
    render();
    await screen.findByText('Plain');
    fireEvent.press(screen.getByRole('button', { name: 'Blocked, 0' }));
    expect(await screen.findByText('No tasks match')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Plain')).toBeTruthy();
  });

  it('picking a project sends project_id and loads that team', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask()));
    render();
    await screen.findByText('Fix login redirect');
    expect(screen.getByLabelText('Project: All Projects. Change project')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Project: All Projects. Change project'));
    fireEvent.press(await screen.findByRole('radio', { name: 'Alpha Project' }));

    await waitFor(() =>
      expect(tasksApi.buildTaskParams(api.getTasks.mock.calls.at(-1)![0])).toEqual({ project_id: 3 }),
    );
    expect(projects.getProjectTeam).toHaveBeenCalledWith(3);
    expect(screen.getByLabelText('Project: Alpha Project. Change project')).toBeTruthy();
    expect(useProjectStore.getState().selected).toMatchObject({ id: 3, name: 'Alpha Project' });
  });

  it('project picker search narrows the list', async () => {
    api.getTasks.mockResolvedValue([]);
    render();
    fireEvent.press(await screen.findByLabelText('Project: All Projects. Change project'));
    await screen.findByRole('radio', { name: 'Beta' });
    fireEvent.changeText(screen.getByLabelText('Search projects'), 'bet');
    expect(screen.queryByRole('radio', { name: 'Alpha Project' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeTruthy();
  });
});

describe('TasksScreen card + status moves', () => {
  it('card shows code, flags with precedence, subtasks and unassigned', async () => {
    api.getTasks.mockResolvedValue(
      tasks(
        rawTask({
          id: 15, title: 'Flagged', is_blocked: true, is_at_risk: true, release_to_qa_date: '2026-10-01',
          subtaskCount: 4, completedSubtaskCount: 1, subtaskCompletionPct: 25,
          dev_owner_id: null, devOwner: null, reopen_count: 2, estimated_hours: '6.5',
        }),
      ),
    );
    render();
    expect(await screen.findByText('ALPH-0015')).toBeTruthy();
    // Card label (what a screen reader hears) carries the single winning flag.
    const label = screen.getByLabelText(/Flagged\./).props.accessibilityLabel as string;
    expect(label).toContain('Blocked');
    expect(label).not.toContain('QA overdue'); // blocked wins
    expect(label).not.toContain('At risk');
    expect(screen.getByText('Subtasks 1/4')).toBeTruthy();
    expect(screen.getAllByText('Unassigned')).toHaveLength(2); // quick chip + card
    expect(screen.getByText('Reopened 2x')).toBeTruthy();
    expect(screen.getByText('6.5h est')).toBeTruthy();
  });

  it('tapping a card opens Task Detail', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 15 })));
    render();
    fireEvent.press(await screen.findByLabelText(/Fix login redirect\. ALPH-0015/));
    expect(mockNavigate).toHaveBeenCalledWith('TaskDetail', { taskId: 15 });
  });

  it('Move is offered only to people who may edit, and never for terminal tasks', async () => {
    api.getTasks.mockResolvedValue(
      tasks(
        rawTask({ id: 1, title: 'Own task', dev_owner_id: 7, created_by: 2 }),
        rawTask({ id: 2, title: 'Not mine', dev_owner_id: 8, created_by: 2 }),
        rawTask({ id: 3, title: 'Own passed', dev_owner_id: 7, status: 'PASS' }),
      ),
    );
    render();
    await screen.findByText('Own task');
    expect(screen.getByRole('button', { name: 'Move Own task' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move Not mine' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move Own passed' })).toBeNull();
  });

  it('projects-menu edit access elevates the hint to every task', async () => {
    menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Projects', menu_url: '/projects', can_edit: true, access_level: 'edit' })]);
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 2, title: 'Not mine', dev_owner_id: 8 })));
    render();
    expect(await screen.findByRole('button', { name: 'Move Not mine' })).toBeTruthy();
  });

  it('the sheet lists only allowed transitions; success applies optimistically and toasts', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1, title: 'Own task', status: 'IN_PROGRESS', dev_owner_id: 7 })));
    let finish!: () => void;
    api.changeTaskStatus.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Move Own task' }));

    // IN_PROGRESS -> DEV_DONE | NOT_STARTED only
    expect(await screen.findByRole('button', { name: 'Move to Dev Done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move to Not Started' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move to Pass' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to Ready for QA' })).toBeNull();

    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1, title: 'Own task', status: 'DEV_DONE', dev_owner_id: 7 })));
    fireEvent.press(screen.getByRole('button', { name: 'Move to Dev Done' }));
    await waitFor(() => expect(api.changeTaskStatus).toHaveBeenCalledWith(1, 'DEV_DONE', undefined));

    // Optimistic: regrouped under Dev Done BEFORE the server answered.
    await waitFor(() => expect(screen.getAllByText('Dev Done').length).toBeGreaterThan(0));
    await act(async () => finish());
    expect(await screen.findByText('Status updated')).toBeTruthy();
  });

  it.each([
    [403, 'forbidden', 'You do not have permission to edit this task.'],
    [400, 'validation', 'Cannot move from IN_PROGRESS to PASS. Allowed: DEV_DONE, NOT_STARTED'],
  ] as const)('a %i rolls the card back, shows the server message verbatim and does NOT sign out', async (status, kind, message) => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1, title: 'Own task', status: 'IN_PROGRESS', dev_owner_id: 7 })));
    api.changeTaskStatus.mockRejectedValue(new AppError({ kind, status, message }));
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Move Own task' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Move to Dev Done' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(useAuthStore.getState().status).toBe('authenticated');
    // The list refetch returns the true state (still IN_PROGRESS); card is back where it was.
    await waitFor(() => expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0));
    expect(screen.queryByText('Status updated')).toBeNull();
  });
});

describe('Stage 2 toolbar, Mine and the Filters sheet', () => {
  it('Mine is OFF by default; turning it on sends assigned_to=<me> and says what it matches', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask()));
    render();
    await screen.findByText('Fix login redirect');
    expect(screen.getByTestId('chip-mine').props.accessibilityState).toMatchObject({ selected: false });
    expect(tasksApi.buildTaskParams(api.getTasks.mock.calls[0]![0])).toEqual({});
    expect(screen.queryByTestId('mine-helper')).toBeNull();
    fireEvent.press(screen.getByTestId('chip-mine'));
    await waitFor(() => expect(tasksApi.buildTaskParams(api.getTasks.mock.calls.at(-1)![0])).toEqual({ assigned_to: 7 }));
    await waitFor(() => expect(screen.getByTestId('mine-helper')).toHaveTextContent(/dev, QA or support owner/));
    fireEvent.press(screen.getByTestId('chip-mine'));
    await waitFor(() => expect(tasksApi.buildTaskParams(api.getTasks.mock.calls.at(-1)![0])).toEqual({}));
  });

  it('the Filters button counts active sheet filters; Clear all resets them; the footer shows the live count', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1 }), rawTask({ id: 2, title: 'Second' })));
    render();
    await screen.findByText('Second');
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-filters'));
    expect(screen.getByTestId('show-tasks')).toHaveTextContent('Show 2 tasks');
    fireEvent.press(screen.getByTestId('chip-priority-HIGH'));
    fireEvent.press(screen.getByRole('button', { name: 'Not in a sprint' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy());
  });

  it('priority is a single-choice group with an "Any" option', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask()));
    render();
    await screen.findByText('Fix login redirect');
    fireEvent.press(screen.getByTestId('open-filters'));
    expect(screen.getByLabelText('Priority')).toBeTruthy();
    fireEvent.press(screen.getByTestId('chip-priority-HIGH'));
    expect(screen.getByTestId('chip-priority-HIGH').props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('chip-priority-any'));
    expect(screen.getByTestId('chip-priority-HIGH').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('the card says WHEN (urgency-aware without the Overdue chip) and WHO, as text', async () => {
    api.getTasks.mockResolvedValue(
      tasks(
        rawTask({ id: 1, title: 'Late one', due_date: '2026-10-07', devOwner: { id: 7, name: 'Grace Hopper' }, qa_owner_id: 8, qaOwner: { id: 8, name: 'Ada L' } }),
        rawTask({ id: 2, title: 'Far one', due_date: '2026-10-30', dev_owner_id: null, devOwner: null }),
      ),
    );
    render();
    await screen.findByText('Late one');
    expect(screen.getByText('3d overdue')).toBeTruthy();
    expect(screen.getByText('Dev: Grace Hopper  ·  QA: Ada L')).toBeTruthy();
    expect(screen.getByText('Due 30 Oct')).toBeTruthy();
    expect(screen.queryByLabelText('Dev: Grace Hopper')).toBeNull(); // no avatars on the card
    const label = screen.getByLabelText(/Late one\./).props.accessibilityLabel as string;
    expect(label).toContain('3d overdue');
    expect(label).not.toMatch(/Due Due|Due 3d/);
    expect(label).toContain('Dev: Grace Hopper, QA: Ada L');
  });

  it('grouped by priority the card shows its status; Move is a footer button named "Move {title}" (visible text "Move")', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1, title: 'Own task', dev_owner_id: 7, status: 'IN_PROGRESS' })));
    render();
    await screen.findByText('Own task');
    expect(screen.getByText('Move')).toBeTruthy();
    expect(screen.queryAllByText('In Progress').length).toBe(1); // only the section header while grouped by status
    fireEvent.press(screen.getByTestId('open-filters'));
    fireEvent.press(screen.getByRole('tab', { name: 'By priority' }));
    expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1);
  });
});

describe('Tasks chrome budget (structure only; real heights Need on-device verification)', () => {
  const { listViewportDp, visibleCards, HEADER_ROW_DP, TOOLBAR_DP } = jest.requireActual('@/features/tasks/layoutBudget');
  it('fixed chrome above the list is a single header + a single toolbar row', () => {
    expect(HEADER_ROW_DP + TOOLBAR_DP).toBeLessThanOrEqual(136 + 8);
  });
  it('at 360x640 the nominal arithmetic gives ~1.9 cards (one full + most of a second) with no strip and ~1.6 with the timer strip', () => {
    // viewport = 640 - 24 status - 56 tabs - 52 header - 60 toolbar = 448; minus the 68dp scrolling list header = 380; / 200dp per card.
    expect(listViewportDp(640)).toBe(448);
    expect(visibleCards(listViewportDp(640))).toBeCloseTo(1.9, 1);
    expect(visibleCards(listViewportDp(640, { timer: true }))).toBeCloseTo(1.64, 1);
    expect(visibleCards(listViewportDp(640, { timer: true }))).toBeGreaterThan(1);
  });
});

describe('Pilot fixes: loading honesty, list keeps its chips, due wording', () => {
  it('while the first load runs there is no "0 tasks", the footer says "Show tasks", and the chips are already there', async () => {
    api.getTasks.mockImplementation(() => new Promise(() => undefined));
    render();
    expect(screen.getByLabelText('Loading tasks...')).toBeTruthy();
    expect(screen.queryByTestId('task-count')).toBeNull();
    expect(screen.queryByText(/^0 tasks/)).toBeNull();
    expect(screen.getByTestId('chip-mine')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-filters'));
    expect(screen.getByTestId('show-tasks')).toHaveTextContent('Show tasks');
  });

  it('a filter change reloads inside the list: the Mine chip stays mounted (same node) and no skeleton replaces the screen', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask()));
    render();
    await screen.findByText('Fix login redirect');
    const before = screen.getByTestId('chip-mine');
    api.getTasks.mockImplementation(() => new Promise(() => undefined));
    fireEvent.press(before);
    await waitFor(() => expect(screen.getByLabelText('Loading tasks...')).toBeTruthy());
    expect(screen.getByTestId('chip-mine')).toBe(before);
    expect(screen.getByTestId('chip-mine').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('the list and its chips keep the keyboard open on tap', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask()));
    render();
    await screen.findByText('Fix login redirect');
    expect(screen.UNSAFE_getByType(SectionList).props.keyboardShouldPersistTaps).toBe('handled');
    const chips = screen.UNSAFE_getAllByType(ScrollView).find((s: { props: { horizontal?: boolean } }) => s.props.horizontal);
    expect(chips!.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('the list separator is a stable component (not rebuilt per render) and the search placeholder is short', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1 }), rawTask({ id: 2, title: 'Two' })));
    render();
    await screen.findByText('Two');
    const sep1 = screen.UNSAFE_getByType(SectionList).props.ItemSeparatorComponent;
    fireEvent.changeText(screen.getByLabelText('Search tasks'), 'T'); // re-renders the screen
    expect(screen.UNSAFE_getByType(SectionList).props.ItemSeparatorComponent).toBe(sep1);
    expect(screen.getByLabelText('Search tasks').props.placeholder).toBe('Search tasks');
  });

  it('type is hidden when generic and shown when informative; one due wording in text and label; tomorrow and today', async () => {
    api.getTasks.mockResolvedValue(
      tasks(
        rawTask({ id: 1, title: 'Generic', task_type: 'TASK', due_date: '2026-10-11' }),
        rawTask({ id: 2, title: 'Tidy up', task_type: 'CHORE', due_date: '2026-10-10' }),
      ),
    );
    render();
    await screen.findByText('Generic');
    expect(screen.queryByText('Task')).toBeNull();
    expect(screen.getByText(/^Chore/)).toBeTruthy(); // the type line
    expect(screen.getByText('Due tomorrow')).toBeTruthy();
    expect(screen.getByText('Due today')).toBeTruthy();
    expect(screen.getByLabelText(/^Generic\./).props.accessibilityLabel).toContain('Due tomorrow');
    expect(screen.getByLabelText(/^Tidy up\./).props.accessibilityLabel).not.toMatch(/Due Due/);
  });
});


describe('Label in Name on the whole Tasks screen', () => {
  it('cards, chips, toolbar and the open Filters sheet', async () => {
    api.getTasks.mockResolvedValue(tasks(rawTask({ id: 1, title: 'Own task', dev_owner_id: 7, reopen_count: 2, is_blocked: true }), rawTask({ id: 2, title: 'Other' })));
    render();
    await screen.findByText('Own task');
    expect(labelInNameViolations()).toEqual([]);
    fireEvent.press(screen.getByTestId('open-filters'));
    expect(labelInNameViolations()).toEqual([]);
  });
});
