import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Platform, SectionList } from 'react-native';

import { parseProjects, parseStatusConfig, parseTasks } from '@/api/models';
import * as menuApi from '@/api/menuApi';
import * as projectsApi from '@/api/projectsApi';
import * as tasksApi from '@/api/tasksApi';
import { HeaderVariantContext } from '@/components/ui/Screen';
import { TasksScreen } from '@/features/tasks/TasksScreen';
import { TaskCard } from '@/features/tasks/TaskCard';
import { useAuthStore } from '@/store/authStore';
import { menu, rawStatuses, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';
import { formatDay, resetNowProvider, setNowProvider } from '@/utils/dates';
import { dueDisplay, groupTasks, quickCounts, taskCode } from '@/utils/taskUtils';

/**
 * GET /tasks returns { success, data: [Sequelize toJSON rows], count }. Rows carry NULLs for every unset
 * association, DECIMAL columns as STRINGS, DATEONLY dates as 'YYYY-MM-DD' and anything free-text as typed
 * by users. These rows are what the board actually receives (fixtures never had these oddities).
 */
const serverRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  title: 'Plain',
  description: null,
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  task_type: 'REQUIREMENT',
  module: null,
  project_id: 3,
  project: { id: 3, name: 'Alpha', color: '#3366ff', product: null },
  sprint: null,
  releaseSprint: null,
  release: null,
  devOwner: null,
  qaOwner: null,
  supportOwner: null,
  blockerOwner: null,
  creator: { id: 2, name: 'Boss', email: 'b@x.y' },
  dev_owner_id: null,
  qa_owner_id: null,
  support_owner_id: null,
  created_by: 2,
  estimated_hours: '5.00',
  actual_hours: null,
  start_date: null,
  due_date: '2026-10-12',
  release_to_qa_date: null,
  qa_start_date: null,
  qa_pass_date: null,
  is_blocked: false,
  is_at_risk: false,
  blocker_description: null,
  reopen_count: 0,
  impact_score: '12.50',
  parent_task_id: null,
  subtasks: [],
  subtaskCount: 0,
  completedSubtaskCount: 0,
  subtaskCompletionPct: 0,
  created_at: '2026-10-01T05:00:00.000Z',
  updated_at: '2026-10-02T05:00:00.000Z',
  ...over,
});

const ODD: Record<string, unknown>[] = [
  serverRow({ id: 1 }),
  serverRow({ id: 2, title: 'No project', project: null, project_id: null }),
  serverRow({ id: 3, title: 'Empty project name', project: { id: 9, name: '', color: null, product: null } }),
  serverRow({ id: 4, title: 'Numbers-only project', project: { id: 8, name: '1234 !!!', color: 'not-a-colour' } }),
  serverRow({ id: 5, title: 'Unknown status', status: 'ARCHIVED' }),
  serverRow({ id: 6, title: 'Null status and priority', status: null, priority: null, task_type: null }),
  serverRow({ id: 7, title: 'Unknown priority/type', priority: 'URGENT', task_type: 'FOO' }),
  serverRow({ id: 8, title: 'Empty due', due_date: '' }),
  serverRow({ id: 9, title: 'Garbage due', due_date: 'next tuesday' }),
  serverRow({ id: 10, title: 'Impossible due', due_date: '2026-13-45' }),
  serverRow({ id: 11, title: 'ISO due with time', due_date: '2026-10-09T18:30:00.000Z' }),
  serverRow({ id: 12, title: 'Numeric due', due_date: 20261012 }),
  serverRow({ id: 13, title: 'Subtasks null', subtasks: null, subtaskCount: null }),
  serverRow({ id: 14, title: 'Subtasks as object', subtasks: { id: 1 }, subtaskCount: '3', completedSubtaskCount: '1', subtaskCompletionPct: '33.3' }),
  serverRow({ id: 15, title: 'Owner without name', devOwner: { id: 4, name: null }, dev_owner_id: 4, qaOwner: { id: 5 }, qa_owner_id: 5 }),
  serverRow({ id: 16, title: 'Owners as strings', devOwner: 'Priya', qaOwner: 7 }),
  serverRow({ id: 17, title: 'Sprint without name', sprint: { id: 2, name: null, status: null }, releaseSprint: { id: 3 } }),
  serverRow({ id: 18, title: 'Estimate junk', estimated_hours: 'abc', actual_hours: '', reopen_count: '2' }),
  serverRow({ id: 19, title: `Emoji \u{1F680} and RTL مرحبا ${'very long '.repeat(60)}` }),
  serverRow({ id: 20, title: 'Flags as strings', is_blocked: 'true', is_at_risk: 1, blocker_description: '' }),
  serverRow({ id: 21, title: null, status: 'IN_PROGRESS' }),
  serverRow({ id: 22, title: 'Module junk', module: 12345 }),
  serverRow({ id: 23, title: 'Release-to-QA overdue', release_to_qa_date: '2026-09-01', status: 'NOT_STARTED' }),
  serverRow({ id: 24, title: 'Ready subtasks null', ready_subtasks: null }),
];

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, push: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTasks: jest.fn(), changeTaskStatus: jest.fn() }));
jest.mock('@/api/projectsApi');
jest.mock('@/api/menuApi');

