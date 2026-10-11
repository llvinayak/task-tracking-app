import { del, get, patch, post } from './client';
import {
  parseAssignees,
  parseAttachments,
  parseComment,
  parseComments,
  parseTaskDetail,
  parseTaskPermissions,
  parseTasks,
  type Assignee,
  type AssigneeRole,
  type Attachment,
  type Comment,
  type PersonRef,
  type Task,
  type TaskDetail,
  type TaskPermissions,
} from './models';
import { AppError } from './errors';

/** Query params for GET /tasks. Only non-empty values are ever sent. */
export interface TaskFilters {
  projectId?: number | null;
  search?: string;
  priority?: string;
  taskType?: string;
  /** Sprint id, or 'none' for the backlog. */
  sprintId?: number | 'none' | null;
  dateFrom?: string;
  dateTo?: string;
  /** User id: the server matches the dev/qa/support owner columns. */
  assignedTo?: number | null;
}

export function buildTaskParams(f: TaskFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  const search = f.search?.trim();
  if (f.projectId) params.project_id = f.projectId;
  if (search) params.search = search;
  if (f.priority) params.priority = f.priority;
  if (f.taskType) params.task_type = f.taskType;
  if (f.sprintId === 'none' || (typeof f.sprintId === 'number' && f.sprintId > 0)) {
    params.sprint_id = f.sprintId;
  }
  if (f.dateFrom) params.date_from = f.dateFrom;
  if (f.dateTo) params.date_to = f.dateTo;
  if (f.assignedTo) params.assigned_to = f.assignedTo;
  return params;
}

/** GET /tasks -> { success, data: Task[], count }. No pagination; server sort is final. */
export const getTasks = async (filters: TaskFilters): Promise<Task[]> =>
  parseTasks(await get<unknown>('/tasks', { params: buildTaskParams(filters) }));

/** GET /tasks/:id -> list shape + parentTask, statusLogs, attachments, ... */
export const getTask = async (id: number): Promise<TaskDetail> => {
  const t = parseTaskDetail(await get<unknown>(`/tasks/${id}`));
  if (!t) throw new AppError({ kind: 'unknown', message: 'This task could not be loaded.' });
  return t;
};

/** PATCH /tasks/:id/status {status, notes?}. 403/400 messages are shown verbatim. */
export const changeTaskStatus = async (id: number, status: string, notes?: string): Promise<void> => {
  const trimmed = notes?.trim();
  await patch<unknown>(`/tasks/${id}/status`, trimmed ? { status, notes: trimmed } : { status });
};

/** GET /tasks/:id/permissions -> { canEdit, canAssign, canDelete, isAssignee }. */
export const getTaskPermissions = async (id: number): Promise<TaskPermissions> =>
  parseTaskPermissions(await get<unknown>(`/tasks/${id}/permissions`));

/** GET /tasks/:id/attachments: re-signs s3_url (valid ~1h), so call right before opening. */
export const getTaskAttachments = async (id: number): Promise<Attachment[]> =>
  parseAttachments(await get<unknown>(`/tasks/${id}/attachments`));

/* ── Comments ────────────────────────────────────────────────────────────── */

/** GET /tasks/:id/comments: flat, oldest first. */
export const getTaskComments = async (id: number): Promise<Comment[]> =>
  parseComments(await get<unknown>(`/tasks/${id}/comments`));

/**
 * POST /tasks/:id/comments with JSON {content}.
 * VERIFIED by the NodeJS dev: the endpoint accepts JSON as well as the multipart the web sends.
 * The 201 body has no `author`, so the caller adds the current user.
 */
/** The server has no maximum; cap client-side. */
export const COMMENT_MAX = 5000;

export const addTaskComment = async (id: number, content: string, author: PersonRef): Promise<Comment> => {
  if (content.trim().length > COMMENT_MAX) {
    throw new AppError({ kind: 'validation', message: `Comments can be up to ${COMMENT_MAX} characters.` });
  }
  const raw = await post<unknown>(`/tasks/${id}/comments`, { content: content.trim() });
  const parsed = parseComment(raw);
  return {
    id: parsed?.id ?? -Date.now(),
    content: parsed?.content || content.trim(),
    created_at: parsed?.created_at ?? new Date().toISOString(),
    author: parsed?.author ?? author,
  };
};

/* ── Assignees ───────────────────────────────────────────────────────────── */

export const getTaskAssignees = async (id: number): Promise<Assignee[]> =>
  parseAssignees(await get<unknown>(`/tasks/${id}/assignees`));

/** KNOWN BACKEND GAP: no server permission check on assignee writes. */
export const addTaskAssignee = (
  taskId: number,
  body: { user_id: number; role: AssigneeRole; is_primary?: boolean },
) => post<unknown>(`/tasks/${taskId}/assignees`, body);

export const removeTaskAssignee = (taskId: number, assigneeId: number) =>
  del<unknown>(`/tasks/${taskId}/assignees/${assigneeId}`);

export const setPrimaryAssignee = (taskId: number, assigneeId: number) =>
  post<unknown>(`/tasks/${taskId}/assignees/${assigneeId}/primary`);
