import { get, post, requestFull } from './client';
import type { ProjectRef } from './models';
import { asObj, bool, mapArray, nonEmpty, num, numOr } from './parse';

/* ── Running timer ───────────────────────────────────────────────────────── */

export interface RunningTimer {
  id: number;
  started_at: string;
  elapsed_minutes: number;
  task: {
    id: number;
    title: string;
    status: string;
    project_id: number | null;
    dev_owner_id: number | null;
    qa_owner_id: number | null;
    support_owner_id: number | null;
    qa_required: boolean;
    project: ProjectRef | null;
  };
}

/** Returns null for "no timer" and for anything unusable (never throws). */
export function parseRunningTimer(raw: unknown): RunningTimer | null {
  const o = asObj(raw);
  const id = num(o.id);
  const startedAt = nonEmpty(o.started_at);
  const t = asObj(o.task);
  const taskId = num(t.id);
  if (id === null || !startedAt || Number.isNaN(Date.parse(startedAt)) || taskId === null) return null;
  const p = asObj(t.project);
  const pid = num(p.id);
  return {
    id,
    started_at: startedAt,
    elapsed_minutes: numOr(o.elapsed_minutes),
    task: {
      id: taskId,
      title: nonEmpty(t.title) ?? `Task ${taskId}`,
      status: nonEmpty(t.status) ?? '',
      project_id: num(t.project_id),
      dev_owner_id: num(t.dev_owner_id),
      qa_owner_id: num(t.qa_owner_id),
      support_owner_id: num(t.support_owner_id),
      qa_required: bool(t.qa_required),
      project: pid === null ? null : { id: pid, name: nonEmpty(p.name) ?? 'Project', color: nonEmpty(p.color) },
    },
  };
}

/** GET /time/running -> data: null | running session with task. */
export const getRunningTimer = async (): Promise<RunningTimer | null> =>
  parseRunningTimer(await get<unknown>('/time/running'));

/* ── Start / stop ────────────────────────────────────────────────────────── */

export interface StartTimerResult {
  startedId: number | null;
  /** Timer that was auto-stopped by this call, if any. */
  stopped: { id: number; taskId: number | null; title: string | null; minutes: number } | null;
  /** Top-level `warning`, e.g. "this task is already PASS". */
  warning: string | null;
}

/**
 * POST /tasks/:taskId/timer/start (no body: the optional note is not sent)
 * -> 201 { data: { started, stopped|null }, warning, message }.
 * Starting on another task stops the running one in the same call.
 */
export async function startTimer(taskId: number): Promise<StartTimerResult> {
  const res = await requestFull<unknown>({ url: `/tasks/${taskId}/timer/start`, method: 'POST' });
  const d = asObj(res.data);
  const stopped = asObj(d.stopped);
  const stoppedId = num(stopped.id);
  return {
    startedId: num(asObj(d.started).id),
    // ASSUMPTION: the stopped session may carry task{title}; the caller falls back to the cached running timer.
    stopped:
      stoppedId === null
        ? null
        : {
            id: stoppedId,
            taskId: num(stopped.task_id) ?? num(asObj(stopped.task).id),
            title: nonEmpty(asObj(stopped.task).title),
            minutes: numOr(stopped.duration_minutes),
          },
    warning: res.warning,
  };
}

export interface StoppedSession {
  id: number | null;
  duration_minutes: number;
  auto_closed: boolean;
}

/** POST /time/stop -> 200 data: session. 404 'You have no timer running.' = already stopped. */
export async function stopTimer(): Promise<StoppedSession> {
  const d = asObj(await post<unknown>('/time/stop'));
  return { id: num(d.id), duration_minutes: numOr(d.duration_minutes), auto_closed: bool(d.auto_closed) };
}

/* ── Per-task time ───────────────────────────────────────────────────────── */

export interface TaskSessions {
  totalMinutes: number;
  byUser: { user_id: number; name: string; minutes: number; sessions: number; running: boolean }[];
}

export const parseTaskSessions = (raw: unknown): TaskSessions => {
  const o = asObj(raw);
  return {
    totalMinutes: numOr(o.totalMinutes),
    byUser: mapArray(o.byUser, (u) => {
      const uo = asObj(u);
      const id = num(uo.user_id);
      if (id === null) return null;
      return {
        user_id: id,
        name: nonEmpty(uo.name) ?? 'Unknown',
        minutes: numOr(uo.minutes),
        sessions: numOr(uo.sessions),
        running: bool(uo.running),
      };
    }),
  };
};

/** GET /tasks/:id/sessions -> { totalMinutes, byUser[] } (the raw sessions list is ignored). */
export const getTaskSessions = async (taskId: number): Promise<TaskSessions> =>
  parseTaskSessions(await get<unknown>(`/tasks/${taskId}/sessions`));
