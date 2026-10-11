import { AppError } from '@/api/errors';
import { getServerOffsetMs, hasServerOffset, noteServerDate, resetServerClock, serverNowMs } from '@/api/serverClock';
import { getRunningTimer, getTaskSessions, parseRunningTimer, startTimer, stopTimer } from '@/api/timeApi';
import { parseStatusConfig } from '@/api/models';
import { isAssignedToTask } from '@/hooks/timer';
import { calls, created, fail, installHttpAdapter, ok, resetHttp, useHttp } from '@/test/mockHttp';
import { rawStatuses } from '@/test/fixtures';
import { elapsedSeconds, formatClock, formatDuration } from '@/utils/time';
import { getTimerPrompt, roleOnTask, type PromptTask } from '@/utils/timerPrompt';

beforeAll(installHttpAdapter);
beforeEach(() => {
  resetHttp();
  resetServerClock();
});

describe('formatDuration / formatClock', () => {
  it.each([
    [0, '0m'],
    [5, '5m'],
    [45, '45m'],
    [60, '1h'],
    [75, '1h 15m'],
    [600, '10h'],
    [1500, '25h'],
    [-5, '0m'],
    [Number.NaN, '0m'],
    [null, '0m'],
    [59.6, '1h'],
  ])('formatDuration(%p) = %s', (m, out) => {
    expect(formatDuration(m as number | null)).toBe(out);
  });

  it.each([
    [0, '00:00:00'],
    [59, '00:00:59'],
    [61, '00:01:01'],
    [3661, '01:01:01'],
    [100 * 3600, '100:00:00'], // hours uncapped
    [-4, '00:00:00'],
    [12.9, '00:00:12'],
  ])('formatClock(%p) = %s', (s, out) => {
    expect(formatClock(s)).toBe(out);
  });
});

describe('elapsedSeconds', () => {
  const start = '2026-10-10T10:00:00.000Z';
  const t0 = Date.parse(start);

  it('is now - started_at, floored to the second', () => {
    expect(elapsedSeconds(start, t0 + 90_999)).toBe(90);
    expect(elapsedSeconds(start, t0)).toBe(0);
  });

  it('is clamped to >= 0 (start in the future / clock skew)', () => {
    expect(elapsedSeconds(start, t0 - 60_000)).toBe(0);
  });

  it('is derived from started_at every time: recomputing after a long gap is exact (no accumulation)', () => {
    expect(elapsedSeconds(start, t0 + 3_600_000)).toBe(3600);
    expect(elapsedSeconds(start, t0 + 7_200_000)).toBe(7200);
  });

  it('applies a server offset when given', () => {
    expect(elapsedSeconds(start, t0 + 10_000, 5_000)).toBe(15);
  });

  it('is 0 for missing or invalid input', () => {
    expect(elapsedSeconds(null, 1)).toBe(0);
    expect(elapsedSeconds('garbage', 1)).toBe(0);
  });
});

describe('server clock skew (HTTP Date header)', () => {
  it('learns the offset from a Date header and applies it', () => {
    // Device is 5 minutes BEHIND the server.
    const server = Date.parse('Sat, 10 Oct 2026 10:05:00 GMT');
    noteServerDate('Sat, 10 Oct 2026 10:05:00 GMT', server - 5 * 60_000);
    expect(hasServerOffset()).toBe(true);
    // header is truncated to the second -> +500ms
    expect(getServerOffsetMs()).toBe(5 * 60_000 + 500);
    expect(serverNowMs(server - 5 * 60_000)).toBe(server + 500);
  });

  it('falls back to the device clock without a usable header', () => {
    noteServerDate(undefined);
    noteServerDate('not a date');
    noteServerDate(12345 as never);
    expect(hasServerOffset()).toBe(false);
    expect(getServerOffsetMs()).toBe(0);
    expect(serverNowMs(1000)).toBe(1000);
  });

  it('a real response updates the offset (through the API client)', async () => {
    useHttp(() => ({ ...ok(null), headers: { date: 'Sat, 10 Oct 2026 10:00:00 GMT' } }));
    await getRunningTimer();
    expect(hasServerOffset()).toBe(true);
  });

  it('timer elapsed uses the offset: a fast device clock does not inflate the timer', () => {
    const startedAt = '2026-10-10T10:00:00.000Z';
    const trueNow = Date.parse(startedAt) + 120_000; // really 2 minutes in
    const deviceNow = trueNow + 10 * 60_000; // device is 10 minutes AHEAD
    noteServerDate(new Date(trueNow).toUTCString(), deviceNow);
    expect(elapsedSeconds(startedAt, serverNowMs(deviceNow))).toBeGreaterThanOrEqual(120);
    expect(elapsedSeconds(startedAt, serverNowMs(deviceNow))).toBeLessThanOrEqual(121);
  });
});

