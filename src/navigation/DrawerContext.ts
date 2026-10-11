import { createContext, useContext } from 'react';

/**
 * Provided by AppTabs (local state: it dies with the tab navigator on sign-out). PageHeader reads it to show the
 * hamburger, so a header rendered anywhere else (tests, error screens) has none.
 */
export interface DrawerApi {
  open: boolean;
  openDrawer: () => void;
  /** Closes the drawer; `then` runs once it has finished closing (immediately with reduced motion). */
  closeDrawer: (then?: () => void) => void;
  /** My Day is unfiled AND is not a bottom-bar item (the cue then lives on the hamburger and Menu item). */
  unfiledCue: boolean;
}

export const DrawerContext = createContext<DrawerApi | null>(null);
export const useDrawer = () => useContext(DrawerContext);
