/**
 * Tickets. Endpoints (task-tracking-api routes/ticketRoutes.js):
 *   GET /tickets   GET /tickets/:id   POST /tickets   PUT /tickets/:id
 *   GET /tickets/:id/comments   POST /tickets/:id/comments
 * BACKEND GAP: tickets are NOT scoped to the caller's projects, so every logged-in
 * user (the Client role included) receives every ticket. We show what the server
 * returns and do not try to filter it client-side.
 */
import { get, post, put } from './client';
import { AppError } from './errors';
import { type PersonRef } from './models';
import { asObj, mapArray, nonEmpty, num, numOr, str } from './parse';

export const TICKET_STATUSES = ['open', 'in_progress', 'closed', 'converted'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Vocabulary mirrors task-tracking-admin/src/constants/ticket.js (constants, not from /config). */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
  converted: 'Converted',
};
export const SEVERITY_LABEL: Record<number, string> = { 4: 'Critical', 3: 'High', 2: 'Medium', 1: 'Low' };
export const SEVERITIES = [4, 3, 2, 1] as const;

export const isTicketStatus = (v: unknown): v is TicketStatus =>
  typeof v === 'string' && (TICKET_STATUSES as readonly string[]).includes(v);

/** Strict positive integer from user/route input; null otherwise (never reaches the server). */
export function parseNumericId(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 ? n : null;
}

export interface TicketAttachment {
  name: string;
  /** Stored plain URL (not signed): may not open if the bucket is private. */
  url: string | null;
  size: number | null;
  mimetype: string | null;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  severity: number;
  project_id: number | null;
  project: { id: number; name: string; color: string | null } | null;
  client: { id: number; name: string; email: string | null } | null;
  client_name: string | null;
  creator: PersonRef | null;
  assignee: PersonRef | null;
  created_at: string | null;
  attachments: TicketAttachment[];
}

export interface TicketDetail extends Ticket {
  tasks: { id: number; title: string; status: string; priority: string }[];
}

const person = (v: unknown): PersonRef | null => {
  const o = asObj(v);
  const id = num(o.id);
  return id === null ? null : { id, name: nonEmpty(o.name) ?? 'Unknown' };
};

const parseAttachments = (v: unknown): TicketAttachment[] =>
  mapArray(v, (a) => {
    const o = asObj(a);
    const name = nonEmpty(o.filename) ?? nonEmpty(o.original_name) ?? nonEmpty(o.name);
    if (!name) return null;
    return { name, url: nonEmpty(o.url), size: num(o.size), mimetype: nonEmpty(o.mimetype) };
  });

export function parseTicket(raw: unknown): Ticket | null {
  const o = asObj(raw);
  const id = num(o.id);
  if (id === null) return null;
  const p = asObj(o.project);
  const pid = num(p.id);
  const c = asObj(o.client);
  const cid = num(c.id);
  const status = isTicketStatus(o.status) ? o.status : 'open';
  return {
    id,
    title: nonEmpty(o.title) ?? `Ticket ${id}`,
    description: str(o.description) ?? '',
    status,
    severity: Math.min(4, Math.max(1, numOr(o.severity, 1))),
    project_id: num(o.project_id) ?? pid,
    project: pid === null ? null : { id: pid, name: nonEmpty(p.name) ?? 'Project', color: nonEmpty(p.color) },
    client: cid === null ? null : { id: cid, name: nonEmpty(c.name) ?? 'Client', email: nonEmpty(c.email) },
    client_name: nonEmpty(o.client_name),
    creator: person(o.creator),
    assignee: person(o.assignee),
    created_at: nonEmpty(o.created_at) ?? nonEmpty(o.createdAt),
    attachments: parseAttachments(o.attachments),
  };
}

export const parseTickets = (raw: unknown): Ticket[] => mapArray(raw, parseTicket);

