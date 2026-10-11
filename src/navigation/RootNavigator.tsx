import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { LoginScreen } from '@/auth/LoginScreen';
import { SessionRestoreErrorScreen, SplashScreen } from '@/screens/StatusScreens';
import { useAuthStore } from '@/store/authStore';

import { AppTabs } from './AppTabs';
import { ModuleRoute, ProfileRoute } from './ModuleHost';
import { QATaskScreen } from '@/features/qa/QATaskScreen';
import { SprintDetailScreen } from '@/features/sprints/SprintDetailScreen';
import { TicketCreateScreen } from '@/features/tickets/TicketCreateScreen';
import { TicketDetailScreen } from '@/features/tickets/TicketDetailScreen';
import { TimesheetScreen } from '@/features/timesheet/TimesheetScreen';
import { TaskDetailScreen } from '@/features/tasks/TaskDetailScreen';
import { useTheme } from '@/theme/ThemeProvider';

import type { AuthStackParamList, RootStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Protected navigation: the app stack only exists while authenticated, so
 * there is no route a signed-out user can navigate or deep-link into.
 */
export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const t = useTheme();
  const header = {
    headerShown: true,
    headerBackTitle: 'Back',
    headerStyle: { backgroundColor: t.colors.surface },
    headerTintColor: t.colors.brand[600],
    headerTitleStyle: { color: t.colors.fg },
  } as const;

  if (status === 'loading') return <SplashScreen />;
  if (status === 'error') return <SessionRestoreErrorScreen />;

  if (status === 'authenticated') {
    return (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={AppTabs} />
        <RootStack.Screen name="Module" component={ModuleRoute} options={{ headerShown: false }} />
        <RootStack.Screen name="Profile" component={ProfileRoute} options={{ headerShown: false }} />
        <RootStack.Screen name="QATask" component={QATaskScreen} options={{ ...header, title: 'QA' }} />
        <RootStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ ...header, title: 'Task' }} />
        <RootStack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ ...header, title: 'Ticket' }} />
        <RootStack.Screen name="TicketCreate" component={TicketCreateScreen} options={{ ...header, title: 'New ticket' }} />
        <RootStack.Screen name="SprintDetail" component={SprintDetailScreen} options={{ ...header, title: 'Sprint' }} />
        <RootStack.Screen name="Timesheet" component={TimesheetScreen} options={{ ...header, title: 'Timesheet' }} />
      </RootStack.Navigator>
    );
  }

  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}
