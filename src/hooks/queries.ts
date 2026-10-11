import { useQuery } from '@tanstack/react-query';

import * as dashboardApi from '@/api/dashboardApi';
import { getProjects, getProjectTeam, getTaskStatuses } from '@/api/projectsApi';
import {
  getTask,
  getTaskAssignees,
  getTaskComments,
  getTaskPermissions,
  getTasks,
  type TaskFilters,
  buildTaskParams,
} from '@/api/tasksApi';
import type { DashboardView } from '@/config/dashboardRoles';

/**
 * Query keys follow the web where one exists (['projects'], ['task-statuses'],
 * ['project-team', id], ['my-menus', roleId]). Cached data is ALWAYS the
 * parsed, unwrapped shape from src/api, never a raw axios response.
 */
export const keys = {
  projects: ['projects'] as const,
  taskStatuses: ['task-statuses'] as const,
  tasks: (f: TaskFilters) => ['tasks', buildTaskParams(f)] as const,
  tasksRoot: ['tasks'] as const,
  task: (id: number) => ['task', id] as const,
  taskPermissions: (id: number) => ['task-permissions', id] as const,
  taskComments: (id: number) => ['task-comments', id] as const,
  taskAssignees: (id: number) => ['task-assignees', id] as const,
  runningTimer: ['running-timer'] as const,
  taskSessions: (id: number) => ['task-sessions', id] as const,
  projectTeam: (id: number) => ['project-team', id] as const,
  dashboard: (view: string) => ['dashboard', view] as const,
  dashboardRoot: ['dashboard'] as const,
};

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: getProjects, staleTime: 2 * 60 * 1000 });
}

/** Statuses, order, colors and transitions from the DB. Cached 5 minutes. */
export function useTaskConfig() {
  const q = useQuery({
    queryKey: keys.taskStatuses,
    queryFn: getTaskStatuses,
    staleTime: 5 * 60 * 1000,
  });
  return { ...q, config: q.data };
}

export function useTasks(filters: TaskFilters) {
  return useQuery({ queryKey: keys.tasks(filters), queryFn: () => getTasks(filters) });
}

export function useTask(id: number) {
  return useQuery({ queryKey: keys.task(id), queryFn: () => getTask(id) });
}

/** Authoritative permissions (detail screen). One call per task, not per card. */
export function useTaskPermissionsQuery(id: number) {
  return useQuery({ queryKey: keys.taskPermissions(id), queryFn: () => getTaskPermissions(id) });
}

export function useTaskComments(id: number) {
  return useQuery({ queryKey: keys.taskComments(id), queryFn: () => getTaskComments(id) });
}

export function useTaskAssignees(id: number) {
  return useQuery({ queryKey: keys.taskAssignees(id), queryFn: () => getTaskAssignees(id) });
}

export function useProjectTeam(projectId: number | null | undefined) {
  return useQuery({
    queryKey: keys.projectTeam(projectId ?? 0),
    queryFn: () => getProjectTeam(projectId as number),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  });
}

/** One query per dashboard view; developer/QA poll while focused and active. */
const FETCHERS = {
  client: dashboardApi.getClientStats,
  developer: dashboardApi.getDeveloperStats,
  qa: dashboardApi.getQAStats,
  techLead: dashboardApi.getTLStats,
  projectManager: dashboardApi.getPMStats,
} as const;

export type FetchableView = keyof typeof FETCHERS;

export function useDashboardQuery<V extends FetchableView>(
  view: V,
  opts: { poll?: number | false; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: keys.dashboard(view),
    queryFn: FETCHERS[view] as () => Promise<Awaited<ReturnType<(typeof FETCHERS)[V]>>>,
    enabled: opts.enabled ?? true,
    refetchInterval: opts.poll ?? false,
    // TanStack pauses interval refetches while the app is backgrounded
    // (focusManager is wired to AppState in App.tsx).
    refetchIntervalInBackground: false,
  });
}

export type { DashboardView };
