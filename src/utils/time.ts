/** Duration helpers. Minutes are integers; the server owns the numbers. */

/** 75 -> "1h 15m", 60 -> "1h", 45 -> "45m", 0 / invalid -> "0m". */
export function formatDuration(minutes: number | null | undefined): string {
  const m = typeof minutes === 'number' && Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h}h`;
  return `${r}m`;
}

/** HH:MM:SS with hours uncapped (e.g. 100:00:00). */
export function formatClock(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

/**
 * Seconds a timer has been running: (now + server offset) - started_at,
 * floored, never negative. Always recomputed from started_at, never
 * accumulated, so backgrounding, sleep and clock changes cannot drift it.
 */
export function elapsedSeconds(startedAt: string | null | undefined, nowMs: number, offsetMs = 0): number {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((nowMs + offsetMs - start) / 1000));
}
