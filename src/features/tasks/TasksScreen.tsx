import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import type { Task } from '@/api/models';
import { Button, Chip, Dot, EmptyState, ErrorState, Input, LoadingState, Screen, SegmentedControl, Text } from '@/components/ui';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useDebounced } from '@/hooks/useDebounced';
import { useTodayKey } from '@/hooks/useToday';
import { useProjectTeam, useTaskConfig, useTasks } from '@/hooks/queries';
import { useChangeStatus } from '@/hooks/taskMutations';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';
import { PRIORITIES, TASK_TYPES, allowedTargets, canEditTaskHint, groupTasks, matchesQuick, priorityLabel, quickCounts, QUICK_FILTERS, typeLabel, type GroupBy, type QuickFilter } from '@/utils/taskUtils';

import { ProjectButton, ProjectPickerSheet } from '../projects/ProjectPicker';
import { StatusSheet } from './StatusSheet';
import { TaskCard } from './TaskCard';

export function TasksScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = useTodayKey(); // overdue / due pills roll over at local midnight and on app resume
  const userId = useAuthStore((s) => s.user?.id);
  const selected = useProjectStore((s) => s.selected);
  const { canEdit } = useMenuAccess();

  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText, 300);
  const [priority, setPriority] = useState<string>('');
  const [taskType, setTaskType] = useState<string>('');
  const [backlogOnly, setBacklogOnly] = useState(false);
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moving, setMoving] = useState<Task | null>(null);

  const { config, isError: configError, refetch: refetchConfig } = useTaskConfig();
  const team = useProjectTeam(selected?.id);
  const changeStatus = useChangeStatus();

  const filters = useMemo(
    () => ({
      projectId: selected?.id ?? null,
      search,
      priority,
      taskType,
      sprintId: backlogOnly ? ('none' as const) : null,
    }),
    [selected?.id, search, priority, taskType, backlogOnly],
  );
  const tasksQuery = useTasks(filters);
  const all = tasksQuery.data;

  const counts = useMemo(() => {
    void today; // overdue maths depends on the calendar day, so re-derive at midnight / resume
    return quickCounts(all ?? []);
  }, [all, today]);
  const visible = useMemo(
    () => {
      void today;
      return quick ? (all ?? []).filter((x) => matchesQuick(x, quick)) : (all ?? []);
    },
    [all, quick, today],
  );
  const groups = useMemo(() => groupTasks(visible, config, groupBy), [visible, config, groupBy]);
  const sections = useMemo(() => groups.map((g) => ({ ...g, title: g.label })), [groups]);

  const projectsMenuEdit = canEdit('/projects');
  const canMove = useCallback(
    (task: Task) =>
      allowedTargets(config, task.status).length > 0 &&
      canEditTaskHint({ userId, task, projectsMenuEdit, team: team.data }),
    [config, userId, projectsMenuEdit, team.data],
  );

  const openTask = useCallback((task: Task) => nav.navigate('TaskDetail', { taskId: task.id }), [nav]);
  const openMove = useCallback((task: Task) => setMoving(task), []);

  const hasFilters = !!(searchText || priority || taskType || backlogOnly || quick);
  const clearFilters = () => {
    setSearchText('');
    setPriority('');
    setTaskType('');
    setBacklogOnly(false);
    setQuick(null);
  };

  const refresh = () => {
    void tasksQuery.refetch();
    if (configError) void refetchConfig();
  };

  let body: React.ReactNode;
  if (tasksQuery.isLoading) {
    body = <LoadingState label="Loading tasks..." />;
  } else if (tasksQuery.isError && !all) {
    body = <ErrorState message={getErrorMessage(tasksQuery.error)} onRetry={() => void tasksQuery.refetch()} />;
  } else if (visible.length === 0) {
    body = (
      <ScrollView
        contentContainerStyle={styles.emptyWrap}
        refreshControl={<RefreshControl refreshing={tasksQuery.isRefetching} onRefresh={refresh} tintColor={t.colors.brand[500]} />}
      >
        <EmptyState
          title={hasFilters ? 'No tasks match' : 'No tasks yet'}
          message={hasFilters ? 'Try changing or clearing the filters.' : selected ? `No tasks in ${selected.name}.` : 'Tasks you can access will appear here.'}
        />
        {hasFilters ? <Button label="Clear filters" variant="secondary" fullWidth={false} onPress={clearFilters} /> : null}
      </ScrollView>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(task) => String(task.id)}
        stickySectionHeadersEnabled
        initialNumToRender={8}
        windowSize={7}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={tasksQuery.isRefetching} onRefresh={refresh} tintColor={t.colors.brand[500]} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: t.colors.app }]} accessibilityRole="header">
            <Dot color={section.color} size={10} />
            <Text weight="semibold">{section.label}</Text>
            <Text size="sm" tone="subtle">
              {section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            config={config}
            today={today}
            highlightOverdue={quick === 'overdue'}
            canMove={canMove(item)}
            onPress={openTask}
            onMove={openMove}
          />
        )}
        ListFooterComponent={
          tasksQuery.isError ? (
            <Text tone="danger" size="sm" style={styles.stale}>
              Could not refresh: {getErrorMessage(tasksQuery.error)}
            </Text>
          ) : null
        }
      />
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      <View style={styles.header}>
        <Text size="2xl" weight="bold" accessibilityRole="header">
          Tasks
        </Text>
        <ProjectButton onPress={() => setPickerOpen(true)} />
        <Input
          label="Search tasks"
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Title, description or #id"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {QUICK_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              count={counts[f.key]}
              selected={quick === f.key}
              onPress={() => setQuick(quick === f.key ? null : f.key)}
            />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Backlog" selected={backlogOnly} onPress={() => setBacklogOnly((v) => !v)} />
          {PRIORITIES.map((p) => (
            <Chip key={p} testID={`chip-priority-${p}`} label={priorityLabel(p)} selected={priority === p} onPress={() => setPriority(priority === p ? '' : p)} />
          ))}
          {TASK_TYPES.map((x) => (
            <Chip key={x} testID={`chip-type-${x}`} label={typeLabel(x)} selected={taskType === x} onPress={() => setTaskType(taskType === x ? '' : x)} />
          ))}
        </ScrollView>
        <View style={styles.groupRow}>
          <Text size="xs" tone="subtle">
            {visible.length} {visible.length === 1 ? 'task' : 'tasks'}
          </Text>
          <View style={styles.flex1}>
            <SegmentedControl
              options={[
                { value: 'status' as GroupBy, label: 'By status' },
                { value: 'priority' as GroupBy, label: 'By priority' },
              ]}
              value={groupBy}
              onChange={setGroupBy}
            />
          </View>
        </View>
      </View>

      <View style={styles.flex1}>{body}</View>

      <ProjectPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      <StatusSheet
        task={moving}
        config={config}
        busy={changeStatus.isPending}
        onClose={() => setMoving(null)}
        onSelect={(task, status) => {
          setMoving(null);
          changeStatus.mutate({ taskId: task.id, status });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  chips: { gap: 8, paddingVertical: 0 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  sep: { height: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  stale: { paddingVertical: 12 },
});
