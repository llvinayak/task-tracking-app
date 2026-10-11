/**
 * Date helpers.
 *
 * - 'yyyy-MM-dd' (Sequelize DATEONLY) is a CALENDAR day: parsed as a LOCAL
 *   date. `new Date('2025-03-10')` would be UTC midnight and shift to the
 *   previous day for users west of UTC.
 * - Anything with a time part (ISO timestamps) is an instant.
 * - "Today" comes from the device clock, isolated behind getNow() so tests
 *   (and, later, a server-time source) can replace it.
 */

let nowProvider: () => Date = () => new Date();
export const setNowProvider = (fn: () => Date) => {
  nowProvider = fn;
};
export const resetNowProvider = () => {
  nowProvider = () => new Date();
};
export const getNow = () => nowProvider();

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const getToday = () => startOfLocalDay(getNow());

/** Parses a server date. Returns null for empty / invalid input. */
export function parseServerDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  const m = DATE_ONLY.exec(v);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // Reject overflow such as 2025-02-31.
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
  }
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t;
}

const MS_PER_DAY = 86_400_000;

/**
 * Whole calendar days from today to `value` (negative = in the past).
 * Uses UTC arithmetic on the local Y-M-D so DST changes never yield 23/25h days.
 */
export function daysFromToday(value: unknown): number | null {
  const d = parseServerDate(value);
  if (!d) return null;
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const t = getToday();
  const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((a - b) / MS_PER_DAY);
}

/**
 * Days left for a sprint, computed from its end date on THIS device's calendar.
 * The server clamps sprint daysLeft to >= 0 and mixes UTC, so a finished sprint
 * would never read "overdue". The server number is only a fallback when no
 * end date was sent.
 */
export function daysLeftFor(endDate: unknown, serverDaysLeft: number | null = null): number | null {
  return daysFromToday(endDate) ?? serverDaysLeft;
}

export function daysLeftLabel(days: number): { text: string; tone: 'danger' | 'warning' | 'info' } {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'danger' };
  if (days === 0) return { text: 'Ends today', tone: 'warning' };
  return { text: `${days}d left`, tone: days <= 3 ? 'warning' : 'info' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'd MMM' (web format), plus the year when it is not the current one. */
export function formatDay(value: unknown): string {
  const d = parseServerDate(value);
  if (!d) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === getNow().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/* ── Company-timezone day strings (My Day) ───────────────────────────────────
 * The server buckets days in the COMPANY timezone, so "today" and every other
 * day come from the server's returned `date`. Moving to the previous or next
 * day is pure yyyy-MM-dd arithmetic on that string (UTC calendar maths), never
 * on the device timezone.
 */
export function isValidDateString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = DATE_ONLY.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function addDaysToDateString(date: string, days: number): string {
  const m = DATE_ONLY.exec(date);
  if (!m || !isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Fri, 10 Oct 2026" from a yyyy-MM-dd string, independent of the device timezone. */
export function formatDateLabel(date: string): string {
  const m = DATE_ONLY.exec(date);
  if (!m || !isValidDateString(date)) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** 'd MMM, HH:mm' for instants. */
export function formatDateTime(value: unknown): string {
  const d = parseServerDate(value);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDay(value)}, ${hh}:${mm}`;
}
