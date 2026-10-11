/**
 * Normalized domain models + parsers. All query data stored in the cache goes
 * through these, so the shape is always the same (the web crashed when two
 * call sites cached different shapes under one key).
 */
import { asObj, bool, mapArray, nonEmpty, num, numOr, str } from './parse';

export interface PersonRef {
  id: number;
  name: string;
}

export interface ProjectRef {
  id: number;
  name: string;
  color: string | null;
}

export interface NamedRef {
  id: number;
  name: string;
  status?: string | null;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  task_type: string;
  module: string | null;
  project_id: number | null;
  project: ProjectRef | null;
  sprint: NamedRef | null;
  releaseSprint: NamedRef | null;
  dev_owner_id: number | null;
  qa_owner_id: number | null;
  support_owner_id: number | null;
  created_by: number | null;
  devOwner: PersonRef | null;
  qaOwner: PersonRef | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  release_to_qa_date: string | null;
  qa_start_date: string | null;
  qa_pass_date: string | null;
  is_blocked: boolean;
  is_at_risk: boolean;
  blocker_description: string | null;
  reopen_count: number;
  subtaskCount: number;
  completedSubtaskCount: number;
  subtaskCompletionPct: number;
  parent_task_id: number | null;
  subtasks: { id: number; title: string; status: string }[];
  /** include_subtasks=true on a parent: its READY_FOR_QA subtasks (one level only). */
  ready_subtasks: Task[];
}

const personRef = (v: unknown): PersonRef | null => {
  const o = asObj(v);
  const id = num(o.id);
  return id === null ? null : { id, name: nonEmpty(o.name) ?? 'Unknown' };
};

const projectRef = (v: unknown): ProjectRef | null => {
  const o = asObj(v);
  const id = num(o.id);
  return id === null ? null : { id, name: nonEmpty(o.name) ?? 'Project', color: nonEmpty(o.color) };
};

const namedRef = (v: unknown): NamedRef | null => {
  const o = asObj(v);
  const id = num(o.id);
  return id === null ? null : { id, name: nonEmpty(o.name) ?? `#${id}`, status: nonEmpty(o.status) };
};

/** Returns null only when the row has no usable id. Everything else defaults. */
export function parseTask(raw: unknown, withReady = true): Task | null {
  const o = asObj(raw);
  const id = num(o.id);
  if (id === null) return null;
  const subtasks = mapArray(o.subtasks, (s) => {
    const so = asObj(s);
    const sid = num(so.id);
    return sid === null
      ? null
      : { id: sid, title: nonEmpty(so.title) ?? `Task ${sid}`, status: nonEmpty(so.status) ?? '' };
  });
  return {
    id,
    title: nonEmpty(o.title) ?? 'Untitled task',
    description: nonEmpty(o.description),
    status: nonEmpty(o.status) ?? 'NOT_STARTED',
    priority: nonEmpty(o.priority) ?? 'MEDIUM',
    task_type: nonEmpty(o.task_type) ?? 'REQUIREMENT',
    module: nonEmpty(o.module),
    project_id: num(o.project_id) ?? num(asObj(o.project).id),
    project: projectRef(o.project),
    sprint: namedRef(o.sprint),
    releaseSprint: namedRef(o.releaseSprint),
    dev_owner_id: num(o.dev_owner_id),
    qa_owner_id: num(o.qa_owner_id),
    support_owner_id: num(o.support_owner_id),
    created_by: num(o.created_by),
    devOwner: personRef(o.devOwner),
    qaOwner: personRef(o.qaOwner),
    estimated_hours: num(o.estimated_hours),
    actual_hours: num(o.actual_hours),
    start_date: nonEmpty(o.start_date),
    due_date: nonEmpty(o.due_date),
    release_to_qa_date: nonEmpty(o.release_to_qa_date),
    qa_start_date: nonEmpty(o.qa_start_date),
    qa_pass_date: nonEmpty(o.qa_pass_date),
    is_blocked: bool(o.is_blocked),
    is_at_risk: bool(o.is_at_risk),
    blocker_description: nonEmpty(o.blocker_description),
    reopen_count: numOr(o.reopen_count),
    subtaskCount: numOr(o.subtaskCount, subtasks.length),
    completedSubtaskCount: numOr(o.completedSubtaskCount),
    subtaskCompletionPct: numOr(o.subtaskCompletionPct),
    parent_task_id: num(o.parent_task_id),
    subtasks,
    ready_subtasks: withReady ? mapArray(o.ready_subtasks, (r) => parseTask(r, false)) : [],
  };
}

/** A list never carries the same task twice (a duplicate id would collide as a React list key): first one wins. */
export const parseTasks = (raw: unknown): Task[] => {
  const seen = new Set<number>();
  return mapArray(raw, (r) => {
    const t = parseTask(r);
    if (!t || seen.has(t.id)) return null;
    seen.add(t.id);
    return t;
  });
};

/* ── Task detail ─────────────────────────────────────────────────────────── */

export interface StatusLog {
  id: number;
  from_status: string | null;
  to_status: string;
  notes: string | null;
  changed_at: string | null;
  changedBy: PersonRef | null;
}

export interface Attachment {
  id: number;
  original_name: string;
  file_size: number | null;
  mime_type: string | null;
  /** Time-limited signed URL (about 1 hour): always refetch before opening. */
  s3_url: string | null;
}

export interface TaskDetail extends Task {
  parentTask: { id: number; title: string; status: string } | null;
  statusLogs: StatusLog[];
  attachments: Attachment[];
}

