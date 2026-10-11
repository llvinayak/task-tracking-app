import { act, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { Text as RNText } from 'react-native';

import * as menuApi from '@/api/menuApi';
import { parseProjects, parseStatusConfig } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import { getTasks } from '@/api/tasksApi';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TasksScreen } from '@/features/tasks/TasksScreen';
import { useAuthStore } from '@/store/authStore';
import { menu, rawStatuses, sessionUser } from '@/test/fixtures';
import { calls, installHttpAdapter, ok, resetHttp, useHttp } from '@/test/mockHttp';
import { renderWithProviders } from '@/test/testUtils';
import { __resetErrorReporter } from '@/lib/errorReporter';
import { resetNowProvider, setNowProvider } from '@/utils/dates';

/* eslint-disable @typescript-eslint/no-require-imports */
// Node built-ins for the source scan (the app tsconfig has no Node typings).
const fs = require('fs');
const path = require('path');
/* eslint-enable */

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, push: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/api/projectsApi');
jest.mock('@/api/menuApi');
// Only a row titled "Boom" throws while rendering; everything else is the real card.
jest.mock('@/features/tasks/TaskCard', () => {
  const actual = jest.requireActual('@/features/tasks/TaskCard');
  const R = jest.requireActual('react');
  return {
    ...actual,
    TaskCard: (props: { task: { title: string } }) => {
      if (props.task.title === 'Boom') throw new Error('kaboom for grace@example.com');
      return R.createElement(actual.TaskCard, props);
    },
  };
});

const projects = projectsApi as jest.Mocked<typeof projectsApi>;
const menus = menuApi as jest.Mocked<typeof menuApi>;

/** A complete GET /tasks row, as Sequelize's toJSON sends it: nested owners with e-mail + avatar, subtasks, release. */
const fullRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  title: 'Full shape',
  description: '<p>Hello</p>',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  task_type: 'REQUIREMENT',
  module: 'Billing',
  project_id: 3,
  project: { id: 3, name: 'Alpha', color: '#3366ff', product: { id: 1, name: 'Suite' } },
  sprint: { id: 4, name: 'Sprint 4', status: 'active' },
  releaseSprint: { id: 5, name: 'Release 5', status: 'planned' },
  release: { id: 9, name: 'R 2026.10', version: '2026.10', release_date: '2026-10-30' },
  devOwner: { id: 7, name: 'Grace Hopper', email: 'grace@example.com', avatar_url: 'https://cdn.example.com/a/7.png' },
  qaOwner: { id: 8, name: 'Linus T', email: 'linus@example.com', avatar_url: null },
  supportOwner: null,
  creator: { id: 2, name: 'Boss', email: 'b@x.y', avatar_url: null },
  dev_owner_id: 7,
  qa_owner_id: 8,
  support_owner_id: null,
  created_by: 2,
  estimated_hours: '5.00',
  actual_hours: '1.50',
  start_date: '2026-10-01',
  due_date: '2026-10-12',
  release_to_qa_date: null,
  qa_start_date: null,
  qa_pass_date: null,
  is_blocked: false,
  is_at_risk: false,
  blocker_description: null,
  reopen_count: 0,
  parent_task_id: null,
  subtasks: [
    { id: 11, title: 'Sub A', status: 'DONE', priority: 'LOW', dev_owner_id: 7, devOwner: { id: 7, name: 'Grace Hopper', email: 'g@x.y', avatar_url: null } },
    { id: 12, title: 'Sub B', status: 'IN_PROGRESS', priority: 'LOW' },
  ],
  subtaskCount: 2,
  completedSubtaskCount: 1,
  subtaskCompletionPct: 50,
  created_at: '2026-10-01T05:00:00.000Z',
  updated_at: '2026-10-02T05:00:00.000Z',
  ...over,
});

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

beforeAll(installHttpAdapter);
beforeEach(() => {
  jest.clearAllMocks();
  resetHttp();
  __resetErrorReporter();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  setNowProvider(() => new Date(2026, 9, 10, 10, 0));
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 7 }) });
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  projects.getProjects.mockResolvedValue(parseProjects([{ id: 3, name: 'Alpha', color: '#3366ff', status: 'active' }]));
  projects.getProjectTeam.mockResolvedValue({ project_id: 3, can_manage: false, members: [] });
  menus.getMyMenus.mockResolvedValue([menu({ id: 1, menu_name: 'Projects', menu_url: '/projects' })]);
});
afterEach(async () => {
  await flush();
  resetNowProvider();
  jest.restoreAllMocks();
});

