import { QueryClient } from '@tanstack/react-query';
import type { InternalAxiosRequestConfig } from 'axios';

import { http } from '@/api/client';
import { parseTasks, type Task } from '@/api/models';
import { COMMENT_MAX, addTaskComment, changeTaskStatus, getTask, getTasks } from '@/api/tasksApi';
import { applyOptimisticStatus } from '@/hooks/taskMutations';
import { keys } from '@/hooks/queries';
import { rawTask } from '@/test/fixtures';

interface Seen {
  method?: string;
  url?: string;
  params?: unknown;
  data?: unknown;
  contentType?: unknown;
}
let seen: Seen = {};
let reply: unknown = { success: true, data: [] };

beforeAll(() => {
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    seen = {
      method: config.method,
      url: config.url,
      params: config.params,
      data: config.data,
      contentType: config.headers.get('Content-Type'),
    };
    return { status: 200, statusText: 'OK', headers: {}, config, data: reply };
  }) as never;
});
beforeEach(() => {
  seen = {};
  reply = { success: true, data: [] };
});

describe('tasks API contract', () => {
  it('GET /tasks sends only non-empty params and unwraps {success,data,count}', async () => {
    reply = { success: true, data: [rawTask({ id: 1 }), { nonsense: true }], count: 2 };
    const list = await getTasks({ projectId: 3, search: ' ', priority: 'HIGH' });
    expect(seen).toMatchObject({ method: 'get', url: '/tasks', params: { project_id: 3, priority: 'HIGH' } });
    expect(Object.keys(seen.params as object)).toEqual(['project_id', 'priority']);
    expect(list.map((t) => t.id)).toEqual([1]); // malformed row skipped, no crash
  });

  it('GET /tasks/:id surfaces a clear error when the row is unusable', async () => {
    reply = { success: true, data: { nope: 1 } };
    await expect(getTask(5)).rejects.toThrow('could not be loaded');
  });

  it('PATCH status sends {status} and omits empty notes; trims notes when given', async () => {
    await changeTaskStatus(1, 'DEV_DONE');
    expect(seen).toMatchObject({ method: 'patch', url: '/tasks/1/status' });
    expect(JSON.parse(seen.data as string)).toEqual({ status: 'DEV_DONE' });
    await changeTaskStatus(1, 'FAIL', '  steps  ');
    expect(JSON.parse(seen.data as string)).toEqual({ status: 'FAIL', notes: 'steps' });
    await changeTaskStatus(1, 'FAIL', '   ');
    expect(JSON.parse(seen.data as string)).toEqual({ status: 'FAIL' });
  });

  it('POST comment is JSON {content} (trimmed), never a hand-set multipart header', async () => {
    reply = { success: true, data: { id: 9, content: 'hi' } };
    const c = await addTaskComment(4, '  hi  ', { id: 7, name: 'Grace' });
    expect(seen).toMatchObject({ method: 'post', url: '/tasks/4/comments' });
    expect(JSON.parse(seen.data as string)).toEqual({ content: 'hi' });
    expect(String(seen.contentType)).not.toContain('multipart');
    // 201 has no author -> the current user is attached locally.
    expect(c).toMatchObject({ id: 9, content: 'hi', author: { id: 7, name: 'Grace' } });
  });
});

describe('optimistic status helper', () => {
  const setup = () => {
    // gcTime Infinity: no GC timers, so nothing keeps the worker alive.
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const list = parseTasks([rawTask({ id: 1, status: 'IN_PROGRESS' }), rawTask({ id: 2, status: 'IN_PROGRESS' })]);
    qc.setQueryData(keys.tasks({}), list);
    qc.setQueryData(keys.tasks({ projectId: 3 }), list);
    return { qc };
  };
  const statusOf = (qc: QueryClient, f: Parameters<typeof keys.tasks>[0], id: number) =>
    qc.getQueryData<Task[]>(keys.tasks(f))?.find((t) => t.id === id)?.status;

  it('updates every cached list, leaves other tasks alone, and rolls back exactly', async () => {
    const { qc } = setup();
    const rollback = await applyOptimisticStatus(qc, 1, 'DEV_DONE');
    expect(statusOf(qc, {}, 1)).toBe('DEV_DONE');
    expect(statusOf(qc, { projectId: 3 }, 1)).toBe('DEV_DONE');
    expect(statusOf(qc, {}, 2)).toBe('IN_PROGRESS');
    rollback();
    expect(statusOf(qc, {}, 1)).toBe('IN_PROGRESS');
    expect(statusOf(qc, { projectId: 3 }, 1)).toBe('IN_PROGRESS');
  });

  it('does not touch query keys that merely start with "task"', async () => {
    const { qc } = setup();
    qc.setQueryData(['task-statuses'], ['keep']);
    await applyOptimisticStatus(qc, 1, 'DEV_DONE');
    expect(qc.getQueryData(['task-statuses'])).toEqual(['keep']);
  });
});

describe('input caps and verified fields', () => {
  it('comments are capped client-side at 5000 characters (the server has no limit)', async () => {
    expect(COMMENT_MAX).toBe(5000);
    await expect(addTaskComment(4, 'x'.repeat(5001), { id: 7, name: 'G' })).rejects.toMatchObject({ kind: 'validation' });
    expect(seen.url).toBeUndefined(); // nothing was sent
    reply = { success: true, data: { id: 1, content: 'ok' } };
    await expect(addTaskComment(4, 'x'.repeat(5000), { id: 7, name: 'G' })).resolves.toBeTruthy();
  });

  it('status history timestamps come from created_at (changed_at is only a fallback)', async () => {
    reply = {
      success: true,
      data: {
        ...rawTask({ id: 3 }),
        statusLogs: [{ id: 1, to_status: 'DONE', created_at: '2026-10-01T09:00:00Z', changed_at: 'ignored' }, { id: 2, to_status: 'X', changed_at: '2026-10-02T09:00:00Z' }],
      },
    };
    const t = await getTask(3);
    expect(t.statusLogs.map((l) => l.changed_at)).toEqual(['2026-10-01T09:00:00Z', '2026-10-02T09:00:00Z']);
  });
});
