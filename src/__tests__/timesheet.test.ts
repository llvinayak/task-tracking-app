import { QueryClient } from '@tanstack/react-query';

import {
  createTimeEntry,
  deleteTimeEntry,
  getTimesheet,
  parseTimesheet,
  updateTimeEntry,
  validateEntry,
  validateRange,
} from '@/api/timesheetApi';
import { refreshTimeData } from '@/hooks/timesheet';
import {
  deviceOffsetMinutes,
  isValidTime,
  normalizeTime,
  timezonesDiffer,
  tzOffsetMinutes,
  utcMsToWall,
  wallToUtcMs,
  weekDates,
  weekRange,
  weekStart,
} from '@/utils/companyTime';
import { calls, created, fail, installHttpAdapter, ok, resetHttp, useHttp } from '@/test/mockHttp';

beforeAll(installHttpAdapter);
beforeEach(resetHttp);
afterEach(() => jest.restoreAllMocks());

describe('week arithmetic (Monday to Sunday, pure yyyy-MM-dd)', () => {
  it.each([
    ['2026-10-05', '2026-10-05', '2026-10-11'], // a Monday
    ['2026-10-10', '2026-10-05', '2026-10-11'], // Saturday
    ['2026-10-11', '2026-10-05', '2026-10-11'], // Sunday belongs to the week that STARTED on Monday
    ['2026-09-30', '2026-09-28', '2026-10-04'], // month boundary
    ['2026-10-01', '2026-09-28', '2026-10-04'],
    ['2027-01-01', '2026-12-28', '2027-01-03'], // year boundary
    ['2026-12-31', '2026-12-28', '2027-01-03'],
    ['2024-03-01', '2024-02-26', '2024-03-03'], // leap year
    ['2026-03-01', '2026-02-23', '2026-03-01'],
  ])('%s -> %s .. %s', (d, from, to) => {
    expect(weekRange(d)).toEqual({ from, to });
    expect(weekStart(d)).toBe(from);
  });

  it('weekDates returns the 7 days in order', () => {
    expect(weekDates('2026-12-30')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });
});

describe('company timezone conversion', () => {
  const NOON_UTC = Date.UTC(2026, 6, 1, 12, 0);

  it('knows offsets, including DST', () => {
    expect(tzOffsetMinutes('Asia/Kolkata', NOON_UTC)).toBe(330);
    expect(tzOffsetMinutes('UTC', NOON_UTC)).toBe(0);
    expect(tzOffsetMinutes('America/New_York', Date.UTC(2026, 0, 15, 12))).toBe(-300);
    expect(tzOffsetMinutes('America/New_York', Date.UTC(2026, 6, 15, 12))).toBe(-240);
    expect(tzOffsetMinutes('Not/AZone', NOON_UTC)).toBeNull();
  });

  it('wall clock in the company zone -> UTC instant', () => {
    // 09:30 IST = 04:00 UTC
    expect(new Date(wallToUtcMs('2026-10-10', '09:30', 'Asia/Kolkata') as number).toISOString()).toBe('2026-10-10T04:00:00.000Z');
    // 09:00 New York in July (EDT) = 13:00 UTC; in January (EST) = 14:00 UTC
    expect(new Date(wallToUtcMs('2026-07-01', '09:00', 'America/New_York') as number).toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(new Date(wallToUtcMs('2026-01-05', '09:00', 'America/New_York') as number).toISOString()).toBe('2026-01-05T14:00:00.000Z');
    expect(new Date(wallToUtcMs('2026-10-10', '9:30', 'UTC') as number).toISOString()).toBe('2026-10-10T09:30:00.000Z');
  });

  it('crosses UTC midnight correctly (00:30 IST is the previous UTC day)', () => {
    expect(new Date(wallToUtcMs('2026-10-10', '00:30', 'Asia/Kolkata') as number).toISOString()).toBe('2026-10-09T19:00:00.000Z');
  });

  it('round-trips through utcMsToWall', () => {
    for (const tz of ['Asia/Kolkata', 'America/New_York', 'Pacific/Auckland', 'UTC']) {
      const ms = wallToUtcMs('2026-10-10', '17:45', tz) as number;
      expect(utcMsToWall(ms, tz)).toEqual({ date: '2026-10-10', time: '17:45' });
    }
  });

  it('rejects invalid input and unknown zones', () => {
    expect(wallToUtcMs('2026-02-31', '09:00', 'UTC')).toBeNull();
    expect(wallToUtcMs('2026-10-10', '25:00', 'UTC')).toBeNull();
    expect(wallToUtcMs('2026-10-10', '09:60', 'UTC')).toBeNull();
    expect(wallToUtcMs('2026-10-10', '09:00', 'Not/AZone')).toBeNull();
    expect(utcMsToWall(0, 'Not/AZone')).toBeNull();
  });

  it('time parsing', () => {
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('9:30')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9.30')).toBe(false);
    expect(normalizeTime(' 9:05 ')).toBe('09:05');
    expect(normalizeTime('x')).toBeNull();
  });

  it('detects a device zone that differs from the company zone', () => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-330); // device = IST
    expect(deviceOffsetMinutes(NOON_UTC)).toBe(330);
    expect(timezonesDiffer('Asia/Kolkata', NOON_UTC)).toBe(false);
    expect(timezonesDiffer('America/New_York', NOON_UTC)).toBe(true);
    expect(timezonesDiffer('Not/AZone', NOON_UTC)).toBe(false); // unknown: no false alarm
  });
});

