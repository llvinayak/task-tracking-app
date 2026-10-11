/**
 * Timesheet and time entries. Endpoints (task-tracking-api routes/timeRoutes.js):
 *   GET    /time/timesheet/me?from=&to=
 *   POST   /time/entries            PUT /time/entries/:id        DELETE /time/entries/:id
 * The server answers 500 for malformed dates and has no maximum range, so both
 * are validated here before anything is sent.
 */
import { isValidDateString } from '@/utils/dates';
import { isValidTime, utcMsToWall, wallToUtcMs } from '@/utils/companyTime';

import { del, get, put, requestFull } from './client';
import { AppError } from './errors';
import { asObj, bool, mapArray, nonEmpty, num, numOr, str } from './parse';

export interface TimesheetEntry {
  id: number;
  task_id: number;
  task_title: string;
  task_status: string | null;
  project: { id: number; name: string; color: string | null } | null;
  started_at: string | null;
  ended_at: string | null;
  minutes: number;
  note: string;
  source: string;
  auto_closed: boolean;
  reviewed_at: string | null;
}

export interface TimesheetDay {
  date: string;
  minutes: number;
  needsReview: number;
  entries: TimesheetEntry[];
}

export interface Timesheet {
  from: string;
  to: string;
  timezone: string | null;
  days: TimesheetDay[];
  totalMinutes: number;
  needsReview: number;
  byProject: { project_id: number; name: string; color: string | null; minutes: number }[];
}

export function parseTimesheet(raw: unknown): Timesheet {
  const o = asObj(raw);
  const days = mapArray(o.days, (d): TimesheetDay | null => {
    const dobj = asObj(d);
    const date = nonEmpty(dobj.date);
    if (!date || !isValidDateString(date)) return null;
    const entries = mapArray(dobj.entries, (e): TimesheetEntry | null => {
      const eo = asObj(e);
      const id = num(eo.id);
      const task_id = num(eo.task_id);
      if (id === null || task_id === null) return null;
      const p = asObj(eo.project);
      const pid = num(p.id);
      return {
        id,
        task_id,
        task_title: nonEmpty(eo.task_title) ?? `Task ${task_id}`,
        task_status: nonEmpty(eo.task_status),
        project: pid === null ? null : { id: pid, name: nonEmpty(p.name) ?? 'Project', color: nonEmpty(p.color) },
        started_at: nonEmpty(eo.started_at),
        ended_at: nonEmpty(eo.ended_at),
        minutes: Math.max(0, numOr(eo.minutes)),
        note: str(eo.note) ?? '',
        source: nonEmpty(eo.source) ?? 'timer',
        auto_closed: bool(eo.auto_closed),
        reviewed_at: nonEmpty(eo.reviewed_at),
      };
    });
    return {
      date,
      minutes: num(dobj.minutes) ?? entries.reduce((s, e) => s + e.minutes, 0),
      needsReview: numOr(dobj.needsReview),
      entries,
    };
  });
  return {
    from: nonEmpty(o.from) ?? '',
    to: nonEmpty(o.to) ?? '',
    timezone: nonEmpty(o.timezone),
    days,
    totalMinutes: num(o.totalMinutes) ?? days.reduce((s, d) => s + d.minutes, 0),
    needsReview: numOr(o.needsReview),
    byProject: mapArray(o.byProject, (b) => {
      const bo = asObj(b);
      return {
        project_id: numOr(bo.project_id),
        name: nonEmpty(bo.name) ?? 'No project',
        color: nonEmpty(bo.color),
        minutes: numOr(bo.minutes),
      };
    }),
  };
}

export const MAX_RANGE_DAYS = 31;

