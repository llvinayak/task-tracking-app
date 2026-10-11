import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert, Dimensions, Modal, Platform } from 'react-native';

import * as dailyApi from '@/api/dailyReportApi';
import * as dashboardApi from '@/api/dashboardApi';
import * as menuApi from '@/api/menuApi';
import * as qaApi from '@/api/qaApi';
import * as sprintsApi from '@/api/sprintsApi';
import * as ticketsApi from '@/api/ticketsApi';
import * as timeApi from '@/api/timeApi';
import { Button, Text, useToast } from '@/components/ui';
import { Drawer } from '@/components/ui/Drawer';
import { useDirtyGuard } from '@/hooks/dailyReport';
import { __setAnimationsEnabledForTests } from '@/lib/motion';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { useTimerPromptStore } from '@/store/uiStores';
import { labelInNameViolations } from '@/test/a11y';
import { menu, sessionUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

jest.mock('@/api/menuApi');
jest.mock('@/api/authApi');
jest.mock('@/api/projectsApi');
jest.mock('@/api/dashboardApi', () => ({ ...jest.requireActual('@/api/dashboardApi'), getDeveloperStats: jest.fn(), getQAStats: jest.fn() }));
jest.mock('@/api/tasksApi', () => ({ ...jest.requireActual('@/api/tasksApi'), getTasks: jest.fn().mockResolvedValue([]) }));
jest.mock('@/api/timeApi', () => ({ ...jest.requireActual('@/api/timeApi'), getRunningTimer: jest.fn() }));
jest.mock('@/api/dailyReportApi', () => ({
  ...jest.requireActual('@/api/dailyReportApi'),
  getDailyReport: jest.fn(),
  getPendingDay: jest.fn(),
  getUnreviewedEntries: jest.fn(),
}));
jest.mock('@/api/qaApi', () => ({ ...jest.requireActual('@/api/qaApi'), getQAQueue: jest.fn(), getOverdueToQA: jest.fn() }));
jest.mock('@/api/ticketsApi', () => ({ ...jest.requireActual('@/api/ticketsApi'), getTickets: jest.fn() }));
jest.mock('@/api/sprintsApi', () => ({ ...jest.requireActual('@/api/sprintsApi'), getSprints: jest.fn() }));

const menus = menuApi as jest.Mocked<typeof menuApi>;
const M = {
  dashboard: menu({ id: 1, menu_name: 'Dashboard', menu_url: '/dashboard' }),
  tasks: menu({ id: 2, menu_name: 'Task Board', menu_url: '/tasks' }),
  myday: menu({ id: 3, menu_name: 'My Day', menu_url: '/my-day' }),
  qa: menu({ id: 4, menu_name: 'QA Module', menu_url: '/qa' }),
  tickets: menu({ id: 5, menu_name: 'Tickets', menu_url: '/tickets' }),
  sprints: menu({ id: 6, menu_name: 'Sprints', menu_url: '/sprints' }),
};
const ALL = Object.values(M);

// react-navigation clears a tab transition with a 32ms timer: always flush >= 40ms inside act after a press.
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
const tab = (n: string) => screen.getByLabelText(n);
// Event-driven: wait for the drawer's own content instead of sleeping. (`settle` stays only where nothing observable
// marks the end of a react-navigation tab transition, which clears itself with a 32ms timer.)
// react-navigation clears a tab transition with a 32ms timer; flush it inside act so it cannot land after the test.
const flushNav = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
const openMenu = async () => {
  fireEvent.press(tab('Menu'));
  await screen.findByTestId('open-profile');
  await flushNav();
};
const drawerGone = async () => {
  await waitFor(() => expect(screen.queryByTestId('open-profile')).toBeNull());
  await flushNav();
};
const signedIn = (roleId: number, extra: Record<string, unknown> = {}) =>
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ roleId, name: 'Grace Hopper' }), ...extra });
const mount = async (roleId = 5, rows = ALL) => {
  menus.getMyMenus.mockResolvedValue(rows);
  signedIn(roleId);
  const r = renderWithProviders(<RootNavigator />, { navigation: true });
  await screen.findByLabelText('Menu');
  await settle();
  return r;
};

