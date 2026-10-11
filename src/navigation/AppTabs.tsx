import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '@/api/errors';
import { EmptyState, ErrorState, Icon, LoadingState, PageHeader, Screen, Text } from '@/components/ui';
import { Drawer } from '@/components/ui/Drawer';
import { HeaderProvidedContext, HeaderVariantContext, TopInsetHandledContext } from '@/components/ui/Screen';
import { TimerStatusPromptSheet } from '@/features/timer/TimerStatusPromptSheet';
import { useDailyPending, useDirtyGuard } from '@/hooks/dailyReport';
import { useTimerPromptStore } from '@/hooks/timer';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useProjectSync } from '@/hooks/useProjectSync';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

import { confirmLeaveDirtyDay } from './dirtyGuard';
import { DrawerContext, useDrawer, type DrawerApi } from './DrawerContext';
import { DrawerContent } from './DrawerContent';
import { MODULE_ICONS } from './moduleIcons';
import { grantedModules, splitModules } from './moduleTabs';
import { MOBILE_MODULES, type MobileModule } from './modules';
import type { AppTabParamList, ModuleName } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

const TAB_BAR_HEIGHT = 56;

/**
 * Host for a SELF-HEADED module screen in the tab bar: it renders no header. The screen
 * draws its own `ModuleHeader` (variant `tab`) in every state, so loading/error/empty
 * keep the title and the global strips.
 */
function ModuleTabFrame({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: t.colors.app }]}>
      <HeaderVariantContext.Provider value="tab">{children}</HeaderVariantContext.Provider>
    </View>
  );
}

/** Host for a screen that does NOT draw its own header (the zero-module Menu route): the host supplies it. */
function HostedTabFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: t.colors.app }]}>
      <PageHeader variant="tab" title={title} />
      <TopInsetHandledContext.Provider value>
        <HeaderProvidedContext.Provider value>{children}</HeaderProvidedContext.Provider>
      </TopInsetHandledContext.Provider>
    </View>
  );
}

// One stable component per module: an inline component would remount the screen every render.
const frames = new Map<string, React.ComponentType>();
function frameFor(m: MobileModule): React.ComponentType {
  let C = frames.get(m.menuUrl);
  if (!C) {
    const Screen = m.screen;
    C = function ModuleTab() {
      return (
        <ModuleTabFrame>
          <Screen />
        </ModuleTabFrame>
      );
    };
    frames.set(m.menuUrl, C);
  }
  return C;
}
/**
 * The Menu route is never focused (its press opens the drawer). Only when the user has NO granted mobile module
 * is it the landing route: then it hosts an empty state with a button that opens the drawer (Profile, Sign out).
 */
function MenuTabScreen({ hasModules }: { hasModules: boolean }) {
  const drawer = useDrawer();
  if (hasModules) return null;
  return (
    <HostedTabFrame title="Menu">
      <EmptyState
        icon="lock-closed-outline"
        title="Nothing here yet"
        message="Your role has no screens enabled for mobile. Ask an administrator for access."
        action={{ label: 'Open menu', onPress: () => drawer?.openDrawer() }}
      />
    </HostedTabFrame>
  );
}

/** Tab button with the active indicator: a 3dp bar on the top edge (plus filled icon + semibold label). */
export function TabButton(props: BottomTabBarButtonProps) {
  const t = useTheme();
  const selected = !!props['aria-selected'];
  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      testID={props.testID}
      // Role (button on iOS, tab on Android), label and selected state come from the navigator unchanged.
      role={props.role}
      aria-label={props['aria-label']}
      aria-selected={props['aria-selected']}
      accessibilityState={{ selected }}
      // Feedback on press: alpha ripple on Android, hover background on iOS.
      android_ripple={{ color: t.colors.ripple, borderless: false }}
      style={({ pressed }) => [props.style, styles.tabButton, pressed && Platform.OS === 'ios' && { backgroundColor: t.colors.hover }]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.indicator, { backgroundColor: selected ? t.colors.indicator : t.colors.transparent }]}
      />
      {props.children}
    </Pressable>
  );
}

