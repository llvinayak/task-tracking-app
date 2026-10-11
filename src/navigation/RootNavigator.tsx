import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { LoginScreen } from '@/auth/LoginScreen';
import { SessionRestoreErrorScreen, SplashScreen } from '@/screens/StatusScreens';
import { useAuthStore } from '@/store/authStore';

import { AppTabs } from './AppTabs';
import { ModuleRoute, ProfileRoute, withPushHeader } from './ModuleHost';
import { QATaskScreen } from '@/features/qa/QATaskScreen';
import { SprintDetailScreen } from '@/features/sprints/SprintDetailScreen';
import { TicketCreateScreen } from '@/features/tickets/TicketCreateScreen';
import { TicketDetailScreen } from '@/features/tickets/TicketDetailScreen';
import { TimesheetScreen } from '@/features/timesheet/TimesheetScreen';
import { TaskDetailScreen } from '@/features/tasks/TaskDetailScreen';

import type { AuthStackParamList, RootStackParamList } from './types';

// Native headers are hidden on pushed screens: each renders the single PageHeader (back + context title + strips).
const QATaskScreenPush = withPushHeader(QATaskScreen, 'QA');
const TaskDetailScreenPush = withPushHeader(TaskDetailScreen, 'Task');
const TicketDetailScreenPush = withPushHeader(TicketDetailScreen, 'Ticket');
const TicketCreateScreenPush = withPushHeader(TicketCreateScreen, 'New ticket');
const SprintDetailScreenPush = withPushHeader(SprintDetailScreen, 'Sprint');
const TimesheetScreenPush = withPushHeader(TimesheetScreen, 'Timesheet');

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Protected navigation: the app stack only exists while authenticated, so
 * there is no route a signed-out user can navigate or deep-link into.
 */
export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <SplashScreen />;
  if (status === 'error') return <SessionRestoreErrorScreen />;

  if (status === 'authenticated') {
    return (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={AppTabs} />
        <RootStack.Screen name="Module" component={ModuleRoute} />
        <RootStack.Screen name="Profile" component={ProfileRoute} />
        <RootStack.Screen name="QATask" component={QATaskScreenPush} />
        <RootStack.Screen name="TaskDetail" component={TaskDetailScreenPush} />
        <RootStack.Screen name="TicketDetail" component={TicketDetailScreenPush} />
        <RootStack.Screen name="TicketCreate" component={TicketCreateScreenPush} />
        <RootStack.Screen name="SprintDetail" component={SprintDetailScreenPush} />
        <RootStack.Screen name="Timesheet" component={TimesheetScreenPush} />
      </RootStack.Navigator>
    );
  }

  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}