export function parseTicketDetail(raw: unknown): TicketDetail | null {
  const t = parseTicket(raw);
  if (!t) return null;
  return {
    ...t,
    tasks: mapArray(asObj(raw).tasks, (x) => {
      const o = asObj(x);
      const id = num(o.id);
      return id === null
        ? null
        : { id, title: nonEmpty(o.title) ?? `Task ${id}`, status: nonEmpty(o.status) ?? '', priority: nonEmpty(o.priority) ?? '' };
    }),
  };
}

/* ── List ────────────────────────────────────────────────────────────────── */

export interface TicketFilters {
  projectId?: number | null;
  clientId?: number | null;
  status?: string;
  severity?: number | null;
  assignedTo?: number | null;
}

/** Only non-empty params are sent. */
export function buildTicketParams(f: TicketFilters): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  if (f.projectId) p.project_id = f.projectId;
  if (f.clientId) p.client_id = f.clientId;
  if (f.status) p.status = f.status;
  if (f.severity) p.severity = f.severity;
  if (f.assignedTo) p.assigned_to = f.assignedTo;
  return p;
}

export const getTickets = async (f: TicketFilters): Promise<Ticket[]> =>
  parseTickets(await get<unknown>('/tickets', { params: buildTicketParams(f) }));

/** Validates the id first: a malformed id makes the server answer 404/500. */
export async function getTicket(id: unknown): Promise<TicketDetail> {
  const n = parseNumericId(id);
  if (n === null) throw new AppError({ kind: 'validation', message: 'That ticket link is not valid.' });
  const t = parseTicketDetail(await get<unknown>(`/tickets/${n}`));
  if (!t) throw new AppError({ kind: 'unknown', message: 'This ticket could not be loaded.' });
  return t;
}

/* ── Create ──────────────────────────────────────────────────────────────── */

export interface NewTicket {
  title: string;
  description: string;
  project_id: number | null;
  severity: number | null;
  client_name?: string;
}

export type TicketFormErrors = Partial<Record<'title' | 'description' | 'project_id' | 'severity', string>>;

/** Same required fields as the server's validators. */
export function validateNewTicket(v: NewTicket):
  | { ok: true; body: { title: string; description: string; project_id: number; severity: number; client_name?: string } }
  | { ok: false; errors: TicketFormErrors } {
  const errors: TicketFormErrors = {};
  const title = v.title.trim();
  const description = v.description.trim();
  if (!title) errors.title = 'Title required';
  if (!description) errors.description = 'Description required';
  if (!v.project_id || !Number.isInteger(v.project_id) || v.project_id < 1) errors.project_id = 'Select the project this ticket is about';
  if (!v.severity || !Number.isInteger(v.severity) || v.severity < 1 || v.severity > 4) errors.severity = 'Severity 1-4 required';
  if (Object.keys(errors).length) return { ok: false, errors };
  const client = v.client_name?.trim();
  return {
    ok: true,
    body: {
      title,
      description,
      project_id: v.project_id as number,
      severity: v.severity as number,
      ...(client ? { client_name: client } : {}),
    },
  };
}

/**
 * POST /tickets as JSON (the route's multer middleware only parses multipart and
 * lets JSON through untouched; no attachments are sent from mobile).
 */
export async function createTicket(v: NewTicket): Promise<TicketDetail> {
  const r = validateNewTicket(v);
  if (!r.ok) {
    throw new AppError({ kind: 'validation', message: Object.values(r.errors)[0] ?? 'Invalid ticket', fieldErrors: [] });
  }
  const t = parseTicketDetail(await post<unknown>('/tickets', r.body));
  if (!t) throw new AppError({ kind: 'unknown', message: 'The ticket was created but could not be read back.' });
  return t;
}

/* ── Update (mass-assigned server-side: send ONLY what changed) ──────────── */

export interface TicketPatch {
  status?: TicketStatus;
  assigned_to?: number | null;
}

/**
 * PUT /tickets/:id passes the whole body to a model update, so any extra key
 * would be written. Only the keys the UI actually changed are sent, and nothing
 * else (never the whole ticket object).
 */