const api = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const menus = menuApi as jest.Mocked<typeof menuApi>;

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10, 0));
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7 }) });
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  projects.getProjects.mockResolvedValue(parseProjects([{ id: 3, name: 'Alpha', color: '#3366ff', status: 'active' }]));
  projects.getProjectTeam.mockResolvedValue({ project_id: 3, can_manage: false, members: [] });
  menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Projects', menu_url: '/projects' })]);
});
afterEach(async () => {
  // Let debounce timers / refetches of the last render land inside act before the next test starts.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  resetNowProvider();
});

describe('GET /tasks as the server really sends it', () => {
  it('the screen hosted as a PUSHED module (More > Task Board) renders the odd list with Back + strips', async () => {
    api.getTasks.mockResolvedValue(parseTasks(ODD));
    renderWithProviders(
      <HeaderVariantContext.Provider value="push">
        <TasksScreen />
      </HeaderVariantContext.Provider>,
      { navigation: true },
    );
    expect(await screen.findByText('Plain')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('parses every odd row without throwing and keeps all rows with a usable id', () => {
    const parsed = parseTasks(ODD);
    expect(parsed).toHaveLength(ODD.length);
    for (const t of parsed) {
      expect(typeof t.title).toBe('string');
      expect(typeof t.status).toBe('string');
      expect(typeof t.priority).toBe('string');
      expect(Array.isArray(t.subtasks)).toBe(true);
      expect(Array.isArray(t.ready_subtasks)).toBe(true);
    }
  });

  it('every pure helper on the Tasks path tolerates every odd row (code, due text, flags, counters, grouping with and without the config)', () => {
    const parsed = parseTasks(ODD);
    const config = parseStatusConfig(rawStatuses());
    for (const t of parsed) {
      expect(typeof taskCode(t)).toBe('string');
      expect(() => dueDisplay(t, formatDay)).not.toThrow();
      const d = dueDisplay(t, formatDay);
      if (d) expect(d.text).not.toMatch(/NaN|undefined|Invalid/);
    }
    expect(() => quickCounts(parsed)).not.toThrow();
    for (const by of ['status', 'priority'] as const) {
      for (const cfg of [undefined, config, []] as const) {
        const groups = groupTasks(parsed, cfg, by);
        expect(groups.reduce((n, g) => n + g.data.length, 0)).toBe(parsed.length); // nothing is dropped
        const keys = groups.map((g) => g.key);
        expect(new Set(keys).size).toBe(keys.length); // no duplicate section keys
      }
    }
  });

  it('TasksScreen renders the whole odd list (config loaded), with every filter and sheet, without throwing', async () => {
    api.getTasks.mockResolvedValue(parseTasks(ODD));
    renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('Plain')).toBeTruthy();
    expect(screen.getByText('No project')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-filters'));
    fireEvent.press(screen.getByTestId('chip-priority-HIGH'));
    fireEvent.press(screen.getByTestId('chip-priority-any'));
    fireEvent.press(screen.getByRole('tab', { name: 'By priority' }));
    fireEvent.press(screen.getByRole('tab', { name: 'By status' }));
    fireEvent.press(screen.getByTestId('show-tasks'));
    fireEvent.press(screen.getByTestId('chip-mine'));
    fireEvent.press(screen.getByTestId('chip-mine'));
  });

  it('TasksScreen renders while the status config has not arrived yet (cards render before config)', async () => {
    projects.getTaskStatuses.mockImplementation(() => new Promise(() => undefined));
    api.getTasks.mockResolvedValue(parseTasks(ODD));
    renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('Plain')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy(); // ungrouped until the config arrives
  });

  it('TasksScreen renders when the status config FAILS', async () => {
    projects.getTaskStatuses.mockRejectedValue(new Error('config down'));
    api.getTasks.mockResolvedValue(parseTasks(ODD));
    renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('Plain')).toBeTruthy();
  });

  it('a duplicated task id in the response does not crash the list (keys)', async () => {
    const parsed = parseTasks([serverRow({ id: 1 }), serverRow({ id: 1, title: 'Same id again' })]);
    expect(parsed.map((t) => t.title)).toEqual(['Plain']); // the parse layer keeps the first, so no duplicate React keys
    api.getTasks.mockResolvedValue(parsed);
    renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('Plain')).toBeTruthy();
    expect(screen.queryByText('Same id again')).toBeNull();
  });

  it('an empty and a malformed list body', async () => {
    api.getTasks.mockResolvedValue(parseTasks(null));
    renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('No tasks yet')).toBeTruthy();
    await act(async () => undefined);
  });

  it('TaskCard alone survives each odd row', () => {
    const config = parseStatusConfig(rawStatuses());
    for (const t of parseTasks(ODD)) {
      const r = renderWithProviders(<TaskCard task={t} config={config} today="2026-10-10" highlightOverdue={false} canMove showStatus onPress={jest.fn()} onMove={jest.fn()} />);
      r.unmount();
      const r2 = renderWithProviders(<TaskCard task={t} config={undefined} today="2026-10-10" highlightOverdue={false} canMove={false} onPress={jest.fn()} onMove={jest.fn()} />);
      r2.unmount();
    }
  });
});

