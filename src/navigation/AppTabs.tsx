import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '@/api/errors';
import { ErrorState, Icon, LoadingState, PageHeader, Screen, Text } from '@/components/ui';
import { HeaderProvidedContext, HeaderVariantContext, TopInsetHandledContext } from '@/components/ui/Screen';
import { TimerStatusPromptSheet } from '@/features/timer/TimerStatusPromptSheet';
import { useDailyPending, useDirtyGuard } from '@/hooks/dailyReport';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useProjectSync } from '@/hooks/useProjectSync';
import { HomeScreen } from '@/screens/HomeScreen';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

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

/** Host for a screen that does NOT draw its own header (More): the host supplies it. */
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
function MoreTab() {
  return (
    <HostedTabFrame title="More">
      <HomeScreen />
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

function TabIcon({ name, focused, color, dot }: { name: ModuleName | 'More'; focused: boolean; color: string; dot: boolean }) {
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
 * Tabs = up to 4 server-granted modules that exist on mobile + More (never more than 5).
 * Profile and any granted module beyond the 4th are opened from More.
 * Module tabs come from MOBILE_MODULES filtered by GET /menu-access/my, so a
 * role never sees a tab the server did not grant. The ORDER is role-aware
 * (presentation only, see moduleTabs.TAB_PRIORITY).
 * The offline strip and the running-timer strip live in PageHeader, so they show
 * on pushed screens too (not only above the tab bar).
 */
export function AppTabs() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const roleId = useAuthStore((s) => s.user?.roleId);
  const { canView, mobileMenus, isLoading, loadFailed, error, refetch } = useMenuAccess();
  const logout = useAuthStore((s) => s.logout);
  useProjectSync(); // validate the persisted project against /projects (after hydration)

  // Granted by the server AND visible on mobile (is_visible_on_mobile !== false).
  // At most MAX_MODULE_TABS become tabs (+ More); the rest open from More.
  const granted = grantedModules(MOBILE_MODULES, canView, mobileMenus, roleId);
  const moduleTabs = splitModules(granted).tabs;
  // The My Day badge needs the pending check even when My Day is in More, not a tab.
  const hasMyDay = granted.some((m) => m.name === 'MyDay');
  const pending = useDailyPending(hasMyDay);
  const needsSubmit = hasMyDay && pending.data?.needsSubmit === true;
  // My Day lives in More when it did not make the tab bar: the unfiled dot moves to More.
  const myDayInTabs = moduleTabs.some((m) => m.name === 'MyDay');
  const moreDot = needsSubmit && !myDayInTabs;

  // Wait for the server's menu grants before building tabs so the first tab
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
    <>
      <Tab.Navigator
        screenListeners={({ route, navigation }) => ({
          // Unsaved My Day edits: confirm before leaving the tab.
          tabPress: (e) => {
            const guard = useDirtyGuard.getState();
            if (!guard.dirty || route.name === 'MyDay') return;
            e.preventDefault();
            Alert.alert('Discard changes?', 'You have unsaved changes to your day.', [
              { text: 'Keep editing', style: 'cancel' },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  guard.requestDiscard();
                  navigation.navigate(route.name as never);
                },
              },
            ]);
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
          name="More"
          component={MoreTab}
          options={{
            tabBarAccessibilityLabel: moreDot ? 'More, My Day not filed yet' : 'More',
            tabBarIcon: ({ focused, color }) => <TabIcon name="More" focused={focused} color={color} dot={moreDot} />,
            tabBarLabel: ({ focused, color }) => <TabLabel title="More" focused={focused} color={color} />,
          }}
        />
      </Tab.Navigator>
      <TimerStatusPromptSheet />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabButton: { alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', top: 0, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