describe('range validation (the server answers 500 for bad dates and has no max range)', () => {
  it('accepts a week and rejects bad input', () => {
    expect(validateRange('2026-10-05', '2026-10-11')).toBeNull();
    expect(validateRange('2026-10-05', '2026-10-05')).toBeNull();
    expect(validateRange('2026-10-11', '2026-10-05')).toMatch(/not be after/);
    expect(validateRange('2026-02-30', '2026-03-01')).toMatch(/valid/);
    expect(validateRange('2026-10-05', 'soon')).toMatch(/valid/);
    expect(validateRange('2026-01-01', '2026-12-31')).toMatch(/at most 31 days/);
  });

  it('getTimesheet sends from/to only when valid', async () => {
    useHttp(() => ok({ from: '2026-10-05', to: '2026-10-11', timezone: 'Asia/Kolkata', days: [], totalMinutes: 0 }));
    await expect(getTimesheet('bad', '2026-10-11')).rejects.toMatchObject({ kind: 'validation' });
    await expect(getTimesheet('2026-01-01', '2026-12-31')).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
    await getTimesheet('2026-10-05', '2026-10-11');
    expect(calls.at(-1)).toMatchObject({ method: 'GET', url: '/time/timesheet/me', params: { from: '2026-10-05', to: '2026-10-11' } });
  });
});

describe('timesheet parsing', () => {
  it('parses days, entries, project totals and tolerates junk', () => {
    const t = parseTimesheet({
      from: '2026-10-05',
      to: '2026-10-11',
      timezone: 'Asia/Kolkata',
      totalMinutes: 570,
      needsReview: 1,
      days: [
        {
          date: '2026-10-06',
          minutes: 570,
          needsReview: 1,
          entries: [
            { id: 1, task_id: 5, task_title: 'Fix', minutes: 480, started_at: '2026-10-06T03:30:00Z', ended_at: '2026-10-06T11:30:00Z', source: 'timer', auto_closed: true, reviewed_at: null, project: { id: 2, name: 'Alpha' } },
            { id: 2, task_id: 6, minutes: '90', source: 'manual', note: 'n' },
            { nope: true },
          ],
        },
        { date: 'garbage', entries: [] },
        null,
      ],
      byProject: [{ project_id: 2, name: 'Alpha', color: '#112233', minutes: 480 }],
    });
    expect(t.timezone).toBe('Asia/Kolkata');
    expect(t.days).toHaveLength(1);
    expect(t.days[0]!.entries.map((e) => e.id)).toEqual([1, 2]);
    expect(t.days[0]!.entries[0]).toMatchObject({ auto_closed: true, project: { name: 'Alpha' } });
    expect(t.days[0]!.entries[1]).toMatchObject({ minutes: 90, source: 'manual', task_title: 'Task 6' });
    expect(t.byProject[0]).toMatchObject({ name: 'Alpha', minutes: 480 });
    expect(parseTimesheet(null)).toMatchObject({ days: [], totalMinutes: 0, timezone: null });
  });
});

