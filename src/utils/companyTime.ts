/**
 * Company-timezone helpers for the timesheet.
 *
 * The server buckets days (and decides which day an entry belongs to) in the
 * COMPANY timezone (config `work_timezone`, default Asia/Kolkata; every
 * timesheet/day response carries it as `timezone`). Entry times are therefore
 * typed, shown and converted in company time, never silently in the device zone.
 * Conversion uses Intl with an IANA zone name; when Intl cannot resolve the
 * zone every function returns null and callers fall back to the device zone
 * with a visible warning.
 */
import { addDaysToDateString, isValidDateString } from './dates';

const p2 = (n: number) => String(n).padStart(2, '0');

type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function partsInZone(tz: string, utcMs: number): Parts | null {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const got: Record<string, number> = {};
    for (const part of f.formatToParts(new Date(utcMs))) {
      if (part.type !== 'literal') got[part.type] = Number(part.value);
    }
    const { year, month, day, hour, minute, second } = got;
    if ([year, month, day, hour, minute, second].some((v) => v === undefined || Number.isNaN(v))) return null;
    return { y: year as number, mo: month as number, d: day as number, h: (hour as number) % 24, mi: minute as number, s: second as number };
  } catch {
    return null;
  }
}

/** Offset of `tz` from UTC at that instant, in minutes (IST = 330). null if the zone is unknown. */
export function tzOffsetMinutes(tz: string, utcMs: number): number | null {
  const p = partsInZone(tz, utcMs);
  if (!p) return null;
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** The wall-clock date and time an instant has in `tz`. */
export function utcMsToWall(utcMs: number, tz: string): { date: string; time: string } | null {
  const p = partsInZone(tz, utcMs);
  if (!p) return null;
  return { date: `${p.y}-${p2(p.mo)}-${p2(p.d)}`, time: `${p2(p.h)}:${p2(p.mi)}` };
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const isValidTime = (v: unknown): v is string => typeof v === 'string' && HHMM.test(v.trim());

/** Normalizes "9:5"-style input is NOT attempted: require H:mm / HH:mm. */
export function normalizeTime(v: string): string | null {
  const m = HHMM.exec(v.trim());
  return m ? `${p2(Number(m[1]))}:${m[2]}` : null;
}

/**
 * Wall-clock date + time in `tz` -> UTC instant (ms). Two passes handle the
 * (rare) offset change right at the boundary. null for an invalid date/time or
 * an unknown zone.
 */
export function wallToUtcMs(date: string, time: string, tz: string): number | null {
  const t = normalizeTime(time);
  if (!isValidDateString(date) || !t) return null;
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = t.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off1 = tzOffsetMinutes(tz, guess);
  if (off1 === null) return null;
  let utc = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(tz, utc);
  if (off2 !== null && off2 !== off1) utc = guess - off2 * 60000;
  return utc;
}

/** The device's own offset at that instant, in minutes. */
export const deviceOffsetMinutes = (utcMs: number) => -new Date(utcMs).getTimezoneOffset();

/** True when the device zone and the company zone disagree right now. */
export function timezonesDiffer(tz: string, utcMs: number): boolean {
  const company = tzOffsetMinutes(tz, utcMs);
  return company !== null && company !== deviceOffsetMinutes(utcMs);
}

/* ── Weeks (Monday to Sunday), pure yyyy-MM-dd arithmetic ───────────────── */

export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysToDateString(date, -((dow + 6) % 7));
}

export function weekRange(date: string): { from: string; to: string } {
  const from = weekStart(date);
  return { from, to: addDaysToDateString(from, 6) };
}

export function weekDates(date: string): string[] {
  const from = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateString(from, i));
}
