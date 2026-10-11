/**
 * Daily report ("My Day"). Endpoints (task-tracking-api routes/dailyReportRoutes.js):
 *   GET  /daily-report?date=   PUT /daily-report   POST /daily-report/submit
 *   GET  /daily-report/pending (always today, ignores ?date)
 * Days are bucketed in the COMPANY timezone: omit `date` for today.
 */
import { isValidDateString } from '@/utils/dates';

import { get, put, requestFull } from './client';
import { AppError } from './errors';
import { asArray, asObj, bool, mapArray, nonEmpty, num, numOr, str } from './parse';

export interface DayItem {
  /** Stable identity for the form: task-based when possible (the server replaces ids on every PUT). */
  key: string;
  id: number | null;
  /** null = a manual / unknown line. It is kept, shown read-only, and sent back unchanged. */
  task_id: number | null;
  /** The line exactly as the server sent it; read-only lines are PUT back verbatim from this. */
  raw: Record<string, unknown>;
  readOnly: boolean;
  task_title: string;
  project_id: number | null;
  project_name: string | null;
  project_color: string | null;
  auto_minutes: number;
  minutes: number;
  note: string;
  source: string;
  needs_review: boolean;
  session_count: number;
  edited: boolean;
}

export interface DailyReport {
  date: string;
  timezone: string | null;
  status: 'draft' | 'submitted';
  exists: boolean;
  summary: string;
  blockers: string;
  tomorrow_plan: string;
  submitted_at: string | null;
  reopened_at: string | null;
  reopened_by: { id: number; name: string } | null;
  items: DayItem[];
  /** Entries that were not objects at all. The PUT replaces every line, so they are sent back untouched. */
  unparsedItems: unknown[];
  totalMinutes: number;
  trackedMinutes: number;
  needsReview: number;
}

export function parseDailyReport(raw: unknown): DailyReport | null {
  const o = asObj(raw);
  const date = nonEmpty(o.date);
  if (!date || !isValidDateString(date)) return null;
  const rb = asObj(o.reopened_by);
  const rbId = num(rb.id);
  const items: DayItem[] = [];
  const unparsedItems: unknown[] = [];
  const seen = new Set<string>();
  asArray(o.items).forEach((i, index) => {
    if (!i || typeof i !== 'object' || Array.isArray(i)) {
      unparsedItems.push(i);
      return;
    }
    const io = asObj(i);
    const task_id = num(io.task_id);
    const id = num(io.id);
    let key = task_id !== null ? `task:${task_id}` : id !== null ? `id:${id}` : `idx:${index}`;
    while (seen.has(key)) key += `#${index}`;
    seen.add(key);
    items.push({
      key,
      id,
      task_id,
      raw: io,
      readOnly: task_id === null,
      task_title: nonEmpty(io.task_title) ?? (task_id !== null ? `Task ${task_id}` : 'Manual entry'),
      project_id: num(io.project_id),
      project_name: nonEmpty(io.project_name),
      project_color: nonEmpty(io.project_color),
      auto_minutes: Math.max(0, numOr(io.auto_minutes)),
      minutes: Math.max(0, numOr(io.minutes)),
      note: str(io.note) ?? '',
      source: nonEmpty(io.source) ?? 'auto',
      needs_review: bool(io.needs_review),
      session_count: numOr(io.session_count),
      edited: bool(io.edited),
    });
  });
  const totalFromItems = items.reduce((s, i) => s + i.minutes, 0);
  return {
    date,
    timezone: nonEmpty(o.timezone),
    status: o.status === 'submitted' ? 'submitted' : 'draft',
    exists: bool(o.exists),
    summary: str(o.summary) ?? '',
    blockers: str(o.blockers) ?? '',
    tomorrow_plan: str(o.tomorrow_plan) ?? '',
    submitted_at: nonEmpty(o.submitted_at),
    reopened_at: nonEmpty(o.reopened_at),
    reopened_by: rbId === null ? null : { id: rbId, name: nonEmpty(rb.name) ?? 'a manager' },
    items,
    unparsedItems,
    totalMinutes: num(o.totalMinutes) ?? totalFromItems,
    trackedMinutes: numOr(o.trackedMinutes),
    needsReview: Math.max(0, numOr(o.needsReview)),
  };
}

