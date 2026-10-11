/**
 * Pure helpers for the typed date/time fields of the time-entry sheet. The user only
 * types digits (a number pad has no "-" or ":"); the separators are inserted here.
 * Validation of the result stays in api/timesheetApi.validateEntry, unchanged.
 */

/** "20261010" / "2026-10-1" / pasted "2026/10/10" -> "2026-10-10" (digits only, max 8). */
export function maskDate(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/**
 * Digits -> "HH:mm" while typing (max 4 digits; separators are inserted).
 * Rule for the FIRST digit: 0, 1 or 2 may start a 2-digit hour, so a lone digit waits for its
 * partner ("1" stays "1", "09" is "09", "093" is "09:3", "0930" is "09:30"). 3-9 can only be the
 * hour's units digit, so as soon as a second digit arrives the hour is zero-padded: "93" -> "09:3",
 * "930" -> "09:30". A lone "9" is left as typed. A typed 5th digit is dropped. Out-of-range values
 * ("25:99") are NOT corrected here: validation in api/timesheetApi.validateEntry rejects them.
 */
export function maskTime(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.length >= 2 && d.charAt(0) >= '3') d = `0${d}`;
  d = d.slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Moves an "HH:mm" value by `deltaMinutes`, clamped to 00:00-23:59 (it never wraps past midnight:
 * entries are single-day). An invalid value is returned unchanged.
 */
export function shiftHHmm(value: string, deltaMinutes: number): string {
  const m = HHMM.exec(value);
  if (!m) return value;
  const total = Math.min(23 * 60 + 59, Math.max(0, Number(m[1]) * 60 + Number(m[2]) + deltaMinutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const isHHmm = (value: string): boolean => HHMM.test(value);