describe('entry validation (client rules; server messages still win)', () => {
  // "now" = 2026-10-10 15:30 IST = 10:00 UTC
  const NOW = Date.UTC(2026, 9, 10, 10, 0);
  const IST = 'Asia/Kolkata';
  const v = (over: Partial<{ date: string; start: string; end: string; note: string }> = {}) =>
    validateEntry({ date: '2026-10-10', start: '09:30', end: '11:00', ...over }, IST, NOW);

  it('a valid entry becomes ISO UTC computed in the COMPANY zone', () => {
    expect(v()).toEqual({ ok: true, startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:30:00.000Z', minutes: 90, longEntryHint: false });
  });

  it('end must be after start', () => {
    expect(v({ end: '09:30' })).toEqual({ ok: false, error: 'End time must be after the start time.' });
    expect(v({ end: '08:00' })).toEqual({ ok: false, error: 'End time must be after the start time.' });
  });

  it('nothing in the future (in company time)', () => {
    expect(v({ start: '15:00', end: '16:00' })).toEqual({ ok: false, error: 'Cannot log time in the future.' });
    expect(v({ date: '2026-10-11', start: '01:00', end: '02:00' })).toEqual({ ok: false, error: 'Cannot log time in the future.' });
    expect(v({ start: '15:00', end: '15:30' })).toMatchObject({ ok: true }); // exactly now is fine
  });

  it('a different device zone does not move the day (uses company time, not device time)', () => {
    // 00:30 IST on the 10th is still "the 10th" even though it is the 9th in UTC.
    expect(v({ start: '00:30', end: '01:30' })).toMatchObject({ ok: true, startedAt: '2026-10-09T19:00:00.000Z' });
  });

  it('same-day by construction: one date, two times on it (no overnight)', () => {
    expect(v({ start: '23:00', end: '01:00' })).toEqual({ ok: false, error: 'End time must be after the start time.' });
  });

  it.each([
    [{ date: '10/10/2026' }, /valid date/],
    [{ date: '2026-02-30' }, /valid date/],
    [{ start: '9.30' }, /HH:mm/],
    [{ end: '24:00' }, /HH:mm/],
    [{ start: '' }, /HH:mm/],
    [{ note: 'x'.repeat(1001) }, /note/],
  ])('rejects %p', (over, msg) => {
    const r = v(over);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(msg);
  });

  it('an unknown zone is an error, not a silent guess', () => {
    expect(validateEntry({ date: '2026-10-10', start: '09:00', end: '10:00' }, 'Not/AZone', NOW)).toMatchObject({ ok: false });
  });

  it('entries over 8h are allowed (the cap is server config) but flagged with a hint', () => {
    const r = v({ start: '00:00', end: '09:00' });
    expect(r).toMatchObject({ ok: true, minutes: 540, longEntryHint: true });
    expect(v({ start: '01:00', end: '09:00' })).toMatchObject({ longEntryHint: false }); // exactly 8h
  });
});

describe('time entry writes', () => {
  it('POST /time/entries sends task_id, ISO UTC times and an optional trimmed note', async () => {
    useHttp(() => created({ id: 44 }, { warning: 'This task is already PASS.' }));
    const r = await createTimeEntry({ taskId: 5, startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:30:00.000Z', note: '  did it  ' });
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      url: '/time/entries',
      body: { task_id: 5, started_at: '2026-10-10T04:00:00.000Z', ended_at: '2026-10-10T05:30:00.000Z', note: 'did it' },
    });
    expect(String(calls.at(-1)?.contentType)).not.toContain('multipart');
    expect(r).toEqual({ id: 44, warning: 'This task is already PASS.' });

    await createTimeEntry({ taskId: 5, startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:30:00.000Z', note: '   ' });
    expect(calls.at(-1)?.body).not.toHaveProperty('note');
  });

  it('a missing task is rejected without a request', async () => {
    await expect(createTimeEntry({ taskId: 0, startedAt: 'a', endedAt: 'b' })).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [403, 'forbidden', 'Only people assigned to this task can track time on it.'],
    [409, 'conflict', 'That overlaps existing time on "Fix login" (04:00–05:30).'],
    [400, 'validation', 'A single entry cannot exceed 8 hours.'],
    [400, 'validation', 'Cannot log time in the future.'],
  ] as const)('create %i is verbatim: %s', async (status, kind, message) => {
    useHttp(() => fail(status, message));
    await expect(createTimeEntry({ taskId: 5, startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:30:00.000Z' })).rejects.toMatchObject({ kind, message });
  });

  it('PUT /time/entries/:id sends started_at, ended_at and note, and validates dates first', async () => {
    useHttp(() => ok({}));
    await updateTimeEntry(9, { startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:00:00.000Z', note: ' hi ' });
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', url: '/time/entries/9', body: { started_at: '2026-10-10T04:00:00.000Z', ended_at: '2026-10-10T05:00:00.000Z', note: 'hi' } });
    calls.length = 0;
    await expect(updateTimeEntry(9, { startedAt: 'nonsense', endedAt: '2026-10-10T05:00:00.000Z', note: '' })).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0); // an unparseable date would make the server answer 500
  });

  it('update 409/403 and DELETE are verbatim', async () => {
    useHttp(() => fail(409, 'That overlaps existing time on "Docs" (09:00–10:00).'));
    await expect(updateTimeEntry(9, { startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:00:00.000Z', note: '' })).rejects.toMatchObject({ message: 'That overlaps existing time on "Docs" (09:00–10:00).' });
    useHttp(() => fail(403, 'You can only edit your own time entries.'));
    await expect(updateTimeEntry(9, { startedAt: '2026-10-10T04:00:00.000Z', endedAt: '2026-10-10T05:00:00.000Z', note: '' })).rejects.toMatchObject({ kind: 'forbidden' });

    useHttp(() => ({ status: 200, data: { success: true, message: 'Time entry deleted' } }));
    await deleteTimeEntry(9);
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: '/time/entries/9' });
    useHttp(() => fail(404, 'Time entry not found'));
    await expect(deleteTimeEntry(9)).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('invalidation after any time change', () => {
  it('refreshes the timesheet, My Day (+ pending), running timer, task sessions and dashboards', () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    refreshTimeData(qc, 5);
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    for (const k of ['["timesheet"]', '["daily-report"]', '["daily-report-pending"]', '["running-timer"]', '["task-sessions",5]', '["task",5]', '["tasks"]', '["dashboard"]']) {
      expect(keys).toContain(k);
    }
  });
});