let alertSpy: jest.SpyInstance;
const drawerModal = () =>
  screen.UNSAFE_getAllByType(Modal).find((m: { props: { animationType?: string; transparent?: boolean; navigationBarTranslucent?: boolean } }) => m.props.animationType === 'none' && m.props.navigationBarTranslucent === true)!;
const lastAlert = () => {
  const c = alertSpy.mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
  return { title: c[0], message: c[1], buttons: c[2] };
};

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useDirtyGuard.setState({ dirty: false, discardSignal: 0 });
  useTimerPromptStore.setState({ prompt: null });
  useAuthStore.setState({ status: 'unauthenticated', user: null, token: null, notice: null });
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 1 });
  (dashboardApi.getDeveloperStats as jest.Mock).mockResolvedValue(dashboardApi.parseDeveloperStats(null));
  (dashboardApi.getQAStats as jest.Mock).mockResolvedValue(dashboardApi.parseQAStats(null));
  (timeApi.getRunningTimer as jest.Mock).mockResolvedValue(null);
  (dailyApi.getPendingDay as jest.Mock).mockResolvedValue(dailyApi.parsePending({ needsSubmit: false }));
  (dailyApi.getDailyReport as jest.Mock).mockResolvedValue(
    dailyApi.parseDailyReport({ date: '2026-10-10', status: 'draft', items: [], summary: '', blockers: '', tomorrow_plan: '' }),
  );
  (dailyApi.getUnreviewedEntries as jest.Mock).mockResolvedValue([]);
  (qaApi.getQAQueue as jest.Mock).mockResolvedValue([]);
  (qaApi.getOverdueToQA as jest.Mock).mockResolvedValue([]);
  (ticketsApi.getTickets as jest.Mock).mockResolvedValue([]);
  (sprintsApi.getSprints as jest.Mock).mockResolvedValue([]);
  jest.requireMock('@/api/projectsApi').getTaskStatuses.mockResolvedValue([]);
  jest.requireMock('@/api/projectsApi').getProjects.mockResolvedValue([]);
});
afterEach(async () => {
  __setAnimationsEnabledForTests(null);
  onlineManager.setOnline(true);
  await settle();
  jest.restoreAllMocks();
});

describe('bottom bar', () => {
  it('has at most 5 items: up to 4 modules + Menu, never a More tab; Menu is a button that is never selected', async () => {
    await mount();
    const bar = ['Dashboard', 'Tasks', 'My Day', 'QA', 'Tickets', 'Sprints', 'More', 'Menu'].filter((n) => screen.queryByLabelText(n));
    expect(bar).toEqual(['Dashboard', 'Tasks', 'My Day', 'QA', 'Menu']);
    expect(bar.length).toBeLessThanOrEqual(5);
    const menuItem = tab('Menu');
    expect(menuItem.props.accessibilityState).toMatchObject({ expanded: false });
    expect(menuItem.props.accessibilityState.selected).toBeUndefined();
    expect(menuItem.props.accessibilityHint).toBe('Opens the navigation menu');
    expect(menuItem.props.role).toBe('button');
  });

  it('Menu opens the drawer without changing the current tab', async () => {
    await mount();
    expect(screen.queryByTestId('drawer-item-Tasks')).toBeNull();
    await openMenu();
    expect(screen.getByTestId('drawer-item-Tasks')).toBeTruthy();
    expect(screen.getByText('Active tasks')).toBeTruthy(); // still on the Dashboard behind it
    expect(tab('Menu').props.accessibilityState).toMatchObject({ expanded: true });
  });

  it('a user with NO granted mobile module sees only Menu, an empty state, and still reaches Profile and Sign out', async () => {
    await mount(5, []);
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-drawer'));
    await settle();
    expect(screen.getByTestId('open-profile')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.queryByText('MODULES')).toBeTruthy();
    expect(screen.queryByTestId('drawer-item-Tasks')).toBeNull();
  });
});

