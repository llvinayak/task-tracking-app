export type AuthStackParamList = {
  Login: undefined;
};

/** Modules that have a mobile screen (see navigation/modules.ts). */
export type ModuleName = 'Dashboard' | 'Tasks' | 'MyDay' | 'QA' | 'Tickets' | 'Sprints';

/**
 * Bottom tabs: at most MAX_MODULE_TABS granted modules + Menu (<= 5 items, so
 * labels stay readable on small phones). Granted modules beyond the limit, and
 * Profile, open from the drawer as pushed screens.
 */
export type AppTabParamList = Record<ModuleName, undefined> & {
  Menu: undefined;
};

export type RootStackParamList = {
  Main: { screen?: keyof AppTabParamList } | undefined;
  /** A granted module that did not fit in the tab bar. */
  Module: { name: ModuleName };
  Profile: undefined;
  TaskDetail: { taskId: number };
  QATask: { taskId: number };
  TicketDetail: { ticketId: number };
  TicketCreate: undefined;
  SprintDetail: { sprintId: number };
  Timesheet: undefined;
};
