import {
  addTicketComment,
  allowedTicketStatuses,
  buildTicketParams,
  buildTicketPatch,
  canOfferConvert,
  createTicket,
  getAssignableUsers,
  getTicket,
  getTickets,
  parseNumericId,
  parseTicket,
  updateTicket,
  validateNewTicket,
} from '@/api/ticketsApi';
import {
  buildSprintParams,
  getSprint,
  getSprintMetrics,
  getSprints,
  groupSprintsByStatus,
  parseSprint,
  parseSprintMetrics,
} from '@/api/sprintsApi';
import { calls, created, fail, installHttpAdapter, ok, resetHttp, useHttp } from '@/test/mockHttp';

beforeAll(installHttpAdapter);
beforeEach(resetHttp);

const rawTicket = (over: Record<string, unknown> = {}) => ({
  id: 12,
  title: 'Login broken',
  description: 'Cannot log in\nsecond line',
  status: 'open',
  severity: 3,
  project_id: 2,
  project: { id: 2, name: 'Alpha', color: '#3366ff' },
  client: { id: 4, name: 'Acme', email: 'ops@acme.io' },
  creator: { id: 1, name: 'Ada', email: 'ada@x.io' },
  assignee: { id: 7, name: 'Grace', email: 'g@x.io', avatar_url: null },
  created_at: '2026-10-01T09:00:00Z',
  attachments: [{ filename: 'shot.png', url: 'https://files.example/shot.png', size: 2048, mimetype: 'image/png' }],
  ...over,
});

describe('numeric id validation', () => {
  it.each([[5, 5], ['12', 12], [' 7 ', 7]])('accepts %p', (v, n) => expect(parseNumericId(v)).toBe(n));
  it.each(['abc', '', '0', '-3', '1.5', '12abc', '1e3', null, undefined, '99999999999', {}, NaN])('rejects %p', (v) => {
    expect(parseNumericId(v)).toBeNull();
  });
});

describe('tickets: params and parsing', () => {
  it('sends only non-empty params', () => {
    expect(buildTicketParams({})).toEqual({});
    expect(buildTicketParams({ projectId: null, clientId: null, status: '', severity: null, assignedTo: null })).toEqual({});
    expect(buildTicketParams({ projectId: 3, clientId: 4, status: 'open', severity: 2, assignedTo: 7 })).toEqual({
      project_id: 3, client_id: 4, status: 'open', severity: 2, assigned_to: 7,
    });
  });

  it('GET /tickets uses the picker project and unwraps {data, count}', async () => {
    useHttp(() => ok([rawTicket(), { nope: 1 }], { count: 2 }));
    const list = await getTickets({ projectId: 2 });
    expect(calls.at(-1)).toMatchObject({ method: 'GET', url: '/tickets', params: { project_id: 2 } });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 12, severity: 3, status: 'open', assignee: { name: 'Grace' }, client: { name: 'Acme' } });
  });

  it('parsing tolerates nulls and unknown statuses', () => {
    const t = parseTicket({ id: 1, status: 'weird', severity: 99, project: null, client: null, attachments: 'x' });
    expect(t).toMatchObject({ status: 'open', severity: 4, project: null, client: null, attachments: [], title: 'Ticket 1' });
    expect(parseTicket(null)).toBeNull();
    expect(parseTicket({ title: 'no id' })).toBeNull();
  });

  it('attachments keep name/url only (no upload on mobile)', () => {
    expect(parseTicket(rawTicket())!.attachments).toEqual([{ name: 'shot.png', url: 'https://files.example/shot.png', size: 2048, mimetype: 'image/png' }]);
  });

  it('GET /tickets/:id validates the id BEFORE any request, and parses linked tasks', async () => {
    await expect(getTicket('abc')).rejects.toMatchObject({ kind: 'validation', message: 'That ticket link is not valid.' });
    await expect(getTicket('12; drop')).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
    useHttp(() => ok({ ...rawTicket(), tasks: [{ id: 5, title: 'Fix', status: 'IN_PROGRESS', priority: 'HIGH' }, { nope: 1 }] }));
    const t = await getTicket(12);
    expect(calls.at(-1)?.url).toBe('/tickets/12');
    expect(t.tasks).toEqual([{ id: 5, title: 'Fix', status: 'IN_PROGRESS', priority: 'HIGH' }]);
  });

  it('404 is verbatim', async () => {
    useHttp(() => fail(404, 'Ticket not found'));
    await expect(getTicket(99)).rejects.toMatchObject({ kind: 'not_found', message: 'Ticket not found' });
  });
});

