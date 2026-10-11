import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getMyMenus } from '@/api/menuApi';
import { useAuthStore } from '@/store/authStore';

import { createMenuAccess, getMobileMenus } from './menuAccess';

const EMPTY: never[] = [];

/** Same query key and cache window as the web hook. */
export function useMenuAccess() {
  const roleId = useAuthStore((s) => s.user?.roleId);
  const enabled = useAuthStore((s) => s.status === 'authenticated');

  const query = useQuery({
    queryKey: ['my-menus', roleId],
    queryFn: getMyMenus,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const menus = query.data ?? EMPTY;
  const access = useMemo(() => createMenuAccess(menus, roleId), [menus, roleId]);
  const mobileMenus = useMemo(() => getMobileMenus(menus), [menus]);

  return {
    ...access,
    menus,
    mobileMenus,
    isLoading: query.isLoading,
    /** Initial load failed and there is nothing to show. */
    loadFailed: query.isError && query.data === undefined,
    /** A background refetch failed but stale menus are still available. */
    refreshFailed: query.isError && query.data !== undefined,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}