export function parseTaskDetail(raw: unknown): TaskDetail | null {
  const base = parseTask(raw);
  if (!base) return null;
  const o = asObj(raw);
  const parent = asObj(o.parentTask);
  const parentId = num(parent.id);
  return {
    ...base,
    parentTask:
      parentId === null
        ? null
        : {
            id: parentId,
            title: nonEmpty(parent.title) ?? `Task ${parentId}`,
            status: nonEmpty(parent.status) ?? '',
          },
    // Verified: the status log timestamp field is `created_at`. `changed_at` is only a tolerance.
    statusLogs: mapArray(o.statusLogs, (l) => {
      const lo = asObj(l);
      const id = num(lo.id);
      const to = nonEmpty(lo.to_status);
      if (id === null || !to) return null;
      return {
        id,
        from_status: nonEmpty(lo.from_status),
        to_status: to,
        notes: nonEmpty(lo.notes),
        changed_at: nonEmpty(lo.created_at) ?? nonEmpty(lo.createdAt) ?? nonEmpty(lo.changed_at),
        changedBy: personRef(lo.changedBy),
      };
    }),
    attachments: parseAttachments(o.attachments),
  };
}

export const parseAttachments = (raw: unknown): Attachment[] =>
  mapArray(raw, (a) => {
    const ao = asObj(a);
    const id = num(ao.id);
    if (id === null) return null;
    return {
      id,
      original_name: nonEmpty(ao.original_name) ?? 'Attachment',
      file_size: num(ao.file_size),
      mime_type: nonEmpty(ao.mime_type),
      s3_url: nonEmpty(ao.s3_url),
    };
  });

/* ── Config / projects / team ────────────────────────────────────────────── */

export interface TaskStatusConfig {
  key: string;
  label: string;
  color: string | null;
  order_index: number;
  allowed_transitions: string[];
}

export const parseStatusConfig = (raw: unknown): TaskStatusConfig[] =>
  mapArray(raw, (s) => {
    const o = asObj(s);
    const key = nonEmpty(o.key);
    if (!key) return null;
    return {
      key,
      label: nonEmpty(o.label) ?? key,
      color: nonEmpty(o.color),
      order_index: numOr(o.order_index, 999),
      allowed_transitions: mapArray(o.allowed_transitions, (t) => nonEmpty(t)),
    };
  }).sort((a, b) => a.order_index - b.order_index);

export interface Project {
  id: number;
  name: string;
  color: string | null;
  status: string | null;
  product_id: number | null;
}

export const parseProjects = (raw: unknown): Project[] =>
  mapArray(raw, (p) => {
    const o = asObj(p);
    const id = num(o.id);
    if (id === null) return null;
    return {
      id,
      name: nonEmpty(o.name) ?? `Project ${id}`,
      color: nonEmpty(o.color),
      status: nonEmpty(o.status),
      product_id: num(o.product_id),
    };
  });

export interface TeamMember {
  id: number;
  user_id: number;
  role: string | null;
  permissions: Record<string, boolean>;
  user: { id: number; name: string; role_id: number | null; is_active: boolean } | null;
}

export interface ProjectTeam {
  project_id: number | null;
  can_manage: boolean;
  members: TeamMember[];
}

export function parseTeam(raw: unknown): ProjectTeam {
  const o = asObj(raw);
  return {
    project_id: num(o.project_id),
    can_manage: o.can_manage === true,
    members: mapArray(o.members, (m) => {
      const mo = asObj(m);
      const user_id = num(mo.user_id);
      if (user_id === null) return null;
      const u = asObj(mo.user);
      const uid = num(u.id);
      const perms: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(asObj(mo.permissions))) perms[k] = v === true;
      return {
        id: numOr(mo.id),
        user_id,
        role: nonEmpty(mo.role),
        permissions: perms,
        user:
          uid === null
            ? null
            : {
                id: uid,
                name: nonEmpty(u.name) ?? 'Unknown',
                role_id: num(u.role_id),
                // Verified: team member user.is_active is present (absent would count as active).
                is_active: u.is_active !== false,
              },
      };
    }),
  };
}

/* ── Permissions, assignees, comments ────────────────────────────────────── */

export interface TaskPermissions {
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  isAssignee: boolean;
}

export const parseTaskPermissions = (raw: unknown): TaskPermissions => {
  const o = asObj(raw);
  return {
    canEdit: o.canEdit === true,
    canAssign: o.canAssign === true,
    canDelete: o.canDelete === true,
    isAssignee: o.isAssignee === true,
  };
};

export const ASSIGNEE_ROLES = ['DEV', 'QA', 'SUPPORT', 'REVIEWER'] as const;
export type AssigneeRole = (typeof ASSIGNEE_ROLES)[number];

export interface Assignee {
  id: number;
  user_id: number;
  role: string;
  is_primary: boolean;
  user: PersonRef | null;
}

export const parseAssignees = (raw: unknown): Assignee[] =>
  mapArray(raw, (a) => {
    const o = asObj(a);
    const id = num(o.id);
    const user_id = num(o.user_id);
    if (id === null || user_id === null) return null;
    return {
      id,
      user_id,
      role: nonEmpty(o.role) ?? 'DEV',
      is_primary: bool(o.is_primary),
      user: personRef(o.user),
    };
  });

export interface Comment {
  id: number;
  content: string;
  created_at: string | null;
  author: PersonRef | null;
}

export const parseComment = (raw: unknown): Comment | null => {
  const o = asObj(raw);
  const id = num(o.id);
  if (id === null) return null;
  return {
    id,
    content: str(o.content) ?? '',
    created_at: nonEmpty(o.created_at) ?? nonEmpty(o.createdAt),
    author: personRef(o.author),
  };
};

/** Flat, oldest first. Replies are ignored (the API cannot create them). */
export const parseComments = (raw: unknown): Comment[] =>
  mapArray(raw, parseComment).sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb || a.id - b.id;
  });

