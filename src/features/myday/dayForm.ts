import type { DailyReport, DayItem, SaveBody } from '@/api/dailyReportApi';
import { formatDuration } from '@/utils/time';

/** Client-side caps (the server has none). */
export const MAX_TEXT = 2000;
export const MAX_NOTE = 1000;
export const MAX_DAY_MINUTES = 24 * 60;

export interface FormItem {
  /** DayItem.key */
  key: string;
  minutes: number;
  note: string;
}

export interface DayForm {
  summary: string;
  blockers: string;
  tomorrow_plan: string;
  items: FormItem[];
}

export const buildForm = (report: DailyReport): DayForm => ({
  summary: report.summary.slice(0, MAX_TEXT),
  blockers: report.blockers.slice(0, MAX_TEXT),
  tomorrow_plan: report.tomorrow_plan.slice(0, MAX_TEXT),
  items: report.items.map((i) => ({ key: i.key, minutes: i.minutes, note: i.note.slice(0, MAX_NOTE) })),
});

export const formKey = (f: DayForm): string => JSON.stringify(f);

/** Dirty = the form differs from what the server last returned (or what we last saved). */
export const isDirty = (form: DayForm | null, baseline: DayForm | null): boolean =>
  form !== null && baseline !== null && formKey(form) !== formKey(baseline);

/**
 * PUT/submit body. The server REPLACES every line, so the full list is always
 * sent:
 *  - editable lines are rebuilt with the edited minutes/note,
 *  - read-only lines (no task id) are the server's own objects, verbatim,
 *  - entries that could not even be parsed are sent back untouched.
 * Nothing is ever dropped.
 */
export function toSaveBody(report: DailyReport, form: DayForm): SaveBody {
  const edits = new Map(form.items.map((i) => [i.key, i]));
  return {
    date: report.date,
    summary: form.summary.trim(),
    blockers: form.blockers.trim(),
    tomorrow_plan: form.tomorrow_plan.trim(),
    items: [
      ...report.items.map((i): Record<string, unknown> => {
        if (i.readOnly) return i.raw;
        const e = edits.get(i.key);
        return {
          task_id: i.task_id,
          project_id: i.project_id,
          task_title: i.task_title,
          project_name: i.project_name,
          minutes: e ? e.minutes : i.minutes,
          auto_minutes: i.auto_minutes,
          note: (e ? e.note : i.note).trim(),
          source: i.source,
        };
      }),
      ...report.unparsedItems.map((u) => u as Record<string, unknown>),
    ],
  };
}

const editedLine = (cur: FormItem | undefined, base: FormItem | undefined) =>
  !!cur && !!base && (cur.minutes !== base.minutes || cur.note !== base.note);

export interface MergeResult {
  form: DayForm;
  /** True when unedited lines (or text) took newer server values than the form showed. */
  changed: boolean;
  /**
   * User-edited lines that no longer exist on the server. They are NOT kept in
   * the form (the save body is rebuilt from the server's lines, so keeping them
   * would silently lose them); the caller must tell the user.
   */
  dropped: FormItem[];
}

/**
 * Merges a FRESH server day into the user's form. Lines the user did not touch
 * (vs `baseline`) take the server's values, so newer tracked time is never
 * overwritten by a stale cache; lines the user edited keep THEIR values.
 */
export function mergeServerIntoForm(fresh: DailyReport, form: DayForm, baseline: DayForm): MergeResult {
  const base = new Map(baseline.items.map((i) => [i.key, i]));
  const cur = new Map(form.items.map((i) => [i.key, i]));
  let changed = false;

  const items: FormItem[] = fresh.items.map((item) => {
    const c = cur.get(item.key);
    if (editedLine(c, base.get(item.key))) return c as FormItem;
    const next = { key: item.key, minutes: item.minutes, note: item.note.slice(0, MAX_NOTE) };
    if (!c || c.minutes !== next.minutes || c.note !== next.note) changed = true;
    return next;
  });
  // Edited lines that vanished from the server cannot be saved (toSaveBody sends the
  // server's lines): report them instead of keeping them invisibly in the form.
  const have = new Set(fresh.items.map((i) => i.key));
  const dropped = form.items.filter((c) => !have.has(c.key) && editedLine(c, base.get(c.key)));
  if (dropped.length > 0) changed = true;

  const text = (k: 'summary' | 'blockers' | 'tomorrow_plan') => {
    if (form[k] !== baseline[k]) return form[k]; // the user typed here
    const server = fresh[k].slice(0, MAX_TEXT);
    if (server !== form[k]) changed = true;
    return server;
  };
  return {
    form: { summary: text('summary'), blockers: text('blockers'), tomorrow_plan: text('tomorrow_plan'), items },
    changed,
    dropped,
  };
}

/* ── Minutes editor: hours 0-24 + minutes 0-59 -> integer minutes, no rounding ── */

export const partsFromMinutes = (m: number) => ({ hours: Math.floor(m / 60), minutes: m % 60 });

/** Digits only; empty counts as 0. Returns null for anything else. */
export function parseWhole(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
}

export function validateParts(hoursText: string, minutesText: string): { minutes: number } | { error: string } {
  const h = parseWhole(hoursText);
  const m = parseWhole(minutesText);
  if (h === null || m === null) return { error: 'Use whole numbers only.' };
  if (h < 0 || h > 24) return { error: 'Hours must be between 0 and 24.' };
  if (m < 0 || m > 59) return { error: 'Minutes must be between 0 and 59.' };
  if (h === 24 && m > 0) return { error: 'A day cannot exceed 24 hours.' };
  return { minutes: h * 60 + m };
}

/* ── Display ─────────────────────────────────────────────────────────────── */

/** "+25m added" / "10m trimmed" / null when equal to what was tracked. */
export function varianceLabel(item: Pick<DayItem, 'minutes' | 'auto_minutes'>, minutes: number): string | null {
  const diff = minutes - item.auto_minutes;
  if (diff === 0) return null;
  return diff > 0 ? `+${formatDuration(diff)} added` : `${formatDuration(-diff)} trimmed`;
}

export interface ProjectGroup {
  key: string;
  name: string;
  color: string | null;
  minutes: number;
  items: DayItem[];
}

/** Groups by project, groups sorted by minutes (desc, using the edited minutes). */
export function groupByProject(items: readonly DayItem[], minutesOf: (i: DayItem) => number): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const i of items) {
    const key = i.project_id === null ? 'none' : String(i.project_id);
    const g = map.get(key) ?? { key, name: i.project_name ?? 'No project', color: i.project_color, minutes: 0, items: [] };
    g.minutes += minutesOf(i);
    g.items.push(i);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}