export function buildTicketPatch(patch: TicketPatch): TicketPatch {
  const out: TicketPatch = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.assigned_to !== undefined) out.assigned_to = patch.assigned_to;
  if (Object.keys(out).length === 0) throw new AppError({ kind: 'validation', message: 'Nothing to update.' });
  return out;
}

export async function updateTicket(id: unknown, patch: TicketPatch): Promise<TicketDetail> {
  const n = parseNumericId(id);
  if (n === null) throw new AppError({ kind: 'validation', message: 'That ticket link is not valid.' });
  const t = parseTicketDetail(await put<unknown>(`/tickets/${n}`, buildTicketPatch(patch)));
  if (!t) throw new AppError({ kind: 'unknown', message: 'The ticket was updated but could not be read back.' });
  return t;
}

/**
 * Status rules from the web TicketDetailPage: a CONVERTED ticket can only be
 * closed (never reopened). Otherwise open / in progress / closed. "converted"
 * is only ever set by the convert flow, never picked by hand on mobile.
 */
export function allowedTicketStatuses(current: TicketStatus): TicketStatus[] {
  if (current === 'converted') return ['closed'];
  return (['open', 'in_progress', 'closed'] as const).filter((s) => s !== current);
}

/** Convert is offered only when not converted and nothing is linked yet. */
export const canOfferConvert = (t: Pick<TicketDetail, 'status' | 'tasks'>) => t.status !== 'converted' && t.tasks.length === 0;

/* ── Comments ────────────────────────────────────────────────────────────── */

export const TICKET_COMMENT_MAX = 5000;

export interface TicketComment {
  id: number;
  content: string;
  created_at: string | null;
  author: PersonRef | null;
}

export const parseTicketComments = (raw: unknown): TicketComment[] =>
  mapArray(raw, (c): TicketComment | null => {
    const o = asObj(c);
    const id = num(o.id);
    if (id === null) return null;
    return { id, content: str(o.content) ?? '', created_at: nonEmpty(o.created_at) ?? nonEmpty(o.createdAt), author: person(o.author) };
  });

export const getTicketComments = async (id: unknown): Promise<TicketComment[]> => {
  const n = parseNumericId(id);
  if (n === null) throw new AppError({ kind: 'validation', message: 'That ticket link is not valid.' });
  return parseTicketComments(await get<unknown>(`/tickets/${n}/comments`));
};

/** POST JSON {content}. The 201 body is the raw row with NO author: the caller's own is attached. */
export async function addTicketComment(id: unknown, content: string, author: PersonRef): Promise<TicketComment> {
  const n = parseNumericId(id);
  if (n === null) throw new AppError({ kind: 'validation', message: 'That ticket link is not valid.' });
  const text = content.trim();
  if (!text) throw new AppError({ kind: 'validation', message: 'Write a note first.' });
  if (text.length > TICKET_COMMENT_MAX) {
    throw new AppError({ kind: 'validation', message: `Notes can be up to ${TICKET_COMMENT_MAX} characters.` });
  }
  const row = asObj(await post<unknown>(`/tickets/${n}/comments`, { content: text }));
  return {
    id: num(row.id) ?? -Date.now(),
    content: str(row.content) ?? text,
    created_at: nonEmpty(row.created_at) ?? new Date().toISOString(),
    author: person(row.author) ?? author,
  };
}

/* ── Assignable people ───────────────────────────────────────────────────── */

export interface AssignableUser {
  id: number;
  name: string;
}

/**
 * GET /users returns EVERY user including emails (backend gap). Only id and
 * name are kept; active, non-client users only (client role id is 6).
 */
export async function getAssignableUsers(clientRoleId: number): Promise<AssignableUser[]> {
  const raw = await get<unknown>('/users');
  return mapArray(raw, (u): AssignableUser | null => {
    const o = asObj(u);
    const id = num(o.id);
    if (id === null || o.is_active === false || num(o.role_id) === clientRoleId) return null;
    return { id, name: nonEmpty(o.name) ?? 'Unknown' };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
