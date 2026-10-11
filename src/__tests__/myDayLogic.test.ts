import {
  getDailyReport,
  getPendingDay,
  getUnreviewedEntries,
  parseDailyReport,
  reviewEntry,
  saveDailyReport,
  submitDailyReport,
  type DailyReport,
} from '@/api/dailyReportApi';
import {
  buildForm,
  groupByProject,
  isDirty,
  formKey,
  partsFromMinutes,
  toSaveBody,
  validateParts,
  varianceLabel,
} from '@/features/myday/dayForm';
import { calls, created, fail, installHttpAdapter, ok, resetHttp, useHttp } from '@/test/mockHttp';
import { addDaysToDateString, formatDateLabel, isValidDateString } from '@/utils/dates';

beforeAll(installHttpAdapter);
beforeEach(resetHttp);

const rawDay = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-10',
  timezone: 'Asia/Kolkata',
  status: 'draft',
  exists: true,
  summary: 'S',
  blockers: '',
  tomorrow_plan: '',
  submitted_at: null,
  reopened_at: null,
  reopened_by: null,
  items: [
    { id: 1, task_id: 5, task_title: 'Fix login', project_id: 2, project_name: 'Alpha', project_color: '#3366ff', auto_minutes: 60, minutes: 60, note: '', source: 'auto', needs_review: false, session_count: 1, edited: false },
    { id: 2, task_id: 6, task_title: 'Write docs', project_id: 3, project_name: 'Beta', project_color: '#ff6633', auto_minutes: 90, minutes: 120, note: 'n', source: 'auto', needs_review: true, session_count: 3, edited: true },
    { id: null, task_id: 7, task_title: 'Ad hoc', project_id: 2, project_name: 'Alpha', project_color: '#3366ff', auto_minutes: 0, minutes: 15, note: '', source: 'manual', needs_review: false, session_count: 0, edited: false },
  ],
  totalMinutes: 195,
  trackedMinutes: 150,
  needsReview: 1,
  ...over,
});
const day = (over: Record<string, unknown> = {}): DailyReport => parseDailyReport(rawDay(over)) as DailyReport;

