/**
 * QA workflow. Endpoints (task-tracking-api routes/qaRoutes.js, taskRoutes.js):
 *   GET  /tasks?status=X&include_subtasks=true | /tasks?overdue_to_qa=true
 *   GET  /tasks/:id/qa/summary      GET  /tasks/:id/qa
 *   POST /tasks/:id/qa              POST /tasks/:id/qa/:testCaseId/result
 * BACKEND GAP: the server does not check project membership or assignment on
 * these endpoints, so the app's role gating is a courtesy, not security.
 */
import { get, post } from './client';
import { AppError } from './errors';
import { parseTasks, type PersonRef, type Task } from './models';
import { asObj, mapArray, nonEmpty, num, numOr, str } from './parse';

export const QA_QUEUE_STATUSES = ['READY_FOR_QA', 'FAIL', 'REOPEN'] as const;
export type QAQueueStatus = (typeof QA_QUEUE_STATUSES)[number];

/** Parents carry `ready_subtasks` only when include_subtasks=true is sent. */
export const getQAQueue = async (status: QAQueueStatus): Promise<Task[]> =>
  parseTasks(
    await get<unknown>('/tasks', {
      params: status === 'READY_FOR_QA' ? { status, include_subtasks: true } : { status },
    }),
  );

export const getOverdueToQA = async (): Promise<Task[]> =>
  parseTasks(await get<unknown>('/tasks', { params: { overdue_to_qa: true } }));

export interface QASummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  pass_rate: number;
}

export const parseQASummary = (raw: unknown): QASummary => {
  const o = asObj(raw);
  return {
    total: numOr(o.total),
    passed: numOr(o.passed),
    failed: numOr(o.failed),
    pending: numOr(o.pending),
    pass_rate: Math.min(100, Math.max(0, numOr(o.pass_rate))),
  };
};

export const getQASummary = async (taskId: number): Promise<QASummary> =>
  parseQASummary(await get<unknown>(`/tasks/${taskId}/qa/summary`));

export type ResultStatus = 'pending' | 'pass' | 'fail';

export interface TestResult {
  status: ResultStatus;
  notes: string | null;
  reopen_count: number;
  tested_at: string | null;
  tester: PersonRef | null;
}

export interface TestCase {
  id: number;
  title: string;
  description: string | null;
  steps: string | null;
  expected_result: string | null;
  order_index: number;
  /** At most one: the latest result. */
  results: TestResult[];
}

const resultStatus = (v: unknown): ResultStatus => (v === 'pass' || v === 'fail' ? v : 'pending');

export const parseTestCases = (raw: unknown): TestCase[] =>
  mapArray(raw, (c): TestCase | null => {
    const o = asObj(c);
    const id = num(o.id);
    if (id === null) return null;
    return {
      id,
      title: nonEmpty(o.title) ?? `Test case ${id}`,
      description: nonEmpty(o.description),
      steps: nonEmpty(o.steps),
      expected_result: nonEmpty(o.expected_result),
      order_index: numOr(o.order_index),
      results: mapArray(o.results, (r) => {
        const ro = asObj(r);
        const t = asObj(ro.tester);
        const tid = num(t.id);
        return {
          status: resultStatus(ro.status),
          notes: str(ro.notes) || null,
          reopen_count: numOr(ro.reopen_count),
          tested_at: nonEmpty(ro.tested_at),
          tester: tid === null ? null : { id: tid, name: nonEmpty(t.name) ?? 'Unknown' },
        };
      }),
    };
  }).sort((a, b) => a.order_index - b.order_index || a.id - b.id);

export const latestResult = (c: TestCase): TestResult | null => c.results[0] ?? null;

export const getTestCases = async (taskId: number): Promise<TestCase[]> =>
  parseTestCases(await get<unknown>(`/tasks/${taskId}/qa`));

/**
 * POST /tasks/:id/qa/:testCaseId/result as JSON {status:'pass'|'fail'} (lowercase).
 * NOTE: the server upserts, resets result attachments to [] on every resubmit,
 * and a 'fail' increments the TASK's reopen_count EVERY time, even if the case
 * was already failed. Callers must confirm before sending 'fail'.
 */
export const submitTestResult = (taskId: number, testCaseId: number, status: 'pass' | 'fail') =>
  post<unknown>(`/tasks/${taskId}/qa/${testCaseId}/result`, { status });

export const TITLE_MAX = 300;

export interface NewTestCase {
  title: string;
  steps?: string;
  expected_result: string;
}

/** Both title (<= 300) and expected_result are required; the server answers 422 otherwise. */
export function validateNewTestCase(v: { title: string; steps: string; expected_result: string }):
  | { ok: true; body: NewTestCase }
  | { ok: false; errors: { title?: string; expected_result?: string } } {
  const title = v.title.trim();
  const expected = v.expected_result.trim();
  const errors: { title?: string; expected_result?: string } = {};
  if (!title) errors.title = 'Enter a title';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters`;
  if (!expected) errors.expected_result = 'Enter the expected result';
  if (errors.title || errors.expected_result) return { ok: false, errors };
  const steps = v.steps.trim();
  return { ok: true, body: { title, ...(steps ? { steps } : {}), expected_result: expected } };
}

export async function addTestCase(taskId: number, v: { title: string; steps: string; expected_result: string }) {
  const r = validateNewTestCase(v);
  if (!r.ok) {
    throw new AppError({ kind: 'validation', message: r.errors.title ?? r.errors.expected_result ?? 'Invalid test case' });
  }
  return post<unknown>(`/tasks/${taskId}/qa`, r.body);
}
