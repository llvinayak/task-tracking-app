import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Alert, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { RunningTimerBanner } from '@/features/timer/RunningTimerBanner';
import { TimerStatusPromptSheet } from '@/features/timer/TimerStatusPromptSheet';
import { useDailyPending, useDirtyGuard } from '@/hooks/dailyReport';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useProjectSync } from '@/hooks/useProjectSync';
import { HomeScreen } from '@/screens/HomeScreen';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

import { grantedModules, splitModules } from './moduleTabs';
import { MOBILE_MODULES } from './modules';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

/**
 * Tabs = up to 4 server-granted modules that exist on mobile + More (never more than 5).
 * Profile and any granted module beyond the 4th are opened from More.
 * Module tabs come from MOBILE_MODULES filtered by GET /menu-access/my, so a
 * role never sees a tab the server did not grant.
 * Above the tab bar sit the Offline strip and the running-timer banner.
 */
export function AppTabs() {
  const t = useTheme();
  const { canView, mobileMenus, isLoading, loadFailed, error, refetch } = useMenuAccess();
  const logout = useAuthStore((s) => s.logout);
  useProjectSync(); // validate the persisted project against /projects (after hydration)

  // Granted by the server AND visible on mobile (is_visible_on_mobile !== false).
  // At most MAX_MODULE_TABS become tabs (+ More); the rest open from More.
  const granted = grantedModules(MOBILE_MODULES, canView, mobileMenus);
  const moduleTabs = splitModules(granted).tabs;
  // The My Day badge needs the pending check even when My Day is in More, not a tab.
  const hasMyDay = granted.some((m) => m.name === 'MyDay');
  const pending = useDailyPending(hasMyDay);
  const needsSubmit = hasMyDay && pending.data?.needsSubmit === true;

  // Wait for the server's menu grants before building tabs so the first tab
  // (Dashboard when granted) is the one the user lands on.
  if (isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading your menus..." />
      </Screen>
    );
  }
  if (loadFailed) {
    return (
      <Screen>
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
        tabBar={(props) => (
          <View>
            <OfflineBanner />
            <RunningTimerBanner />
            <BottomTabBar {...props} />
          </View>
        )}
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
          tabBarActiveTintColor: t.colors.brand[600],
          tabBarInactiveTintColor: t.colors.fgSubtle,
          tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.line },
          tabBarLabelStyle: { fontSize: t.typography['2xs'].fontSize, fontWeight: t.fontWeights.semibold },
          tabBarItemStyle: { minHeight: t.minTouch },
          tabBarIconStyle: { display: 'none' },
          tabBarLabelPosition: 'beside-icon',
        }}
      >
        {moduleTabs.map((m) => (
          <Tab.Screen
            key={m.menuUrl}
            name={m.name}
            component={m.screen}
            options={{
              title: m.title,
              tabBarAccessibilityLabel: m.name === 'MyDay' && needsSubmit ? 'My Day, not filed yet' : m.title,
              ...(m.name === 'MyDay' && needsSubmit ? { tabBarBadge: 1 } : {}),
            }}
          />
        ))}
        <Tab.Screen name="More" component={HomeScreen} options={{ tabBarAccessibilityLabel: 'More' }} />
      </Tab.Navigator>
      <TimerStatusPromptSheet />
    </>
  );
}