/** `date` omitted (undefined) = today in the company timezone. Past days must be yyyy-MM-dd. */
export async function getDailyReport(date?: string): Promise<DailyReport> {
  if (date !== undefined && !isValidDateString(date)) {
    throw new AppError({ kind: 'validation', message: 'That date is not valid.' });
  }
  const report = parseDailyReport(await get<unknown>('/daily-report', date ? { params: { date } } : undefined));
  if (!report) throw new AppError({ kind: 'unknown', message: 'The day could not be loaded.' });
  return report;
}

export interface SaveBody {
  date: string;
  summary: string;
  blockers: string;
  tomorrow_plan: string;
  /** Editable lines are rebuilt; read-only and unparsed lines are the server's own objects, untouched. */
  items: Record<string, unknown>[];
}

/** The server does not validate the date, so we do. */
function assertBody(body: SaveBody) {
  if (!isValidDateString(body.date)) {
    throw new AppError({ kind: 'validation', message: 'That date is not valid.' });
  }
}

/** PUT replaces ALL items: always send the full list. 409 when already submitted. */
export async function saveDailyReport(body: SaveBody): Promise<DailyReport | null> {
  assertBody(body);
  return parseDailyReport(await put<unknown>('/daily-report', body));
}

/** POST /daily-report/submit. 409 already submitted; 400 needs-review / nothing to report. */
export async function submitDailyReport(body: SaveBody): Promise<{ report: DailyReport | null; message: string }> {
  assertBody(body);
  const res = await requestFull<unknown>({ url: '/daily-report/submit', method: 'POST', data: body });
  return { report: parseDailyReport(res.data), message: res.message ?? 'Day submitted. Nice work.' };
}

export interface PendingDay {
  date: string | null;
  needsSubmit: boolean;
  status: string | null;
  trackedMinutes: number;
  taskCount: number;
}

export const parsePending = (raw: unknown): PendingDay => {
  const o = asObj(raw);
  return {
    date: nonEmpty(o.date),
    needsSubmit: o.needsSubmit === true,
    status: nonEmpty(o.status),
    trackedMinutes: numOr(o.trackedMinutes),
    taskCount: numOr(o.taskCount),
  };
};

export const getPendingDay = async (): Promise<PendingDay> =>
  parsePending(await get<unknown>('/daily-report/pending'));

/* ── Auto-closed entries (needed before submit) ──────────────────────────── */

export interface ReviewEntry {
  id: number;
  task_id: number;
  task_title: string;
  minutes: number;
  started_at: string | null;
  ended_at: string | null;
}

/**
 * GET /time/timesheet/me?from=&to= (both required, yyyy-MM-dd, company tz)
 * -> data.days[{ date, entries[{ id, task_id, task_title, minutes, started_at,
 * ended_at, auto_closed, reviewed_at }], needsReview }]. We keep only the
 * entries of one day that are auto-closed and not yet reviewed.
 */
export async function getUnreviewedEntries(date: string): Promise<ReviewEntry[]> {
  if (!isValidDateString(date)) throw new AppError({ kind: 'validation', message: 'That date is not valid.' });
  const data = asObj(await get<unknown>('/time/timesheet/me', { params: { from: date, to: date } }));
  const out: ReviewEntry[] = [];
  for (const d of mapArray(data.days, (x) => asObj(x))) {
    for (const e of mapArray(d.entries, (x) => asObj(x))) {
      const id = num(e.id);
      const task_id = num(e.task_id);
      if (id === null || task_id === null) continue;
      if (e.auto_closed === true && !e.reviewed_at) {
        out.push({
          id,
          task_id,
          task_title: nonEmpty(e.task_title) ?? `Task ${task_id}`,
          minutes: numOr(e.minutes),
          started_at: nonEmpty(e.started_at),
          ended_at: nonEmpty(e.ended_at),
        });
      }
    }
  }
  return out;
}

/** POST /time/entries/:id/review (owner only; 403 for someone else's, 404 unknown). */
export const reviewEntry = async (id: number): Promise<void> => {
  await requestFull<unknown>({ url: `/time/entries/${id}/review`, method: 'POST' });
};
