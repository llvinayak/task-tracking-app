import { get } from './client';
import { parseProjects, parseStatusConfig, parseTeam, type Project, type ProjectTeam, type TaskStatusConfig } from './models';

/** GET /projects -> Project[] (only fields the picker needs are kept). */
export const getProjects = async (): Promise<Project[]> => parseProjects(await get<unknown>('/projects'));

/** GET /projects/:id/team -> { can_manage, members[] }. */
export const getProjectTeam = async (id: number): Promise<ProjectTeam> =>
  parseTeam(await get<unknown>(`/projects/${id}/team`));

/** GET /config/task-statuses -> ordered statuses with allowed_transitions. */
export const getTaskStatuses = async (): Promise<TaskStatusConfig[]> =>
  parseStatusConfig(await get<unknown>('/config/task-statuses'));