/**
 * The 5th bar item. It is an ACTION, not a destination: a button (not a tab) that never shows the active
 * indicator and reports `expanded` while the drawer is open.
 */
function MenuTabButton(props: BottomTabBarButtonProps & { expanded: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      testID={props.testID}
      role="button"
      aria-label={props['aria-label']}
      accessibilityHint="Opens the navigation menu"
      accessibilityState={{ expanded: props.expanded }}
      android_ripple={{ color: t.colors.ripple, borderless: false }}
      style={({ pressed }) => [props.style, styles.tabButton, pressed && Platform.OS === 'ios' && { backgroundColor: t.colors.hover }]}
    >
      {props.children}
    </Pressable>
  );
}

function TabIcon({ name, focused, color, dot }: { name: ModuleName | 'Menu'; focused: boolean; color: string; dot: boolean }) {
  const t = useTheme();
  return (
    <View>
      <Icon name={focused ? MODULE_ICONS[name].on : MODULE_ICONS[name].off} size={24} color={color} />
      {dot ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.dot, { backgroundColor: t.colors.dotWarn, borderColor: t.colors.surface }]}
        />
      ) : null}
    </View>
  );
}

function TabLabel({ title, focused, color }: { title: string; focused: boolean; color: string }) {
  return (
    <Text
      size="2xs"
      weight={focused ? 'semibold' : 'medium'}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      maxFontScale={1.15}
      style={{ color }}
    >
      {title}
    </Text>
  );
}

/**
 * Bottom bar = up to 4 server-granted modules that exist on mobile + a fixed Menu item (never more than 5).
 * Menu opens the navigation drawer, which lists ALL granted modules (so a 5th/6th one opens from there), Profile,
 * the web-only list and Sign out. Module tabs come from MOBILE_MODULES filtered by GET /menu-access/my, so a role never
 * sees an entry the server did not grant. The ORDER is role-aware (presentation only, see moduleTabs.TAB_PRIORITY).
 * The offline strip and the running-timer strip live in PageHeader, so they show on pushed screens too.
 */
