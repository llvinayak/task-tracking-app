import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UseQueryResult } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import type { Task } from '@/api/models';
import { QA_QUEUE_STATUSES, type QAQueueStatus } from '@/api/qaApi';
import { Button, Chip, EmptyState, EntityCard, ErrorState, FlagLine, Icon, ModuleHeader, Screen, SkeletonCards, StaleBanner, Text } from '@/components/ui';
import { useTaskConfig } from '@/hooks/queries';
import { useOverdueToQA, useQAQueue } from '@/hooks/qa';
import { useChangeStatus } from '@/hooks/taskMutations';
import { useTodayKey } from '@/hooks/useToday';
import type { RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme/ThemeProvider';
import { daysFromToday } from '@/utils/dates';
import { allowedTargets, statusLabel } from '@/utils/taskUtils';

import { StatusChip } from '../tasks/TaskParts';

type View_ = QAQueueStatus | 'OVERDUE';

function QARow({ task, view, onOpen }: { task: Task; view: View_; onOpen: (t: Task) => void }) {
  const t = useTheme();
  const { config } = useTaskConfig();
  const change = useChangeStatus();
  useTodayKey();

  const parentOnly = task.status !== 'READY_FOR_QA' && task.ready_subtasks.length > 0;
  const overdueDays = view === 'OVERDUE' ? daysFromToday(task.release_to_qa_date) : null;
  const sprint = [task.sprint?.name, task.releaseSprint?.name].filter(Boolean).join(' · ');

  const overdue = overdueDays !== null && overdueDays < 0;
  return (
    <EntityCard
      testID={`qa-row-${task.id}`}
      accent={overdue ? 'danger' : task.reopen_count > 0 ? 'warning' : 'brand'}
      title={task.title}
      onPress={() => onOpen(task)}
      accessibilityLabel={`${task.title}. ${statusLabel(config, task.status)}. QA: ${task.qaOwner?.name ?? 'Unassigned'}${
        task.reopen_count > 0 ? `. Reopened ${task.reopen_count}x` : ''
      }`}
      header={overdue ? <FlagLine label={`${Math.abs(overdueDays)}d overdue to QA`} tone="danger" /> : undefined}
      meta={
        <View style={styles.metaStack}>
          <View style={styles.tags}>
            <StatusChip status={task.status} config={config} />
            <Text size="xs" tone="muted">
              QA: {task.qaOwner?.name ?? 'Unassigned'}
            </Text>
            {task.reopen_count > 0 ? (
              <View style={styles.tags}>
                <Icon name="refresh" size={12} tone="warning" />
                <Text size="xs" weight="semibold" tone="warning">
                  Reopened {task.reopen_count}x
                </Text>
              </View>
            ) : null}
          </View>
          {sprint ? (
            <Text size="xs" tone="subtle" numberOfLines={1}>
              {sprint}
            </Text>
          ) : null}
          {parentOnly ? (
            <Text size="sm" tone="muted">
              Parent task is not ready itself · {task.ready_subtasks.length}{' '}
              {task.ready_subtasks.length === 1 ? 'subtask' : 'subtasks'} ready for QA
            </Text>
          ) : null}
        </View>
      }
      footer={
        task.ready_subtasks.length > 0 ? (
          <View>
            {task.ready_subtasks.map((s) => {

              const allowed = new Set(allowedTargets(config, s.status).map((x) => x.key));
              return (
        <View key={s.id} style={[styles.sub, { borderTopColor: t.colors.line }]} testID={`qa-sub-${s.id}`}>
          <Text style={styles.flex1} numberOfLines={2}>
            {s.title}
          </Text>
          <View style={styles.tags}>
            <Button
              label="Pass"
              accessibilityLabel={`Pass ${s.title}`}
              variant="secondary"
              size="compact"
              fullWidth={false}
              disabled={change.isPending || !allowed.has('PASS')}
              onPress={() => change.mutate({ taskId: s.id, status: 'PASS', successMessage: `Moved to ${statusLabel(config, 'PASS')}` })}
            />
            <Button
              label="Fail"
              accessibilityLabel={`Fail ${s.title}`}
              variant="dangerOutline"
              size="compact"
              fullWidth={false}
              disabled={change.isPending || !allowed.has('FAIL')}
              onPress={() => change.mutate({ taskId: s.id, status: 'FAIL', successMessage: `Moved to ${statusLabel(config, 'FAIL')}` })}
            />
          </View>
          {!allowed.has('PASS') || !allowed.has('FAIL') ? (
            <Text size="2xs" tone="muted">
              {!allowed.has('PASS') && !allowed.has('FAIL')
                ? `Pass and Fail can't be recorded while this subtask is ${statusLabel(config, s.status)}.`
                : !allowed.has('PASS')
                  ? `Pass can't be recorded while this subtask is ${statusLabel(config, s.status)}.`
                  : `Fail can't be recorded while this subtask is ${statusLabel(config, s.status)}.`}
            </Text>
          ) : null}
        </View>
              );
            })}
          </View>
        ) : undefined
      }
    />
  );
}

function List({ query, view, onOpen }: { query: UseQueryResult<Task[]>; view: View_; onOpen: (t: Task) => void }) {
  if (query.isLoading) return <SkeletonCards label="Loading..." variant="task" count={4} />;
  if (query.isError && !query.data) {
    return <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <View style={styles.list}>
      {query.isError ? <StaleBanner message={getErrorMessage(query.error)} /> : null}
      {(query.data ?? []).length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title={view === 'OVERDUE' ? 'Nothing is overdue to QA' : 'Nothing here'} />
      ) : (
        (query.data ?? []).map((task) => <QARow key={task.id} task={task} view={view} onOpen={onOpen} />)
      )}
    </View>
  );
}