describe('tickets: create', () => {
  const ok1 = { title: ' Broken ', description: ' It fails ', project_id: 2, severity: 3 };

  it('validates exactly what the server requires', () => {
    expect(validateNewTicket({ title: '', description: '', project_id: null, severity: null })).toEqual({
      ok: false,
      errors: { title: 'Title required', description: 'Description required', project_id: 'Select the project this ticket is about', severity: 'Severity 1-4 required' },
    });
    expect(validateNewTicket({ ...ok1, severity: 5 })).toMatchObject({ ok: false, errors: { severity: expect.any(String) } });
    expect(validateNewTicket({ ...ok1, severity: 0 })).toMatchObject({ ok: false });
    expect(validateNewTicket({ ...ok1, project_id: 0 })).toMatchObject({ ok: false });
    expect(validateNewTicket({ ...ok1, project_id: 1.5 })).toMatchObject({ ok: false });
    expect(validateNewTicket({ ...ok1, title: '   ' })).toMatchObject({ ok: false });
  });

  it('builds a trimmed body; client_name only when given', () => {
    expect(validateNewTicket(ok1)).toEqual({ ok: true, body: { title: 'Broken', description: 'It fails', project_id: 2, severity: 3 } });
    expect(validateNewTicket({ ...ok1, client_name: ' Acme ' })).toMatchObject({ ok: true, body: { client_name: 'Acme' } });
    expect(validateNewTicket({ ...ok1, client_name: '  ' })).toMatchObject({ ok: true, body: expect.not.objectContaining({ client_name: expect.anything() }) });
  });

  it('POSTs JSON (not multipart) and returns the created ticket', async () => {
    useHttp(() => created({ ...rawTicket({ id: 77 }), tasks: [] }));
    const t = await createTicket(ok1);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/tickets', body: { title: 'Broken', description: 'It fails', project_id: 2, severity: 3 } });
    expect(String(calls.at(-1)?.contentType)).not.toContain('multipart');
    expect(Object.keys(calls.at(-1)?.body as object).sort()).toEqual(['description', 'project_id', 'severity', 'title']);
    expect(t.id).toBe(77);
  });

  it('invalid input never reaches the server', async () => {
    await expect(createTicket({ title: '', description: 'x', project_id: 2, severity: 2 })).rejects.toMatchObject({ kind: 'validation', message: 'Title required' });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [422, 'validation', 'Severity 1-4 required'],
    [404, 'not_found', 'Project not found'],
    [502, 'server', 'Something went wrong on our side. Please try again in a moment.'], // 5xx text is never raw
  ] as const)('server %i is surfaced', async (status, kind, message) => {
    useHttp(() => fail(status, status === 422 ? 'Validation failed' : message, status === 422 ? [{ field: 'severity', message }] : undefined));
    await expect(createTicket(ok1)).rejects.toMatchObject({ kind, message });
  });
});

describe('tickets: update sends ONLY what changed (the server mass-assigns)', () => {
  it('status only', async () => {
    useHttp(() => ok({ ...rawTicket({ status: 'closed' }), tasks: [] }));
    await updateTicket(12, { status: 'closed' });
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', url: '/tickets/12', body: { status: 'closed' } });
    expect(Object.keys(calls.at(-1)?.body as object)).toEqual(['status']);
  });

  it('assignee only, including un-assigning with null', async () => {
    useHttp(() => ok({ ...rawTicket(), tasks: [] }));
    await updateTicket(12, { assigned_to: 7 });
    expect(calls.at(-1)?.body).toEqual({ assigned_to: 7 });
    await updateTicket(12, { assigned_to: null });
    expect(calls.at(-1)?.body).toEqual({ assigned_to: null });
  });

  it('unknown keys are never forwarded, and an empty patch is refused', () => {
    expect(buildTicketPatch({ status: 'open', ...({ title: 'x', client_id: 3, created_by: 1 } as object) } as never)).toEqual({ status: 'open' });
    expect(() => buildTicketPatch({})).toThrow('Nothing to update.');
  });

  it('validates the id first', async () => {
    await expect(updateTicket('x', { status: 'open' })).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
  });
});

describe('tickets: status rules (port of TicketDetailPage)', () => {
  it('a converted ticket can only be closed', () => {
    expect(allowedTicketStatuses('converted')).toEqual(['closed']);
  });
  it('other statuses can move between open / in progress / closed, never by hand to converted', () => {
    expect(allowedTicketStatuses('open')).toEqual(['in_progress', 'closed']);
    expect(allowedTicketStatuses('in_progress')).toEqual(['open', 'closed']);
    expect(allowedTicketStatuses('closed')).toEqual(['open', 'in_progress']);
    for (const s of ['open', 'in_progress', 'closed'] as const) expect(allowedTicketStatuses(s)).not.toContain('converted');
  });
  it('convert is offered only for unconverted tickets with no linked tasks', () => {
    expect(canOfferConvert({ status: 'open', tasks: [] })).toBe(true);
    expect(canOfferConvert({ status: 'converted', tasks: [] })).toBe(false);
    expect(canOfferConvert({ status: 'closed', tasks: [{ id: 1, title: 't', status: 's', priority: 'p' }] })).toBe(false);
  });
});