export function AppTabs() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const roleId = useAuthStore((s) => s.user?.roleId);
  const { canView, mobileMenus, isLoading, loadFailed, error, refetch } = useMenuAccess();
  const logout = useAuthStore((s) => s.logout);
  useProjectSync(); // validate the persisted project against /projects (after hydration)

  // Granted by the server AND visible on mobile (is_visible_on_mobile !== false), in role order.
  const granted = useMemo(() => grantedModules(MOBILE_MODULES, canView, mobileMenus, roleId), [canView, mobileMenus, roleId]);
  const moduleTabs = splitModules(granted).tabs;
  // The My Day cue needs the pending check even when My Day is drawer-only, not a bar item.
  const hasMyDay = granted.some((m) => m.name === 'MyDay');
  const pending = useDailyPending(hasMyDay);
  const needsSubmit = hasMyDay && pending.data?.needsSubmit === true;
  // My Day lives only in the drawer when it did not make the bar: the unfiled dot moves to Menu.
  const myDayInTabs = moduleTabs.some((m) => m.name === 'MyDay');
  const menuDot = needsSubmit && !myDayInTabs;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [currentTab, setCurrentTab] = useState<ModuleName | null>(null);
  const pendingThen = useRef<(() => void) | null>(null);
  const prompt = useTimerPromptStore((s) => s.prompt);

  const openDrawer = useCallback(() => {
    Keyboard.dismiss();
    setSkipAnimation(false);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = useCallback((then?: () => void) => {
    // Only an explicit callback replaces the pending navigation: a plain close (Close button, scrim, Back) racing
    // with a row tap must not swallow the navigation that tap queued.
    if (then) pendingThen.current = then;
    setDrawerOpen(false);
  }, []);
  const onClosed = useCallback(() => {
    const then = pendingThen.current;
    pendingThen.current = null;
    then?.();
  }, []);

  // A status prompt sheet appearing (async, after a timer start/stop) wins: the drawer goes away at once, no navigation.
  useEffect(() => {
    if (prompt && drawerOpen) {
      pendingThen.current = null;
      setSkipAnimation(true);
      setDrawerOpen(false);
    }
  }, [prompt, drawerOpen]);

  const api = useMemo<DrawerApi>(
    () => ({ open: drawerOpen, openDrawer, closeDrawer, unfiledCue: menuDot }),
    [drawerOpen, openDrawer, closeDrawer, menuDot],
  );

  // Wait for the server's menu grants before building the bar so the first item
  // (Dashboard when granted) is the one the user lands on.
  if (isLoading) {
    return (
      <Screen header={<PageHeader variant="tab" />}>
        <LoadingState label="Loading your menus..." />
      </Screen>
    );
  }
  if (loadFailed) {
    return (
      <Screen header={<PageHeader variant="tab" />}>
        <ErrorState
          title="Couldn't load your menus"
          message={getErrorMessage(error)}
          onRetry={() => void refetch()}
          secondary={{ label: 'Sign out', onPress: () => void logout().catch(() => undefined) }}
        />
      </Screen>
    );
  }

  return (
    <DrawerContext.Provider value={api}>
      <Tab.Navigator
        screenListeners={({ route, navigation }) => ({
          focus: () => {
            if (route.name !== 'Menu') setCurrentTab(route.name as ModuleName);
          },
          tabPress: (e) => {
            // Menu is an action: it opens the drawer and never changes the route (and never asks about My Day).
            if (route.name === 'Menu') {
              e.preventDefault();
              openDrawer();
              return;
            }
            // Unsaved My Day edits: confirm before leaving the tab.
            if (!useDirtyGuard.getState().dirty || route.name === 'MyDay') return;
            e.preventDefault();
            confirmLeaveDirtyDay(() => navigation.navigate(route.name as never));
          },
        })}
        screenOptions={{
          headerShown: false,
          // The keyboard hides the tab bar, so a tab screen's keyboard lift never includes it.
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: t.colors.brand[600],
          tabBarInactiveTintColor: t.colors.fgSubtle,
          tabBarStyle: {
            backgroundColor: t.colors.surface,
            borderTopColor: t.colors.line,
            borderTopWidth: 1,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
          },
          tabBarItemStyle: { minHeight: TAB_BAR_HEIGHT },
          tabBarLabelPosition: 'below-icon',
          tabBarButton: (props) => <TabButton {...props} />,
        }}
      >
        {moduleTabs.map((m) => {
          const unfiled = m.name === 'MyDay' && needsSubmit;
          return (
            <Tab.Screen
              key={m.menuUrl}
              name={m.name}
              component={frameFor(m)}
              options={{
                title: m.title,
                tabBarAccessibilityLabel: unfiled ? 'My Day, not filed yet' : m.title,
                tabBarIcon: ({ focused, color }) => <TabIcon name={m.name} focused={focused} color={color} dot={unfiled} />,
                tabBarLabel: ({ focused, color }) => <TabLabel title={m.title} focused={focused} color={color} />,
              }}
            />
          );
        })}
        <Tab.Screen
          name="Menu"
          options={{
            title: 'Menu',
            tabBarAccessibilityLabel: menuDot ? 'Menu, My Day not filed yet' : 'Menu',
            tabBarButton: (props) => <MenuTabButton {...props} expanded={drawerOpen} />,
            tabBarIcon: ({ focused, color }) => <TabIcon name="Menu" focused={focused} color={color} dot={menuDot} />,
            tabBarLabel: ({ focused, color }) => <TabLabel title="Menu" focused={focused} color={color} />,
          }}
        >
          {() => <MenuTabScreen hasModules={granted.length > 0} />}
        </Tab.Screen>
      </Tab.Navigator>
      <Drawer visible={drawerOpen} onRequestClose={() => closeDrawer()} onClosed={onClosed} skipAnimation={skipAnimation}>
        <DrawerContent granted={granted} currentTab={currentTab ?? moduleTabs[0]?.name ?? null} needsSubmit={needsSubmit} />
      </Drawer>
      <TimerStatusPromptSheet />
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabButton: { alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', top: 0, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
