import { useQuery } from '@tanstack/react-query';

import { buildSprintParams, getSprint, getSprintMetrics, getSprints, type SprintFilters } from '@/api/sprintsApi';

export const sprintKeys = {
  list: (f: SprintFilters) => ['sprints', buildSprintParams(f)] as const,
  one: (id: number) => ['sprint', id] as const,
  metrics: (id: number) => ['sprint-metrics', id] as const,
};

export const useSprints = (f: SprintFilters) => useQuery({ queryKey: sprintKeys.list(f), queryFn: () => getSprints(f) });
export const useSprint = (id: number) => useQuery({ queryKey: sprintKeys.one(id), queryFn: () => getSprint(id), enabled: id > 0 });
export const useSprintMetrics = (id: number) =>
  useQuery({ queryKey: sprintKeys.metrics(id), queryFn: () => getSprintMetrics(id), enabled: id > 0 });