describe('tickets: comments', () => {
  const me = { id: 7, name: 'Grace' };
  it('POSTs JSON {content}, trimmed, and attaches the current user as author (201 has none)', async () => {
    useHttp(() => created({ id: 90, content: 'hello', created_at: '2026-10-10T10:00:00Z' }));
    const c = await addTicketComment(12, '  hello  ', me);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/tickets/12/comments', body: { content: 'hello' } });
    expect(String(calls.at(-1)?.contentType)).not.toContain('multipart');
    expect(c).toMatchObject({ id: 90, content: 'hello', author: me });
  });
  it('uses the server author when present', async () => {
    useHttp(() => created({ id: 1, content: 'x', author: { id: 2, name: 'Other' } }));
    expect((await addTicketComment(12, 'x', me)).author).toEqual({ id: 2, name: 'Other' });
  });
  it('empty, over 5000 characters and a bad id never reach the server', async () => {
    await expect(addTicketComment(12, '   ', me)).rejects.toMatchObject({ kind: 'validation' });
    await expect(addTicketComment(12, 'x'.repeat(5001), me)).rejects.toMatchObject({ kind: 'validation' });
    await expect(addTicketComment('nope', 'x', me)).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
    useHttp(() => created({ id: 2, content: 'x' }));
    await expect(addTicketComment(12, 'x'.repeat(5000), me)).resolves.toBeTruthy();
  });
  it('a 422 is verbatim', async () => {
    useHttp(() => fail(422, 'Validation failed', [{ field: 'content', message: 'Invalid value' }]));
    await expect(addTicketComment(12, 'x', me)).rejects.toMatchObject({ kind: 'validation', message: 'Invalid value' });
  });
});

describe('assignable users', () => {
  it('keeps only id and name, drops clients and inactive users, never keeps emails', async () => {
    useHttp(() =>
      ok([
        { id: 1, name: 'Zed', email: 'z@x.io', role_id: 5, is_active: true },
        { id: 2, name: 'Ann', email: 'a@x.io', role_id: 2, is_active: true },
        { id: 3, name: 'Client Carl', email: 'c@x.io', role_id: 6, is_active: true },
        { id: 4, name: 'Gone', email: 'g@x.io', role_id: 5, is_active: false },
        { name: 'no id' },
      ]),
    );
    const users = await getAssignableUsers(6);
    expect(users).toEqual([{ id: 2, name: 'Ann' }, { id: 1, name: 'Zed' }]);
    expect(JSON.stringify(users)).not.toContain('@');
  });
});

/* ── Sprints ─────────────────────────────────────────────────────────────── */

const rawSprint = (over: Record<string, unknown> = {}) => ({
  id: 3,
  name: 'Sprint 3',
  status: 'active',
  start_date: '2026-10-01',
  end_date: '2026-10-14',
  project: { id: 2, name: 'Alpha', color: '#3366ff' },
  taskCount: 4,
  completedCount: 1,
  blockedCount: 1,
  estimatedHours: 20,
  actualHours: 5.5,
  completionPct: 25,
  tasks: [{ id: 9, title: 'Do it', status: 'IN_PROGRESS', priority: 'HIGH', is_blocked: true, estimated_hours: '4', devOwner: { name: 'Grace' } }],
  subSprints: [{ id: 4, name: 'Release A', status: 'planning', taskCount: 2, completedCount: 0, completionPct: 0, tasks: [] }],
  ...over,
});