describe('GET /tasks through the real axios envelope (getTasks is NOT mocked)', () => {
  it('unwraps { success, data, count } and parses nested owners, subtasks and release', async () => {
    useHttp((call) => (call.url === '/tasks' ? ok([fullRow()], { count: 1 }) : ok(null)));
    const tasks = await getTasks({ projectId: 3 });
    expect(calls.find((c) => c.url === '/tasks')?.params).toMatchObject({ project_id: 3 });
    expect(tasks).toHaveLength(1);
    const t = tasks[0]!;
    expect(t.devOwner).toMatchObject({ id: 7, name: 'Grace Hopper' });
    expect(t.qaOwner).toMatchObject({ id: 8 });
    expect(t.sprint).toMatchObject({ id: 4, name: 'Sprint 4' });
    expect(t.releaseSprint).toMatchObject({ id: 5 });
    expect(t.subtasks.map((s) => [s.id, s.title, s.status])).toEqual([
      [11, 'Sub A', 'DONE'],
      [12, 'Sub B', 'IN_PROGRESS'],
    ]);
    expect(t.subtaskCount).toBe(2);
    expect(t.estimated_hours).toBe(5);
    // Nothing e-mail-shaped is kept on the list model.
    expect(JSON.stringify(t)).not.toContain('grace@example.com');
  });

  it('the Tasks screen renders that real-shape row over the real http layer', async () => {
    useHttp((call) => (call.url === '/tasks' ? ok([fullRow()], { count: 1 }) : ok(null)));
    renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('Full shape')).toBeTruthy();
  });
});

describe('one bad row never takes the board down', () => {
  const rows = () => [fullRow({ id: 1, title: 'Before' }), fullRow({ id: 2, title: 'Boom' }), fullRow({ id: 3, title: 'After' })];

  it('isolates the throwing card: the rest of the list renders, the fallback explains and offers "Open task"', async () => {
    useHttp((call) => (call.url === '/tasks' ? ok(rows()) : ok(null)));
    renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
    expect(screen.getByText('This task could not be displayed.')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Open task' }));
    expect(mockNavigate).toHaveBeenCalledWith('TaskDetail', { taskId: 2 });
  });

  it('retries by itself when that row gets new data (the boundary resets on a changed task)', async () => {
    let fixed = false;
    useHttp((call) =>
      call.url === '/tasks' ? ok(fixed ? [fullRow({ id: 1, title: 'Before' }), fullRow({ id: 2, title: 'Fixed' })] : rows()) : ok(null),
    );
    const r = renderWithProviders(<TasksScreen />);
    expect(await screen.findByText('This task could not be displayed.')).toBeTruthy();
    fixed = true;
    await act(async () => {
      await r.queryClient.invalidateQueries();
    });
    expect(await screen.findByText('Fixed')).toBeTruthy();
    expect(screen.queryByText('This task could not be displayed.')).toBeNull();
  });
});

describe('ErrorBoundary contract', () => {
  function Maybe({ boom }: { boom: boolean }) {
    if (boom) throw new Error('token=abc123 failed for kim@corp.io');
    return <RNText>fine</RNText>;
  }

  it('onError receives the SANITIZED message, never the raw one', () => {
    const onError = jest.fn();
    renderWithProviders(
      <ErrorBoundary onError={onError}>
        <Maybe boom />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const msg = String(onError.mock.calls[0]![0]);
    expect(msg).not.toContain('kim@corp.io');
    expect(msg).not.toContain('abc123');
    expect(msg).toContain('[email]');
  });

  it('resets when resetKey changes, stays failed when it does not, and runs the fallback action', () => {
    const action = jest.fn();
    const first = {};
    let setState: (v: { key: object; boom: boolean }) => void = () => undefined;
    function Host() {
      const [st, set] = React.useState({ key: first, boom: true });
      setState = set;
      return (
        <ErrorBoundary inline resetKey={st.key} action={{ label: 'Open it', onPress: action }}>
          <Maybe boom={st.boom} />
        </ErrorBoundary>
      );
    }
    renderWithProviders(<Host />);
    fireEvent.press(screen.getByRole('button', { name: 'Open it' }));
    expect(action).toHaveBeenCalledTimes(1);
    act(() => setState({ key: first, boom: false }));
    expect(screen.queryByText('fine')).toBeNull(); // same key: the failed state is kept
    act(() => setState({ key: {}, boom: false }));
    expect(screen.getByText('fine')).toBeTruthy();
  });
});

describe('guard: no list may clip views (New Architecture crash class)', () => {
  /** Files allowed to render a list without `removeClippedSubviews={false}` (none today; add with a reason). */
  const ALLOWLIST: string[] = [];

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (name === '__tests__' || name === 'node_modules') continue;
        walk(full, out);
      } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
    }
    return out;
  };

  /** The text of each `<FlatList ...>` / `<SectionList ...>` opening tag (balanced braces up to its closing `>`). */
  const listTags = (src: string): string[] => {
    const tags: string[] = [];
    const re = /<(FlatList|SectionList|VirtualizedList)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let depth = 0;
      let i = m.index;
      for (; i < src.length; i += 1) {
        const c = src[i];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0 && src[i - 1] !== '=') break;
      }
      tags.push(src.slice(m.index, i + 1));
    }
    return tags;
  };

  it('every FlatList / SectionList in src sets removeClippedSubviews={false}', () => {
    const root = path.join(process.cwd(), 'src');
    const offenders: string[] = [];
    let seen = 0;
    for (const file of walk(root)) {
      const rel = path.relative(root, file).replace(/\\/g, '/');
      if (ALLOWLIST.includes(rel)) continue;
      for (const tag of listTags(fs.readFileSync(file, 'utf8'))) {
        seen += 1;
        if (!/removeClippedSubviews=\{false\}/.test(tag)) offenders.push(rel);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