describe('opening and closing', () => {
  it('the hamburger on a tab header opens it; pushed screens show Back and no hamburger', async () => {
    await mount();
    expect(screen.getByTestId('open-drawer')).toBeTruthy();
    expect(screen.getByLabelText('Open menu')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-drawer'));
    await settle();
    expect(screen.getByTestId('drawer-item-Dashboard')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-profile'));
    await settle();
    expect(await screen.findByText('ACCOUNT')).toBeTruthy();
    expect(screen.queryByTestId('open-drawer')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it.each([
    ['the Close button', () => fireEvent.press(screen.getByRole('button', { name: 'Close menu' }))],
    ['a scrim tap', () => fireEvent.press(screen.getByTestId('drawer-scrim', { includeHiddenElements: true }))],
    ['the Android hardware Back (Modal onRequestClose)', () => act(() => drawerModal().props.onRequestClose())],
  ])('closes with %s, without navigating or asking about My Day', async (_n, close) => {
    await mount();
    useDirtyGuard.setState({ dirty: true });
    await openMenu();
    close();
    await drawerGone();
    expect(screen.queryByTestId('drawer-item-Tasks')).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Active tasks')).toBeTruthy();
  });

  it('opening dismisses the keyboard and a double tap opens it once', async () => {
    await mount();
    fireEvent.press(screen.getByTestId('open-drawer'));
    fireEvent.press(screen.getByTestId('open-drawer'));
    await settle();
    expect(screen.getAllByTestId('drawer-item-Dashboard')).toHaveLength(1);
  });

  it('a timer status prompt appearing while it is open closes it at once, with no navigation', async () => {
    await mount();
    await openMenu();
    act(() => {
      useTimerPromptStore.setState({
        prompt: { taskId: 5, taskTitle: 'Fix', title: 'Finished with this task?', body: 'b', dismissLabel: 'Leave as is', choices: [] },
      });
    });
    await drawerGone();
    expect(screen.queryByTestId('drawer-item-Tasks')).toBeNull();
    expect(screen.getByText('Finished with this task?')).toBeTruthy();
  });
});

describe('content and gating', () => {
  it('never lists an ungranted or mobile-hidden module (bar or drawer) and shows server menu names', async () => {
    await mount(5, [M.dashboard, { ...M.tickets, is_visible_on_mobile: false }, M.tasks]);
    await openMenu();
    expect(screen.getByTestId('drawer-item-Dashboard')).toBeTruthy();
    expect(screen.getByTestId('drawer-item-Tasks')).toBeTruthy();
    expect(screen.getByText('Task Board')).toBeTruthy();
    for (const n of ['MyDay', 'QA', 'Tickets', 'Sprints']) expect(screen.queryByTestId(`drawer-item-${n}`)).toBeNull();
  });

  it.each([
    [5, ['Dashboard', 'Tasks', 'MyDay', 'QA', 'Tickets', 'Sprints']],
    [4, ['QA', 'Dashboard', 'Tasks', 'MyDay', 'Tickets', 'Sprints']],
    [2, ['Dashboard', 'Sprints', 'Tasks', 'Tickets', 'MyDay', 'QA']],
    [6, ['Tickets', 'Dashboard', 'Tasks', 'Sprints', 'MyDay', 'QA']],
  ])('role %i: the drawer lists modules in role order', async (role, order) => {
    await mount(role);
    await openMenu();
    const rows = screen.getAllByTestId(/^drawer-item-/).map((n) => String(n.props.testID).replace('drawer-item-', ''));
    expect(rows).toEqual(order);
  });

  it('shows the user name and role in the account block, which opens Profile', async () => {
    await mount();
    await openMenu();
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(screen.getByTestId('open-profile').props.accessibilityLabel).toMatch(/^Profile and settings\. Grace Hopper/);
  });

  it('marks the CURRENT module and moves the mark when the tab changes', async () => {
    await mount();
    await openMenu();
    expect(screen.getByTestId('drawer-item-Dashboard').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId('drawer-item-Tasks'));
    await settle();
    await openMenu();
    expect(screen.getByTestId('drawer-item-Tasks').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('drawer-item-Tasks').props.accessibilityLabel).toMatch(/Current page$/);
    expect(screen.getByTestId('drawer-item-Dashboard').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('pressing the current module only closes the drawer', async () => {
    await mount();
    await openMenu();
    fireEvent.press(screen.getByTestId('drawer-item-Dashboard'));
    await settle();
    expect(screen.queryByTestId('drawer-item-Dashboard')).toBeNull();
    expect(screen.getByText('Active tasks')).toBeTruthy();
  });

  it('a drawer-only module (Sprints for a developer) is pushed with Back, via the same decision as before', async () => {
    await mount();
    await openMenu();
    fireEvent.press(screen.getByTestId('drawer-item-Sprints'));
    await settle();
    expect(await screen.findByText('No sprints')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('the web-only disclosure is collapsed every time the drawer opens', async () => {
    await mount(5, [...ALL, menu({ id: 9, menu_name: 'Calendar', menu_url: '/calendar' })]);
    await openMenu();
    fireEvent.press(screen.getByTestId('web-only-toggle'));
    expect(screen.getByText('Calendar')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Close menu' }));
    await settle();
    await openMenu();
    expect(screen.queryByText('Calendar')).toBeNull();
    expect(screen.getByTestId('web-only-toggle').props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('shows the version from app.json and no hard-coded string', async () => {
    await mount();
    await openMenu();
    expect(screen.getByTestId('drawer-version')).toHaveTextContent(/^TaskTracking \d+\.\d+\.\d+/);
  });

  it('keeps Label in Name for every control, with the drawer open, at 320dp', async () => {
    await mount();
    await openMenu();
    expect(labelInNameViolations()).toEqual([]);
    expect(Dimensions.get('window').width).toBe(320);
  });
});

describe('My Day dirty guard from the drawer', () => {
  it('leaving through a module row, Profile or Sign out asks first; Keep editing changes nothing; Discard resets and goes on', async () => {
    await mount();
    // go to My Day (a bar item) and make it dirty
    fireEvent.press(tab('My Day'));
    await settle();
    useDirtyGuard.setState({ dirty: true });
    await openMenu();
    fireEvent.press(screen.getByTestId('drawer-item-Tasks'));
    await settle();
    expect(lastAlert().title).toBe('Discard changes?');
    expect(lastAlert().message).toBe('You have unsaved changes to your day.');
    act(() => lastAlert().buttons.find((b) => b.text === 'Keep editing')!.onPress?.());
    expect(useDirtyGuard.getState().dirty).toBe(true);
    expect(screen.queryByLabelText('Search tasks')).toBeNull(); // still on My Day

    alertSpy.mockClear();
    await openMenu();
    fireEvent.press(screen.getByTestId('open-profile'));
    await settle();
    expect(lastAlert().title).toBe('Discard changes?');
    const before = useDirtyGuard.getState().discardSignal;
    await act(async () => lastAlert().buttons.find((b) => b.text === 'Discard')!.onPress?.());
    await settle();
    expect(useDirtyGuard.getState().discardSignal).toBe(before + 1);
    expect(await screen.findByText('ACCOUNT')).toBeTruthy();
  });

  it('Menu, the hamburger, and the current My Day row never ask', async () => {
    await mount();
    fireEvent.press(tab('My Day'));
    await settle();
    useDirtyGuard.setState({ dirty: true });
    await openMenu();
    expect(alertSpy).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('drawer-item-MyDay')); // the current one: close only
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('Sign out from the drawer', () => {
  it('Android: runs the existing checks and dialog with the drawer still open; "Sign out" calls logout', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    await mount();
    const realLogout = useAuthStore.getState().logout;
    act(() => useAuthStore.setState({ logout } as never));
    const replace = jest.replaceProperty(Platform, 'OS', 'android');
    await openMenu();
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await settle();
    expect(alertSpy).toHaveBeenCalled();
    expect(screen.getByTestId('drawer-item-Tasks')).toBeTruthy(); // still open while the dialog is up
    await act(async () => lastAlert().buttons.find((b) => /Sign out/.test(b.text))!.onPress?.());
    expect(logout).toHaveBeenCalled();
    replace.restore();
    act(() => useAuthStore.setState({ logout: realLogout } as never));
  });

  it('iOS fallback: the drawer closes first (an Alert over a Modal is unreliable) with a short toast, then the dialog shows', async () => {
    await mount();
    const replace = jest.replaceProperty(Platform, 'OS', 'ios');
    await openMenu();
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await drawerGone();
    expect(screen.queryByTestId('drawer-item-Tasks')).toBeNull();
    expect(alertSpy).toHaveBeenCalled();
    replace.restore();
  });

  it('with an unfiled day "Review & submit" closes the drawer and opens My Day', async () => {
    (dailyApi.getPendingDay as jest.Mock).mockResolvedValue(dailyApi.parsePending({ date: '2026-10-10', needsSubmit: true, trackedMinutes: 60, taskCount: 1 }));
    await mount();
    const replace = jest.replaceProperty(Platform, 'OS', 'android');
    await openMenu();
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await settle();
    const review = lastAlert().buttons.find((b) => /Review/.test(b.text));
    expect(review).toBeTruthy();
    await act(async () => review!.onPress?.());
    await drawerGone();
    expect(screen.queryByTestId('drawer-item-Tasks')).toBeNull();
    replace.restore();
  });

  it('with My Day dirty, Sign out asks about the day first', async () => {
    await mount();
    fireEvent.press(tab('My Day'));
    await settle();
    const replace = jest.replaceProperty(Platform, 'OS', 'android');
    await openMenu();
    useDirtyGuard.setState({ dirty: true }); // set last: My Day re-syncs the guard while it settles
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await settle();
    expect(lastAlert().title).toBe('Discard changes?');
    replace.restore();
  });
});

describe('Drawer shell', () => {
  function Harness({ onClosed, startOpen = true }: { onClosed: () => void; startOpen?: boolean }) {
    const [open, setOpen] = React.useState(startOpen);
    return (
      <>
        <Button label="toggle" onPress={() => setOpen((v) => !v)} />
        <Drawer visible={open} onRequestClose={() => setOpen(false)} onClosed={onClosed}>
          <Text>inside</Text>
        </Drawer>
      </>
    );
  }

  it('reduced motion / jest: closing unmounts the panel and reports onClosed once, synchronously (no timers left)', () => {
    const onClosed = jest.fn();
    renderWithProviders(<Harness onClosed={onClosed} />);
    expect(screen.getByText('inside')).toBeTruthy();
    expect(onClosed).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.queryByText('inside')).toBeNull();
    expect(onClosed).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'toggle' })); // re-open
    expect(screen.getByText('inside')).toBeTruthy();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('a drawer that never opened reports nothing and renders no Modal', () => {
    const onClosed = jest.fn();
    renderWithProviders(<Harness onClosed={onClosed} startOpen={false} />);
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('is 85% of the window width, between 256 and 320 (272 at 320dp)', async () => {
    await mount();
    await openMenu();
    const panel = screen.getByLabelText('Navigation menu', { includeHiddenElements: true });
    const style = Object.assign({}, ...[panel.props.style].flat(4).filter(Boolean));
    expect(style.width).toBe(272);
  });

  it('is modal for screen readers and labelled; the scrim is not an accessible control', async () => {
    await mount();
    await openMenu();
    const scrim = screen.getByTestId('drawer-scrim', { includeHiddenElements: true });
    expect(scrim.props.accessible).toBe(false);
    expect(drawerModal().findAll((n: { props: { accessibilityViewIsModal?: boolean } }) => n.props.accessibilityViewIsModal === true).length).toBeGreaterThan(0);
  });
});

describe('Session safety', () => {
  it('an action deferred by the drawer does nothing if the session changed before it ran', async () => {
    await mount();
    await openMenu();
    const start = useAuthStore.getState().epoch;
    const row = screen.getByTestId('drawer-item-Sprints');
    // One act(): the press closes the drawer, and the session changes BEFORE the deferred navigation runs.
    act(() => {
      fireEvent.press(row);
      useAuthStore.setState({ epoch: start + 1 });
    });
    await settle();
    expect(screen.queryByText('No sprints')).toBeNull();
  });
});

describe('Drawer with real animations (motion override on)', () => {
  beforeEach(() => __setAnimationsEnabledForTests(true));

  function Harness({ onClosed }: { onClosed: () => void }) {
    const [open, setOpen] = React.useState(true);
    return (
      <>
        <Button label="toggle" onPress={() => setOpen((v) => !v)} />
        <Drawer visible={open} onRequestClose={() => setOpen(false)} onClosed={onClosed}>
          <Text>inside</Text>
        </Drawer>
      </>
    );
  }

  it('onClosed fires exactly once, only after the slide-out has finished', async () => {
    const onClosed = jest.fn();
    renderWithProviders(<Harness onClosed={onClosed} />);
    fireEvent.press(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByText('inside')).toBeTruthy(); // still sliding out
    expect(onClosed).not.toHaveBeenCalled();
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('inside')).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('a close interrupted by a re-open neither unmounts nor reports onClosed', async () => {
    const onClosed = jest.fn();
    renderWithProviders(<Harness onClosed={onClosed} />);
    fireEvent.press(screen.getByRole('button', { name: 'toggle' })); // start closing
    fireEvent.press(screen.getByRole('button', { name: 'toggle' })); // re-open mid-slide
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(screen.getByText('inside')).toBeTruthy();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('unmounting in the middle of the slide stops it and never reports a stale onClosed', async () => {
    const onClosed = jest.fn();
    const r = renderWithProviders(<Harness onClosed={onClosed} />);
    fireEvent.press(screen.getByRole('button', { name: 'toggle' }));
    r.unmount();
    await new Promise((res) => setTimeout(res, 450));
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('tapping a row and then the scrim while it slides out still performs the row navigation', async () => {
    await mount();
    await openMenu();
    act(() => {
      fireEvent.press(screen.getByTestId('drawer-item-Sprints'));
    });
    // The close is under way: a second dismissal (scrim) must not cancel the queued navigation.
    const scrim = screen.queryByTestId('drawer-scrim', { includeHiddenElements: true });
    if (scrim) fireEvent.press(scrim);
    await drawerGone();
    expect(await screen.findByText('No sprints')).toBeTruthy();
  });
});

describe('Drawer: offline notice and toast while open', () => {
  it('shows the offline notice inside the open drawer, silently (one live region only)', async () => {
    await mount();
    await openMenu();
    act(() => onlineManager.setOnline(false));
    const banners = drawerModal().findAll((n: { props: { testID?: string } }) => n.props.testID === 'offline-banner');
    expect(banners.length).toBeGreaterThan(0);
    const inDrawer = within(drawerModal());
    expect(inDrawer.getByText(/Offline\. Changes can't be saved/)).toBeTruthy();
    for (const b of banners) {
      expect(b.props.accessibilityLiveRegion).toBeUndefined();
      expect(b.props.accessibilityRole).not.toBe('alert');
    }
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(within(drawerModal()).queryByText(/Offline\./)).toBeNull());
  });

  it('a toast raised while the drawer is open renders inside it, not behind it', async () => {
    function Raiser() {
      const toast = useToast();
      return <Button label="raise" onPress={() => toast.show('Saved it', 'success')} />;
    }
    renderWithProviders(
      <Drawer visible onRequestClose={() => undefined}>
        <Raiser />
      </Drawer>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'raise' }));
    const modal = screen.UNSAFE_getByType(Modal);
    expect(within(modal).getByText('Saved it')).toBeTruthy();
    expect(screen.getAllByText('Saved it')).toHaveLength(1); // not duplicated behind the modal
  });
});
