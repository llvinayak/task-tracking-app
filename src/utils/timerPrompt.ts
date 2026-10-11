import type { TaskStatusConfig } from '@/api/models';
import { ROLE_IDS } from '@/config/constants';

/**
 * Port of task-tracking-admin/src/components/TimerStatusPrompt.jsx.
 * After a timer starts or stops, offer the natural next status move, but only
 * moves that exist in /config/task-statuses AND are allowed from the task's
 * current status (the server rejects anything else).
 */
export type TimerEvent = 'start' | 'stop';
export type TaskHat = 'DEV' | 'QA';

export interface PromptTask {
  id: number;
  title: string;
  status: string;
  dev_owner_id: number | null;
  qa_owner_id: number | null;
  support_owner_id: number | null;
}

export interface PromptUser {
  id: number;
  roleId: number;
}

/** Ownership on the task wins; the master role is the fallback for helpers. */
export function roleOnTask(task: PromptTask | null | undefined, user: PromptUser | null | undefined): TaskHat {
  if (!task || !user) return 'DEV';
  if (task.qa_owner_id === user.id) return 'QA';
  if (task.dev_owner_id === user.id || task.support_owner_id === user.id) return 'DEV';
  return user.roleId === ROLE_IDS.QA ? 'QA' : 'DEV';
}

interface Option {
  title: string;
  body: string;
  dismiss: string;
  choices: { key: string; hint: string }[];
  when: (status: string) => boolean;
}

const OPTIONS: Record<string, Option> = {
  'DEV:start': {
    title: 'Start working on this?',
    body: 'This task is still Not Started. Move it to In Progress so the board reflects what you are doing.',
    dismiss: 'Not yet',
    choices: [{ key: 'IN_PROGRESS', hint: 'Work has begun' }],
    when: (s) => s === 'NOT_STARTED',
  },
  'DEV:stop': {
    title: 'Finished with this task?',
    body: 'You stopped the timer. Move the task on, or leave it where it is if you are coming back to it.',
    dismiss: 'Leave as is',
    choices: [
      { key: 'DEV_DONE', hint: 'Development is complete' },
      { key: 'READY_FOR_QA', hint: 'Hand it over for testing' },
    ],
    when: (s) => s === 'IN_PROGRESS' || s === 'REOPEN',
  },
  'QA:stop': {
    title: 'How did testing go?',
    body: 'You stopped the timer. Record the outcome of this round of testing.',
    dismiss: 'Leave as is',
    choices: [
      { key: 'PASS', hint: 'Working as expected' },
      { key: 'FAIL', hint: 'Defects found' },
      { key: 'REOPEN', hint: 'Send back to development' },
    ],
    when: (s) => ['READY_FOR_QA', 'IN_PROGRESS', 'FAIL', 'REOPEN'].includes(s),
  },
  // 'QA:start' deliberately absent: starting a timer never prompts a QA person.
};

export interface TimerPrompt {
  taskId: number;
  taskTitle: string;
  title: string;
  body: string;
  dismissLabel: string;
  choices: { key: string; label: string; hint: string }[];
}

export function getTimerPrompt(args: {
  event: TimerEvent;
  task: PromptTask | null | undefined;
  user: PromptUser | null | undefined;
  config: readonly TaskStatusConfig[] | undefined;
}): TimerPrompt | null {
  const { event, task, user, config } = args;
  if (!task || !user || !config) return null;
  const option = OPTIONS[`${roleOnTask(task, user)}:${event}`];
  if (!option || !option.when(task.status)) return null;

  const allowed = config.find((s) => s.key === task.status)?.allowed_transitions ?? [];
  const choices = option.choices
    .map((c) => {
      const cfg = config.find((s) => s.key === c.key);
      return cfg && allowed.includes(c.key) ? { key: c.key, label: cfg.label, hint: c.hint } : null;
    })
    .filter((c): c is { key: string; label: string; hint: string } => c !== null);
  if (choices.length === 0) return null;

  return {
    taskId: task.id,
    taskTitle: task.title,
    title: option.title,
    body: option.body,
    dismissLabel: option.dismiss,
    choices,
  };
}