/** QA queue. Ignores the project picker on purpose (as the web QA page does). */
export function QAScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { config } = useTaskConfig();
  const ready = useQAQueue('READY_FOR_QA');
  const fail = useQAQueue('FAIL');
  const reopen = useQAQueue('REOPEN');
  const overdue = useOverdueToQA();
  const [view, setView] = useState<View_>('READY_FOR_QA');
  const queries = { READY_FOR_QA: ready, FAIL: fail, REOPEN: reopen } as const;

  // Unique task ids across the three queues.
  const awaiting = useMemo(() => {
    const ids = new Set<number>();
    for (const q of [ready, fail, reopen]) for (const t of q.data ?? []) ids.add(t.id);
    return ids.size;
  }, [ready, fail, reopen]);

  const open = (t: Task) => nav.navigate('QATask', { taskId: t.id });
  const refreshing = ready.isRefetching || fail.isRefetching || reopen.isRefetching || overdue.isRefetching;
  const refresh = () => {
    void ready.refetch();
    void fail.refetch();
    void reopen.refetch();
    void overdue.refetch();
  };
  const overdueCount = overdue.data?.length ?? 0;

  return (
    <Screen scroll edges={['left', 'right']} header={<ModuleHeader title="QA" />} onRefresh={refresh} refreshing={refreshing}>
      <Text tone="muted" testID="qa-awaiting" style={styles.sub0}>
        {awaiting} {awaiting === 1 ? 'task' : 'tasks'} awaiting QA
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips} style={styles.chipScroll}>
        {QA_QUEUE_STATUSES.map((s) => (
          <Chip
            key={s}
            testID={`qa-tab-${s}`}
            label={statusLabel(config, s)}
            count={queries[s].data?.length ?? 0}
            selected={view === s}
            onPress={() => setView(s)}
          />
        ))}
        <Chip
          testID="qa-tab-OVERDUE"
          label="Overdue to QA"
          count={overdueCount}
          selected={view === 'OVERDUE'}
          onPress={() => setView('OVERDUE')}
        />
      </ScrollView>

      <List query={view === 'OVERDUE' ? overdue : queries[view]} view={view} onOpen={open} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  sub0: { marginBottom: 8 },
  chipScroll: { flexGrow: 0, marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  list: { gap: 8 },
  metaStack: { gap: 8 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  sub: { padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
