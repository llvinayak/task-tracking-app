import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Current-project context. `null` selection = "All Projects" (the default). */
export interface SelectedProject {
  id: number;
  name: string;
  color: string | null;
  status: string | null;
  product_id: number | null;
}

interface ProjectState {
  selected: SelectedProject | null;
  select: (project: SelectedProject | null) => void;
  /** Validates the persisted selection against the visible project list. */
  reconcile: (projects: readonly SelectedProject[]) => void;
  clear: () => void;
}

/**
 * Pure: returns the selection to keep given the freshly fetched list, or null
 * if the project is no longer visible (deleted, access removed, other user).
 * A kept selection is refreshed with the latest name/color/status.
 */
export function reconcileSelection(
  selected: SelectedProject | null,
  projects: readonly SelectedProject[],
): SelectedProject | null {
  if (!selected) return null;
  const match = projects.find((p) => p.id === selected.id);
  return match ? { ...match } : null;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      selected: null,
      select: (selected) => set({ selected }),
      reconcile: (projects) => {
        const current = get().selected;
        const next = reconcileSelection(current, projects);
        if (JSON.stringify(next) !== JSON.stringify(current)) set({ selected: next });
      },
      // Unlike the web (tms-project survives logout), a new user never
      // inherits the previous user's project.
      clear: () => set({ selected: null }),
    }),
    {
      name: 'tt-selected-project',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ selected: s.selected }),
    },
  ),
);