describe('timer API', () => {
  it('parses GET /time/running: null, a session, and garbage', async () => {
    useHttp(() => ok(null));
    expect(await getRunningTimer()).toBeNull();

    useHttp(() =>
      ok({
        id: 9,
        started_at: '2026-10-10T09:00:00.000Z',
        elapsed_minutes: 42,
        task: { id: 5, title: 'Fix', status: 'IN_PROGRESS', dev_owner_id: 7, qa_required: true, project: { id: 2, name: 'Alpha', color: '#3366ff' } },
      }),
    );
    const t = await getRunningTimer();
    expect(t).toMatchObject({ id: 9, elapsed_minutes: 42, task: { id: 5, title: 'Fix', dev_owner_id: 7, qa_required: true, project: { name: 'Alpha' } } });

    expect(parseRunningTimer({ id: 1, started_at: 'nope', task: { id: 1 } })).toBeNull();
    expect(parseRunningTimer({ id: 1, started_at: '2026-10-10T09:00:00Z' })).toBeNull();
    expect(parseRunningTimer('x')).toBeNull();
  });

  it('start: POSTs with NO body, reads stopped + the TOP-LEVEL warning', async () => {
    useHttp(() =>
      created(
        { started: { id: 11, task_id: 5 }, stopped: { id: 10, task_id: 4, duration_minutes: 30 } },
        { warning: 'This task is already PASS.', message: 'Timer started' },
      ),
    );
    const r = await startTimer(5);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/tasks/5/timer/start' });
    expect(calls.at(-1)?.body).toBeUndefined(); // the optional note is not sent
    expect(r).toEqual({
      startedId: 11,
      stopped: { id: 10, taskId: 4, title: null, minutes: 30 },
      warning: 'This task is already PASS.',
    });
  });

  it('start with nothing to auto-stop and no warning', async () => {
    useHttp(() => created({ started: { id: 1 }, stopped: null }, { warning: null }));
    expect(await startTimer(5)).toEqual({ startedId: 1, stopped: null, warning: null });
  });

  it.each([
    [403, 'forbidden', 'Only people assigned to this task can track time on it.'],
    [409, 'conflict', 'You already have a timer running on this task.'],
    [404, 'not_found', 'Task not found'],
    [400, 'validation', 'Cannot start a timer on this task'],
  ] as const)('start %i is surfaced verbatim', async (status, kind, message) => {
    useHttp(() => fail(status, message));
    await expect(startTimer(5)).rejects.toMatchObject({ kind, message });
  });

  it('stop returns the closed session; 404 is a typed error the UI treats as "already stopped"', async () => {
    useHttp(() => ok({ id: 11, duration_minutes: 95, auto_closed: false }));
    expect(await stopTimer()).toEqual({ id: 11, duration_minutes: 95, auto_closed: false });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/time/stop' });

    useHttp(() => fail(404, 'You have no timer running.'));
    const err = await stopTimer().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 404, message: 'You have no timer running.' });
  });

  it('task sessions parse byUser with running flags', async () => {
    useHttp(() =>
      ok({ totalMinutes: 150, sessions: [{ id: 1 }], byUser: [{ user_id: 7, name: 'Grace', minutes: 90, sessions: 2, running: true }, { name: 'bad' }] }),
    );
    const s = await getTaskSessions(5);
    expect(s.totalMinutes).toBe(150);
    expect(s.byUser).toEqual([{ user_id: 7, name: 'Grace', minutes: 90, sessions: 2, running: true }]);
  });
});