describe('company-timezone date arithmetic (no device-TZ dependence)', () => {
  it.each([
    ['2026-10-10', -1, '2026-10-09'],
    ['2026-10-01', -1, '2026-09-30'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2024-03-01', -1, '2024-02-29'], // leap year
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-10-10', 0, '2026-10-10'],
    ['2026-10-10', -30, '2026-09-10'],
  ])('%s %+i days = %s', (d, n, out) => {
    expect(addDaysToDateString(d, n)).toBe(out);
  });

  it('throws on an invalid date instead of guessing', () => {
    expect(() => addDaysToDateString('2026-02-31', 1)).toThrow();
    expect(() => addDaysToDateString('nope', 1)).toThrow();
  });

  it('validates yyyy-MM-dd strictly', () => {
    expect(isValidDateString('2026-10-10')).toBe(true);
    for (const bad of ['2026-1-1', '2026-13-01', '2026-02-30', '10/10/2026', '', null, undefined, 20261010, '2026-10-10T00:00:00Z']) {
      expect(isValidDateString(bad)).toBe(false);
    }
  });

  it('labels a date string as a calendar day regardless of timezone', () => {
    expect(formatDateLabel('2026-10-10')).toBe('Sat, 10 Oct 2026');
    expect(formatDateLabel('2026-01-01')).toBe('Thu, 1 Jan 2026');
    expect(formatDateLabel('garbage')).toBe('garbage');
  });
});

describe('daily report API: date policy', () => {
  it('today: the date param is OMITTED (the server picks the company-timezone day)', async () => {
    useHttp(() => ok(rawDay()));
    const r = await getDailyReport();
    expect(calls.at(-1)).toMatchObject({ method: 'GET', url: '/daily-report' });
    expect(calls.at(-1)?.params).toBeUndefined();
    expect(r.date).toBe('2026-10-10');
  });

  it('a past day sends ?date=yyyy-MM-dd', async () => {
    useHttp(() => ok(rawDay({ date: '2026-10-09' })));
    await getDailyReport('2026-10-09');
    expect(calls.at(-1)?.params).toEqual({ date: '2026-10-09' });
  });

  it('rejects an invalid date client-side (the server does not validate) without sending a request', async () => {
    for (const bad of ['2026-02-31', 'yesterday', '2026-1-5']) {
      await expect(getDailyReport(bad)).rejects.toMatchObject({ kind: 'validation' });
    }
    expect(calls).toHaveLength(0);
  });

  it('save/submit validate the body date client-side too', async () => {
    const body = { date: 'bogus', summary: '', blockers: '', tomorrow_plan: '', items: [] };
    await expect(saveDailyReport(body)).rejects.toMatchObject({ kind: 'validation' });
    await expect(submitDailyReport(body)).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
  });

  it('an unusable day payload becomes a clear error', async () => {
    useHttp(() => ok({ nonsense: true }));
    await expect(getDailyReport()).rejects.toThrow('could not be loaded');
  });

  it('pending: parses needsSubmit and tolerates missing fields', async () => {
    useHttp(() => ok({ date: '2026-10-10', needsSubmit: true, status: 'draft', trackedMinutes: 135, taskCount: 3 }));
    expect(await getPendingDay()).toEqual({ date: '2026-10-10', needsSubmit: true, status: 'draft', trackedMinutes: 135, taskCount: 3 });
    expect(calls.at(-1)?.url).toBe('/daily-report/pending');
    useHttp(() => ok(null));
    expect(await getPendingDay()).toMatchObject({ needsSubmit: false, trackedMinutes: 0, taskCount: 0 });
  });
});

describe('daily report parsing', () => {
  it('maps items, defaults and the reopen info', () => {
    const d = day({ reopened_at: '2026-10-10T08:00:00Z', reopened_by: { id: 3, name: 'Manager Mo' }, status: 'submitted' });
    expect(d.status).toBe('submitted');
    expect(d.reopened_by).toEqual({ id: 3, name: 'Manager Mo' });
    expect(d.items).toHaveLength(3);
    expect(d.items[2]).toMatchObject({ id: null, source: 'manual' });
    expect(d.needsReview).toBe(1);
  });

  it('is defensive: bad items skipped, missing text fields become empty strings', () => {
    const d = parseDailyReport({ date: '2026-10-10', items: [null, { nope: 1 }, { task_id: 4 }], summary: null }) as DailyReport;
    // Nothing is dropped (PUT replaces every line): non-objects are kept aside, odd objects become read-only lines.
    expect(d.unparsedItems).toEqual([null]);
    expect(d.items).toHaveLength(2);
    expect(d.items[0]).toMatchObject({ task_id: null, readOnly: true, task_title: 'Manual entry' });
    expect(d.items[1]).toMatchObject({ task_id: 4, task_title: 'Task 4', minutes: 0, note: '', readOnly: false });
    expect(d.summary).toBe('');
    expect(d.status).toBe('draft');
    expect(parseDailyReport(null)).toBeNull();
    expect(parseDailyReport({ date: 'bad' })).toBeNull();
  });
});

describe('day form: grouping, editor, variance, dirty', () => {
  it('groups by project, sums minutes and sorts groups by minutes descending', () => {
    const d = day();
    const groups = groupByProject(d.items, (i) => i.minutes);
    expect(groups.map((g) => [g.name, g.minutes])).toEqual([
      ['Beta', 120],
      ['Alpha', 75],
    ]);
    expect(groups[1]?.items.map((i) => i.task_id)).toEqual([5, 7]);
  });

  it('sorting follows EDITED minutes, and items without a project go to "No project"', () => {
    const d = day({
      items: [
        { task_id: 1, task_title: 'a', project_id: 2, project_name: 'Alpha', auto_minutes: 10, minutes: 10 },
        { task_id: 2, task_title: 'b', project_id: null, project_name: null, auto_minutes: 5, minutes: 5 },
      ],
    });
    const edited = groupByProject(d.items, (i) => (i.task_id === 2 ? 300 : i.minutes));
    expect(edited.map((g) => g.name)).toEqual(['No project', 'Alpha']);
  });

  it.each([
    ['0', '0', 0],
    ['1', '15', 75],
    ['', '', 0],
    ['24', '0', 1440],
    ['2', '59', 179],
    ['0', '45', 45],
  ])('hours %s + minutes %s = %i minutes (integer, no rounding)', (h, m, out) => {
    expect(validateParts(h, m)).toEqual({ minutes: out });
  });

  it.each([
    ['25', '0'],
    ['1', '60'],
    ['1', '75'],
    ['24', '1'],
    ['-1', '0'],
    ['1.5', '0'],
    ['abc', '0'],
    ['1', 'x'],
  ])('rejects hours %s + minutes %s', (h, m) => {
    expect(validateParts(h, m)).toHaveProperty('error');
  });

  it('splits minutes back into parts', () => {
    expect(partsFromMinutes(135)).toEqual({ hours: 2, minutes: 15 });
    expect(partsFromMinutes(0)).toEqual({ hours: 0, minutes: 0 });
  });

  it('variance wording: "+Xm added" / "Xm trimmed" / none', () => {
    const item = { minutes: 0, auto_minutes: 60 };
    expect(varianceLabel(item, 85)).toBe('+25m added');
    expect(varianceLabel(item, 50)).toBe('10m trimmed');
    expect(varianceLabel(item, 60)).toBeNull();
    expect(varianceLabel(item, 180)).toBe('+2h added');
  });

  it('dirty tracking compares against the baseline', () => {
    const f = buildForm(day());
    const base = buildForm(day());
    expect(isDirty(f, base)).toBe(false);
    expect(isDirty({ ...f, summary: 'changed' }, base)).toBe(true);
    expect(isDirty({ ...f, items: f.items.map((i, k) => (k === 0 ? { ...i, minutes: 61 } : i)) }, base)).toBe(true);
    expect(isDirty(null, base)).toBe(false);
    expect(formKey(f)).toBe(formKey(base));
  });

  it('caps long text client-side', () => {
    const f = buildForm(day({ summary: 'x'.repeat(5000) }));
    expect(f.summary).toHaveLength(2000);
  });

  it('the save body sends the FULL item list (PUT replaces all) with edits merged', () => {
    const d = day();
    const form = buildForm(d);
    form.items[0] = { ...form.items[0]!, minutes: 75, note: '  did stuff  ' };
    form.summary = '  Shipped  ';
    const body = toSaveBody(d, form);
    expect(body.date).toBe('2026-10-10');
    expect(body.summary).toBe('Shipped');
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toEqual({
      task_id: 5, project_id: 2, task_title: 'Fix login', project_name: 'Alpha', minutes: 75, auto_minutes: 60, note: 'did stuff', source: 'auto',
    });
    expect(body.items[1]).toMatchObject({ task_id: 6, minutes: 120, auto_minutes: 90 }); // untouched items still sent
    expect(body.items[2]).toMatchObject({ task_id: 7, source: 'manual' });
  });
});

describe('save / submit API contract', () => {
  const body = () => toSaveBody(day(), buildForm(day()));

  it('PUT /daily-report replaces the day and returns the parsed report', async () => {
    useHttp(() => ok(rawDay({ summary: 'saved' })));
    const r = await saveDailyReport(body());
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', url: '/daily-report' });
    expect((calls.at(-1)?.body as { items: unknown[] }).items).toHaveLength(3);
    expect(r?.summary).toBe('saved');
  });

  it('409 when already submitted is surfaced verbatim', async () => {
    useHttp(() => fail(409, 'This day has been submitted. Ask a manager to reopen it before editing.'));
    await expect(saveDailyReport(body())).rejects.toMatchObject({
      kind: 'conflict',
      message: 'This day has been submitted. Ask a manager to reopen it before editing.',
    });
  });

  it('submit returns the server message and the locked report', async () => {
    useHttp(() => ok(rawDay({ status: 'submitted' }), { message: 'Day submitted. Nice work.' }));
    const r = await submitDailyReport(body());
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/daily-report/submit' });
    expect(r.message).toBe('Day submitted. Nice work.');
    expect(r.report?.status).toBe('submitted');
  });

  it.each([
    [400, 'validation', '1 entries auto-closed and not yet confirmed. Confirm them first.'],
    [400, 'validation', 'Nothing to report for this day.'],
    [409, 'conflict', 'This day has already been submitted.'],
  ] as const)('submit %i is shown verbatim: %s', async (status, kind, message) => {
    useHttp(() => fail(status, message));
    await expect(submitDailyReport(body())).rejects.toMatchObject({ kind, message });
  });
});

describe('auto-closed entries (timesheet + review contract)', () => {
  it('GET /time/timesheet/me sends from=to=date and keeps only auto_closed && !reviewed_at', async () => {
    useHttp(() =>
      ok({
        days: [
          {
            date: '2026-10-10',
            entries: [
              { id: 1, task_id: 5, task_title: 'Fix', minutes: 480, auto_closed: true, reviewed_at: null },
              { id: 2, task_id: 5, task_title: 'Fix', minutes: 30, auto_closed: true, reviewed_at: '2026-10-10T10:00:00Z' },
              { id: 3, task_id: 6, task_title: 'Doc', minutes: 30, auto_closed: false, reviewed_at: null },
              { task_id: 9 },
            ],
          },
        ],
      }),
    );
    const entries = await getUnreviewedEntries('2026-10-10');
    expect(calls.at(-1)).toMatchObject({ method: 'GET', url: '/time/timesheet/me', params: { from: '2026-10-10', to: '2026-10-10' } });
    expect(entries.map((e) => e.id)).toEqual([1]);
  });

  it('rejects an invalid date before sending', async () => {
    await expect(getUnreviewedEntries('2026-99-99')).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
  });

  it('POST /time/entries/:id/review; 403 for someone else\'s entry is verbatim', async () => {
    useHttp(() => created({}));
    await reviewEntry(4);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/time/entries/4/review' });
    useHttp(() => fail(403, 'You can only review your own time entries.'));
    await expect(reviewEntry(4)).rejects.toMatchObject({ message: 'You can only review your own time entries.' });
  });
});
