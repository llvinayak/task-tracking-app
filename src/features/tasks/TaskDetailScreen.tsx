import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { Badge, Button, ErrorState, PriorityBadge, Screen, SegmentedControl, SkeletonDetailHeader, StaleBanner, TabStrip, Text } from '@/components/ui';
import { useTaskConfig, useTask, useTaskPermissionsQuery } from '@/hooks/queries';
import { useChangeStatus } from '@/hooks/taskMutations';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import type { RootStackParamList } from '@/navigation/types';
import { formatDay } from '@/utils/dates';
import {
  allowedTargets,
  dueDisplay,
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

type TabName = 'Overview' | 'Time' | 'QA' | 'Comments' | 'More';
type MoreSection = 'People' | 'History' | 'Files';
const MORE_SECTIONS: { value: MoreSection; label: string }[] = [
  { value: 'People', label: 'People' },
  { value: 'History', label: 'History' },
  { value: 'Files', label: 'Files' },
];
/** The QA tab is relevant when the user can open the QA module or the task is somewhere in the QA flow. */
const QA_RELEVANT_STATUSES = new Set(['READY_FOR_QA', 'PASS', 'FAIL', 'REOPEN']);

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
  const [more, setMore] = useState<MoreSection>('People');
  const [sheet, setSheet] = useState(false);

  if (task.isLoading) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <SkeletonDetailHeader label="Loading task..." />
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

  const qaRelevant = canView('/qa') || QA_RELEVANT_STATUSES.has(data.status);
  const tabItems: { key: TabName; label: string }[] = [
    { key: 'Overview', label: 'Overview' },
    { key: 'Time', label: 'Time' },
    ...(qaRelevant ? [{ key: 'QA' as const, label: 'QA' }] : []),
    { key: 'Comments', label: 'Comments' },
    { key: 'More', label: 'More' },
  ];
  // A hidden QA tab must not stay selected (e.g. the task moved out of the QA flow while open).
  const shownTab: TabName = tab === 'QA' && !qaRelevant ? 'Overview' : tab;
  // The sticky strip is a DIRECT child of the ScrollView; its index skips the optional stale banner.
  const stripIndex = (task.isError ? 1 : 0) + 1;
  const canMoveStatus = canEdit && targets.length > 0;
  // Who and when, as plain text under the title (wraps; nothing is colour only).
  const due = dueDisplay(data, formatDay);
  const metaLine = [
    due ? due.text : null,
    data.devOwner ? `Dev: ${data.devOwner.name}` : null,
    data.qaOwner ? `QA: ${data.qaOwner.name}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen
      scroll
      edges={['left', 'right', 'bottom']}
      keyboardAvoiding
      stickyHeaderIndices={[stripIndex]}
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
        <Text size="xl" weight="bold" accessibilityRole="header">
          {data.title}
        </Text>
        {metaLine ? (
          <Text size="sm" tone="muted" testID="task-meta">
            {metaLine}
          </Text>
        ) : null}
        <View style={styles.badges}>
          <StatusChip status={data.status} config={config} />
          <PriorityBadge priority={data.priority} label={priorityLabel(data.priority)} />
          <Badge label={typeLabel(data.task_type)} variant="outline" icon={data.task_type === 'BUG' ? 'bug-outline' : undefined} />
          {flag === 'blocked' ? <Badge label="Blocked" tone="danger" icon="alert-circle" /> : null}
          {flag === 'qa_overdue' ? <Badge label="QA overdue" tone="danger" icon="alert-circle" /> : null}
          {flag === 'at_risk' ? <Badge label="At risk" tone="warning" icon="warning" /> : null}
          {data.reopen_count > 0 ? <Badge label={`Reopened ${data.reopen_count}x`} tone="warning" icon="refresh" /> : null}
        </View>
        {/* One action row: the timer control and Move to... */}
        <View style={styles.actions}>
          <TimerControl task={data} />
          {canMoveStatus ? (
            <Button
              label="Move to..."
              icon="swap-horizontal"
              variant="secondary"
              fullWidth={false}
              inline
              loading={changeStatus.isPending}
              onPress={() => setSheet(true)}
            />
          ) : null}
        </View>
      </View>

      <TabStrip tabs={tabItems} value={shownTab} onChange={setTab} bleed={16} />

      <View style={styles.body}>
        {shownTab === 'Overview' ? (
          <OverviewTab task={data} config={config} onOpenTask={(id) => nav.push('TaskDetail', { taskId: id })} />
        ) : null}
        {shownTab === 'Time' ? <TaskTimePanel taskId={data.id} /> : null}
        {/* Read-only for everyone; actions only when the user can open the QA module. */}
        {shownTab === 'QA' ? <QAPanel taskId={data.id} status={data.status} canAct={canView('/qa')} /> : null}
        {shownTab === 'Comments' ? <CommentsTab taskId={data.id} /> : null}
        {shownTab === 'More' ? (
          <View style={styles.more}>
            <SegmentedControl options={MORE_SECTIONS} value={more} onChange={setMore} />
            {more === 'People' ? <PeopleTab task={data} canAssign={canAssign} /> : null}
            {more === 'History' ? <HistoryTab task={data} config={config} /> : null}
            {more === 'Files' ? <AttachmentsTab task={data} /> : null}
          </View>
        ) : null}
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  body: { marginTop: 8, paddingBottom: 24 },
  more: { gap: 12 },
});