describe('assigned gating', () => {
  const t = { dev_owner_id: 7, qa_owner_id: 8, support_owner_id: 9 };
  it('named owners are assigned', () => {
    expect(isAssignedToTask(t, 7, undefined)).toBe(true);
    expect(isAssignedToTask(t, 8, undefined)).toBe(true);
    expect(isAssignedToTask(t, 9, undefined)).toBe(true);
  });
  it('assignees-list membership counts', () => {
    expect(isAssignedToTask(t, 11, [{ user_id: 11 }])).toBe(true);
  });
  it('everyone else is not assigned', () => {
    expect(isAssignedToTask(t, 11, [{ user_id: 12 }])).toBe(false);
    expect(isAssignedToTask(t, 11, undefined)).toBe(false);
    expect(isAssignedToTask(t, undefined, [{ user_id: 11 }])).toBe(false);
  });
});

describe('timer status prompt (port of TimerStatusPrompt.jsx)', () => {
  const config = parseStatusConfig(rawStatuses());
  const task = (over: Partial<PromptTask> = {}): PromptTask => ({
    id: 5, title: 'T', status: 'IN_PROGRESS', dev_owner_id: 7, qa_owner_id: 8, support_owner_id: 9, ...over,
  });
  const dev = { id: 7, roleId: 5 };
  const qa = { id: 8, roleId: 4 };

  describe('role on task', () => {
    it('qa owner -> QA, dev/support owner -> DEV (ownership beats master role)', () => {
      expect(roleOnTask(task(), { id: 8, roleId: 5 })).toBe('QA');
      expect(roleOnTask(task(), { id: 7, roleId: 4 })).toBe('DEV');
      expect(roleOnTask(task(), { id: 9, roleId: 4 })).toBe('DEV');
    });
    it('non-owner falls back to master role: 4 -> QA, else DEV', () => {
      expect(roleOnTask(task(), { id: 99, roleId: 4 })).toBe('QA');
      expect(roleOnTask(task(), { id: 99, roleId: 5 })).toBe('DEV');
      expect(roleOnTask(task(), { id: 99, roleId: 1 })).toBe('DEV');
    });
    it('defaults to DEV without a task or user', () => {
      expect(roleOnTask(null, dev)).toBe('DEV');
      expect(roleOnTask(task(), null)).toBe('DEV');
    });
  });

  it('DEV start: only from NOT_STARTED -> IN_PROGRESS ("Not yet")', () => {
    const p = getTimerPrompt({ event: 'start', task: task({ status: 'NOT_STARTED' }), user: dev, config });
    expect(p).toMatchObject({ title: 'Start working on this?', dismissLabel: 'Not yet' });
    expect(p?.choices.map((c) => c.key)).toEqual(['IN_PROGRESS']);
    for (const status of ['IN_PROGRESS', 'DEV_DONE', 'PASS', 'REOPEN']) {
      expect(getTimerPrompt({ event: 'start', task: task({ status }), user: dev, config })).toBeNull();
    }
  });

  it('DEV stop: IN_PROGRESS / REOPEN qualify ("Leave as is"); choices are cut to the allowed transitions', () => {
    const p = getTimerPrompt({ event: 'stop', task: task({ status: 'IN_PROGRESS' }), user: dev, config });
    expect(p).toMatchObject({ title: 'Finished with this task?', dismissLabel: 'Leave as is' });
    // Fixture: IN_PROGRESS -> DEV_DONE | NOT_STARTED, so READY_FOR_QA is filtered out.
    expect(p?.choices.map((c) => c.key)).toEqual(['DEV_DONE']);
    // REOPEN only allows -> IN_PROGRESS: nothing offered, so no prompt at all.
    expect(getTimerPrompt({ event: 'stop', task: task({ status: 'REOPEN' }), user: dev, config })).toBeNull();
  });

  it('DEV stop offers both choices when both transitions are allowed', () => {
    const cfg = parseStatusConfig(
      rawStatuses().map((s) => (s.key === 'IN_PROGRESS' ? { ...s, allowed_transitions: ['DEV_DONE', 'READY_FOR_QA'] } : s)),
    );
    const p = getTimerPrompt({ event: 'stop', task: task({ status: 'IN_PROGRESS' }), user: dev, config: cfg });
    expect(p?.choices.map((c) => c.key)).toEqual(['DEV_DONE', 'READY_FOR_QA']);
    expect(p?.choices.map((c) => c.label)).toEqual(['Dev Done', 'Ready for QA']);
  });

  it('DEV stop: never from other statuses', () => {
    for (const status of ['NOT_STARTED', 'DEV_DONE', 'READY_FOR_QA', 'PASS', 'FAIL']) {
      expect(getTimerPrompt({ event: 'stop', task: task({ status }), user: dev, config })).toBeNull();
    }
  });

  it('QA stop: READY_FOR_QA / IN_PROGRESS / FAIL / REOPEN -> PASS, FAIL, REOPEN ("How did testing go?")', () => {
    const p = getTimerPrompt({ event: 'stop', task: task({ status: 'READY_FOR_QA' }), user: qa, config });
    expect(p).toMatchObject({ title: 'How did testing go?' });
    expect(p?.choices.map((c) => c.key)).toEqual(['PASS', 'FAIL']); // REOPEN is not allowed from READY_FOR_QA in this config
    for (const status of ['NOT_STARTED', 'DEV_DONE', 'PASS', 'DEFERRED']) {
      expect(getTimerPrompt({ event: 'stop', task: task({ status }), user: qa, config })).toBeNull();
    }
  });

  it('QA start never prompts', () => {
    for (const status of ['NOT_STARTED', 'READY_FOR_QA', 'IN_PROGRESS', 'FAIL']) {
      expect(getTimerPrompt({ event: 'start', task: task({ status }), user: qa, config })).toBeNull();
    }
  });

  it('filters choices to statuses that exist in /config AND are allowed from the current status', () => {
    // READY_FOR_QA -> PASS only (FAIL removed from the table), REOPEN not offered.
    const cfg = parseStatusConfig(
      rawStatuses().map((s) => (s.key === 'READY_FOR_QA' ? { ...s, allowed_transitions: ['PASS', 'REOPEN'] } : s)),
    );
    const p = getTimerPrompt({ event: 'stop', task: task({ status: 'READY_FOR_QA' }), user: qa, config: cfg });
    expect(p?.choices.map((c) => c.key)).toEqual(['PASS', 'REOPEN']);

    // A status renamed away from /config simply disappears.
    const cfg2 = parseStatusConfig(rawStatuses().filter((s) => s.key !== 'PASS'));
    const p2 = getTimerPrompt({ event: 'stop', task: task({ status: 'READY_FOR_QA' }), user: qa, config: cfg2 });
    expect(p2?.choices.map((c) => c.key)).toEqual(['FAIL']);
  });

  it('returns null when no choice survives, or config is not loaded', () => {
    const cfg = parseStatusConfig(rawStatuses().map((s) => (s.key === 'NOT_STARTED' ? { ...s, allowed_transitions: [] } : s)));
    expect(getTimerPrompt({ event: 'start', task: task({ status: 'NOT_STARTED' }), user: dev, config: cfg })).toBeNull();
    expect(getTimerPrompt({ event: 'start', task: task({ status: 'NOT_STARTED' }), user: dev, config: undefined })).toBeNull();
  });
});
