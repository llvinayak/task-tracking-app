import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { Badge, Button, Chip, ErrorState, LoadingState, Screen, StaleBanner, Text } from '@/components/ui';
import { useTaskConfig, useTask, useTaskPermissionsQuery } from '@/hooks/queries';
import { useChangeStatus } from '@/hooks/taskMutations';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import type { RootStackParamList } from '@/navigation/types';
import {
  PRIORITY_TONE,
  TYPE_TONE,
  allowedTargets,
  cardFlag,
  priorityLabel,
  taskCode,
  typeLabel,
} from '@/utils/taskUtils';

import { QAPanel } from '../qa/QAPanel';
import { TaskTimePanel, TimerControl } from '../timer/TimerControl';
import { StatusSheet } from './StatusSheet';
import { AttachmentsTab, CommentsTab, HistoryTab, OverviewTab, PeopleTab } from './TaskDetailTabs';
import { StatusChip } from './TaskParts';

const TABS = ['Overview', 'Time', 'QA', 'People', 'Comments', 'History', 'Files'] as const;
type TabName = (typeof TABS)[number];

export function TaskDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const taskId = params.taskId;

  const task = useTask(taskId);
  const perms = useTaskPermissionsQuery(taskId);
  const { config } = useTaskConfig();
  const changeStatus = useChangeStatus();
  const { canView } = useMenuAccess();
  const [tab, setTab] = useState<TabName>('Overview');
  const [sheet, setSheet] = useState(false);

  if (task.isLoading) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <LoadingState label="Loading task..." />
      </Screen>
    );
  }
  // Only a FAILED INITIAL load replaces the screen. A failed background refetch keeps
  // the stale task on screen with a banner (see StaleBanner below).
  if (!task.data) {
    // 404 / 403 messages come verbatim from the server.
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <ErrorState
          title="Couldn't open this task"
          message={getErrorMessage(task.error)}
          onRetry={() => void task.refetch()}
          secondary={{ label: 'Go back', onPress: () => nav.goBack() }}
        />
      </Screen>
    );
  }

  const data = task.data;
  const flag = cardFlag(data);
  const targets = allowedTargets(config, data.status);
  // The detail screen uses the authoritative server permission, not a hint.
  const canEdit = perms.data?.canEdit === true;
  const canAssign = perms.data?.canAssign === true;

  return (
    <Screen
      scroll
      edges={['left', 'right', 'bottom']}
      keyboardAvoiding
      onRefresh={() => {
        void task.refetch();
        void perms.refetch();
      }}
      refreshing={task.isRefetching}
    >
      {task.isError ? <StaleBanner message={getErrorMessage(task.error)} /> : null}
      <View style={styles.head}>
        <Text size="xs" tone="subtle" weight="semibold">
          {taskCode(data)}
          {data.project ? ` · ${data.project.name}` : ''}
        </Text>
        <Text size="2xl" weight="bold" accessibilityRole="header">
          {data.title}
        </Text>
        <View style={styles.badges}>
          <StatusChip status={data.status} config={config} />
          <Badge label={typeLabel(data.task_type)} tone={TYPE_TONE[data.task_type] ?? 'neutral'} />
          <Badge label={priorityLabel(data.priority)} tone={PRIORITY_TONE[data.priority] ?? 'neutral'} />
          {flag === 'blocked' ? <Badge label="Blocked" tone="danger" /> : null}
          {flag === 'qa_overdue' ? <Badge label="QA overdue" tone="danger" /> : null}
          {flag === 'at_risk' ? <Badge label="At risk" tone="warning" /> : null}
          {data.reopen_count > 0 ? <Badge label={`Reopened x${data.reopen_count}`} tone="warning" /> : null}
        </View>
        <TimerControl task={data} />
        {canEdit && targets.length > 0 ? (
          <Button
            label="Move to..."
            variant="secondary"
            fullWidth={false}
            loading={changeStatus.isPending}
            onPress={() => setSheet(true)}
          />
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((n) => (
          <Chip key={n} label={n} selected={tab === n} onPress={() => setTab(n)} />
        ))}
      </ScrollView>

      <View style={styles.body}>
        {tab === 'Overview' ? (
          <OverviewTab task={data} config={config} onOpenTask={(id) => nav.push('TaskDetail', { taskId: id })} />
        ) : null}
        {tab === 'Time' ? <TaskTimePanel taskId={data.id} /> : null}
        {/* Read-only for everyone; actions only when the user can open the QA module. */}
        {tab === 'QA' ? <QAPanel taskId={data.id} status={data.status} canAct={canView('/qa')} /> : null}
        {tab === 'People' ? <PeopleTab task={data} canAssign={canAssign} /> : null}
        {tab === 'Comments' ? <CommentsTab taskId={data.id} /> : null}
        {tab === 'History' ? <HistoryTab task={data} config={config} /> : null}
        {tab === 'Files' ? <AttachmentsTab task={data} /> : null}
      </View>

      <StatusSheet
        task={sheet ? data : null}
        config={config}
        busy={changeStatus.isPending}
        onClose={() => setSheet(false)}
        onSelect={(tk, status) => {
          setSheet(false);
          changeStatus.mutate({ taskId: tk.id, status });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8, marginBottom: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tabs: { gap: 8 },
  body: { marginTop: 8, paddingBottom: 24 },
});