describe('Hardening: lists never clip views (New Architecture crash class)', () => {
  it('the Tasks SectionList turns removeClippedSubviews OFF (RN would default it ON for Android) and sticky headers are iOS-only', async () => {
    api.getTasks.mockResolvedValue(parseTasks(ODD.slice(0, 3)));
    renderWithProviders(<TasksScreen />);
    await screen.findByText('Plain');
    const list = screen.UNSAFE_getByType(SectionList);
    expect(list.props.removeClippedSubviews).toBe(false);
    expect(list.props.stickySectionHeadersEnabled).toBe(Platform.OS === 'ios');
  });

  it.each([
    ['android', false],
    ['ios', true],
  ] as const)('sticky section headers on %s = %s', async (os, expected) => {
    const restore = jest.replaceProperty(Platform, 'OS', os);
    try {
      api.getTasks.mockResolvedValue(parseTasks(ODD.slice(0, 3)));
      renderWithProviders(<TasksScreen />);
      await screen.findByText('Plain');
      expect(screen.UNSAFE_getByType(SectionList).props.stickySectionHeadersEnabled).toBe(expected);
    } finally {
      restore.restore();
    }
  });

  it('the list structure is stable: sections is never empty and ListHeader/ListEmpty are never swapped', async () => {
    api.getTasks.mockResolvedValue(parseTasks(ODD.slice(0, 3)));
    renderWithProviders(<TasksScreen />);
    expect(screen.UNSAFE_getByType(SectionList).props.sections.length).toBeGreaterThan(0); // loading placeholder
    expect(screen.UNSAFE_getByType(SectionList).props.ListEmptyComponent).toBeUndefined();
    await screen.findByText('Plain');
    expect(screen.UNSAFE_getByType(SectionList).props.sections.length).toBeGreaterThan(0);
    expect(screen.UNSAFE_getByType(SectionList).props.ListHeaderComponent).toBeTruthy();
    api.getTasks.mockResolvedValue([]);
    fireEvent.changeText(screen.getByLabelText('Search tasks'), 'zzz-no-match');
    await screen.findByText('No tasks match', undefined, { timeout: 3000 });
    expect(screen.UNSAFE_getByType(SectionList).props.sections.length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Search tasks')).toBeTruthy(); // the chrome/header never went away
  });
});