/** Both dates required and valid, from <= to, and a sane range (the server has no limit). */
export function validateRange(from: unknown, to: unknown): string | null {
  if (!isValidDateString(from) || !isValidDateString(to)) return 'Dates must be valid (yyyy-MM-dd).';
  if (from > to) return 'The start date must not be after the end date.';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return `Choose a range of at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

export async function getTimesheet(from: string, to: string): Promise<Timesheet> {
  const problem = validateRange(from, to);
  if (problem) throw new AppError({ kind: 'validation', message: problem });
  return parseTimesheet(await get<unknown>('/time/timesheet/me', { params: { from, to } }));
}

/* ── Entry validation (client rules; the server's messages still win) ───── */

export interface EntryInput {
  date: string; // company-timezone day, yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  note?: string;
}

export const DEFAULT_SESSION_HOURS_HINT = 8;
export const NOTE_MAX = 1000;

export interface EntryResult {
  ok: true;
  startedAt: string;
  endedAt: string;
  minutes: number;
  /** Not an error: the server may reject entries above its configured maximum. */
  longEntryHint: boolean;
}

/**
 * Same-day only, end after start, nothing in the future (company time), valid
 * values. The per-entry cap (work_max_session_hours, default 8) is NOT enforced
 * here because the config is not exposed to clients: the server's 400 is shown
 * verbatim, and an entry over 8h only gets a hint.
 */
export function validateEntry(
  input: EntryInput,
  tz: string,
  nowMs: number = Date.now(),
): EntryResult | { ok: false; error: string } {
  if (!isValidDateString(input.date)) return { ok: false, error: 'Enter a valid date (yyyy-MM-dd).' };
  if (!isValidTime(input.start) || !isValidTime(input.end)) return { ok: false, error: 'Enter times as HH:mm (for example 09:30).' };
  if ((input.note ?? '').length > NOTE_MAX) return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
  const start = wallToUtcMs(input.date, input.start, tz);
  const end = wallToUtcMs(input.date, input.end, tz);
  if (start === null || end === null) return { ok: false, error: 'Could not work out those times in the company timezone.' };
  if (end <= start) return { ok: false, error: 'End time must be after the start time.' };
  if (start > nowMs || end > nowMs) return { ok: false, error: 'Cannot log time in the future.' };
  const today = utcMsToWall(nowMs, tz)?.date;
  if (today && input.date > today) return { ok: false, error: 'Cannot log time in the future.' };
  const minutes = Math.round((end - start) / 60000);
  return {
    ok: true,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    minutes,
    longEntryHint: minutes > DEFAULT_SESSION_HOURS_HINT * 60,
  };
}

/* ── Writes ──────────────────────────────────────────────────────────────── */

export interface CreatedEntry {
  id: number | null;
  /** Set when the task is already PASS: the entry is kept, but the user is told. */
  warning: string | null;
}

/** POST /time/entries {task_id, started_at, ended_at (ISO UTC), note?} -> 201 { data, warning }. */
export async function createTimeEntry(args: { taskId: number; startedAt: string; endedAt: string; note?: string }): Promise<CreatedEntry> {
  if (!Number.isInteger(args.taskId) || args.taskId < 1) throw new AppError({ kind: 'validation', message: 'Pick a task first.' });
  const note = args.note?.trim();
  const res = await requestFull<unknown>({
    url: '/time/entries',
    method: 'POST',
    data: { task_id: args.taskId, started_at: args.startedAt, ended_at: args.endedAt, ...(note ? { note } : {}) },
  });
  return { id: num(asObj(res.data).id), warning: res.warning };
}

/**
 * PUT /time/entries/:id. The server treats started_at / ended_at as OPTIONAL
 * (a patch), so a note-only change sends no times and the entry keeps its own,
 * even when it crosses midnight. Unparseable dates make the server 500, so any
 * time that IS sent is validated first.
 */
export async function updateTimeEntry(id: number, args: { startedAt?: string; endedAt?: string; note: string }): Promise<void> {
  const times = [args.startedAt, args.endedAt];
  if ((args.startedAt === undefined) !== (args.endedAt === undefined)) {
    throw new AppError({ kind: 'validation', message: 'Start and end times are required.' });
  }
  if (times.some((t) => t !== undefined && Number.isNaN(Date.parse(t)))) {
    throw new AppError({ kind: 'validation', message: 'Start and end times are required.' });
  }
  await put<unknown>(`/time/entries/${id}`, {
    ...(args.startedAt !== undefined && args.endedAt !== undefined ? { started_at: args.startedAt, ended_at: args.endedAt } : {}),
    note: args.note.trim(),
  });
}

export async function deleteTimeEntry(id: number): Promise<void> {
  await del<unknown>(`/time/entries/${id}`);
}
