import { useEffect, useState } from 'react';

import { useProjectStore } from '@/store/projectStore';

import { useProjects } from './queries';

/** True once the persisted project selection has been read from AsyncStorage. */
export function useProjectStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useProjectStore.persist.hasHydrated());
  useEffect(() => {
    if (useProjectStore.persist.hasHydrated()) setHydrated(true);
    return useProjectStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

/**
 * App-level (mounted once, while signed in): validates the persisted project
 * selection against GET /projects. It waits for hydration first, otherwise a
 * list that loads before AsyncStorage is read would reconcile an empty
 * selection and the stale one would survive. If /projects fails the selection
 * is kept (see the warning chip in ProjectButton).
 */
export function useProjectSync() {
  const hydrated = useProjectStoreHydrated();
  const reconcile = useProjectStore((s) => s.reconcile);
  const { data } = useProjects();
  useEffect(() => {
    if (hydrated && data) reconcile(data);
  }, [hydrated, data, reconcile]);
}