describe('sprints: params, parsing, grouping', () => {
  it('sends only valid integer ids', () => {
    expect(buildSprintParams({})).toEqual({});
    expect(buildSprintParams({ projectId: 3 })).toEqual({ project_id: 3 });
    expect(buildSprintParams({ projectId: 3, productId: 9 })).toEqual({ project_id: 3, product_id: 9 });
    expect(buildSprintParams({ projectId: null, productId: 0 })).toEqual({});
    expect(buildSprintParams({ projectId: -2 })).toEqual({});
    expect(buildSprintParams({ projectId: Number.NaN })).toEqual({});
  });

  it('GET /sprints (all visible when no filter) and with the picker project', async () => {
    useHttp(() => ok([rawSprint(), { nope: 1 }]));
    expect(await getSprints({})).toHaveLength(1);
    expect(calls.at(-1)?.params).toEqual({});
    await getSprints({ projectId: 2 });
    expect(calls.at(-1)?.params).toEqual({ project_id: 2 });
  });

  it('parses derived counts, nested sub-sprints and tasks', () => {
    const s = parseSprint(rawSprint())!;
    expect(s).toMatchObject({ id: 3, taskCount: 4, completedCount: 1, blockedCount: 1, completionPct: 25, estimatedHours: 20, actualHours: 5.5 });
    expect(s.tasks[0]).toMatchObject({ id: 9, is_blocked: true, estimated_hours: 4, devOwnerName: 'Grace' });
    expect(s.subSprints).toHaveLength(1);
    expect(s.subSprints[0]!.subSprints).toEqual([]); // one level only
  });

  it('is defensive about nulls', () => {
    const s = parseSprint({ id: 1, name: null, status: null, tasks: null, subSprints: 'x', project: null, completionPct: 250 })!;
    expect(s).toMatchObject({ name: 'Sprint 1', status: 'planning', taskCount: 0, completionPct: 100, project: null, tasks: [], subSprints: [] });
    expect(parseSprint(null)).toBeNull();
  });

  it('groups by the status values in the data: active, planning, completed, then others; empty hidden', () => {
    const mk = (id: number, status: string) => parseSprint({ id, name: `S${id}`, status })!;
    const groups = groupSprintsByStatus([mk(1, 'completed'), mk(2, 'planning'), mk(3, 'active'), mk(4, 'archived'), mk(5, 'active')]);
    expect(groups.map((g) => [g.status, g.data.map((s) => s.id)])).toEqual([
      ['active', [3, 5]],
      ['planning', [2]],
      ['completed', [1]],
      ['archived', [4]],
    ]);
    expect(groupSprintsByStatus([])).toEqual([]);
  });
});

describe('sprints: detail and metrics', () => {
  it('validates the id before any request', async () => {
    await expect(getSprint('abc')).rejects.toMatchObject({ kind: 'validation', message: 'That sprint link is not valid.' });
    await expect(getSprintMetrics('1/../2')).rejects.toMatchObject({ kind: 'validation' });
    expect(calls).toHaveLength(0);
    useHttp(() => ok(rawSprint()));
    await getSprint('3');
    expect(calls.at(-1)?.url).toBe('/sprints/3');
  });

  it('403 and 404 are verbatim', async () => {
    useHttp(() => fail(403, 'You are not a member of this project'));
    await expect(getSprint(3)).rejects.toMatchObject({ kind: 'forbidden', message: 'You are not a member of this project' });
    useHttp(() => fail(404, 'Sprint not found'));
    await expect(getSprint(3)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('parses a full metrics payload', () => {
    const m = parseSprintMetrics({
      committed: { tasks: 8, estimated_hours: 40, at: '2026-10-01' },
      delivered: { tasks: 5, estimated_hours: 24 },
      scope: { tasks: 9, estimated_hours: 44, blocked_tasks: 1, unfinished_tasks: 4, change_tasks: 1, change_pct: 13 },
      effort: { estimated_hours: 44, logged_hours: 30, ratio: 0.68, variance_hours: -14 },
      progress: { completion_pct: 56, velocity_hours: null, velocity_tasks: null, commitment_met_pct: null },
      duration: { planned_days: 14, actual_days: null },
      burndown: [{ date: '2026-10-01', remaining_hours: 40, total_hours: 40, logged_hours: 0, total_tasks: 8, completed_tasks: 0 }, { nope: 1 }],
      ideal: [{ date: '2026-10-01', remaining_hours: 40 }, 30, { date: '2026-10-03', ideal_hours: 20 }, { x: 1 }],
    });
    expect(m.committed).toEqual({ tasks: 8, estimated_hours: 40 });
    expect(m.scope).toMatchObject({ change_tasks: 1, change_pct: 13, unfinished_tasks: 4 });
    expect(m.effort.ratio).toBe(0.68);
    expect(m.duration).toEqual({ planned_days: 14, actual_days: null });
    expect(m.burndown).toHaveLength(1);
    expect(m.ideal).toEqual([{ date: '2026-10-01', remaining_hours: 40 }, { date: null, remaining_hours: 30 }, { date: '2026-10-03', remaining_hours: 20 }]);
  });

  it('metrics with nulls everywhere do not crash and read as empty', () => {
    const m = parseSprintMetrics(null);
    expect(m.committed).toBeNull();
    expect(m.burndown).toEqual([]);
    expect(m.ideal).toEqual([]);
    expect(m.progress).toMatchObject({ completion_pct: 0, velocity_hours: null });
    expect(parseSprintMetrics({ committed: null, progress: { completion_pct: 'x' } }).committed).toBeNull();
  });
});
