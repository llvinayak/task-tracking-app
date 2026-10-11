import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { Task } from '@/api/models';
import {
  BottomSheet,
  Button,
  Chip,
  ChoiceChips,
  Dot,
  EmptyState,
  ErrorState,
  Input,
  ModuleHeader,
  Screen,
  SegmentedControl,
  SkeletonCards,
  Text,
} from '@/components/ui';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useDebounced } from '@/hooks/useDebounced';
import { useScreenBottomPadding } from '@/hooks/useScreenBottomPadding';
import { useTodayKey } from '@/hooks/useToday';
import { useProjectTeam, useTaskConfig, useTasks } from '@/hooks/queries';
import { useChangeStatus } from '@/hooks/taskMutations';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';
import {
  PRIORITIES,
  TASK_TYPES,
  allowedTargets,
  canEditTaskHint,
  groupTasks,
  matchesQuick,
  priorityLabel,
  quickCounts,
  QUICK_FILTERS,
  typeLabel,
  type GroupBy,
  type QuickFilter,
} from '@/utils/taskUtils';

import { ProjectButton, ProjectPickerSheet } from '../projects/ProjectPicker';
import { StatusSheet } from './StatusSheet';
import { TaskCard } from './TaskCard';

const ANY = '';
/** Stable (not an inline arrow): the list does not re-create its separators on every render. */
const Separator = () => <View style={styles.sep} />;

export function TasksScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = useTodayKey(); // overdue / due text roll over at local midnight and on app resume
  const userId = useAuthStore((s) => s.user?.id);
  const selected = useProjectStore((s) => s.selected);
  const { canEdit } = useMenuAccess();
  const listBottom = useScreenBottomPadding(24);

  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText, 300);
  const [priority, setPriority] = useState<string>(ANY);
  const [taskType, setTaskType] = useState<string>(ANY);
  const [backlogOnly, setBacklogOnly] = useState(false);
  /** "Mine": the API's assigned_to filter, which matches the dev/QA/support OWNER columns only. Default OFF. */
  const [mine, setMine] = useState(false);
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      ...(mine && userId ? { assignedTo: userId } : {}),
    }),
    [selected?.id, search, priority, taskType, backlogOnly, mine, userId],
  );
  const tasksQuery = useTasks(filters);
  const all = tasksQuery.data;

  const counts = useMemo(() => {
    void today; // overdue maths depends on the calendar day, so re-derive at midnight / resume
    return quickCounts(all ?? []);
  }, [all, today]);
  const visible = useMemo(() => {
    void today;
    return quick ? (all ?? []).filter((x) => matchesQuick(x, quick)) : (all ?? []);
  }, [all, quick, today]);
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

  /** Filters that live in the sheet (the quick chips and Mine are visible on the list itself). */
  const sheetFilterCount =
    [priority, taskType].filter(Boolean).length + (backlogOnly ? 1 : 0) + (groupBy !== 'status' ? 1 : 0);
  const hasFilters = !!(searchText || priority || taskType || backlogOnly || quick || mine);
  const clearFilters = () => {
    setSearchText('');
    setPriority(ANY);
    setTaskType(ANY);
    setBacklogOnly(false);
    setMine(false);
    setQuick(null);
  };
  const clearSheetFilters = () => {
    setPriority(ANY);
    setTaskType(ANY);
    setBacklogOnly(false);
    setGroupBy('status');
  };

  const loading = tasksQuery.isLoading;
  const refresh = () => {
    void tasksQuery.refetch();
    if (configError) void refetchConfig();
  };
  const refreshControl = (
    <RefreshControl refreshing={tasksQuery.isRefetching} onRefresh={refresh} tintColor={t.colors.brand[500]} />
  );

  /** Scrolls WITH the list (not fixed chrome): quick filters, the Mine helper and the count line. */
  const listHeader = (
    <View style={styles.listHeader}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
      >
        <Chip testID="chip-mine" label="Mine" selected={mine} disabled={!userId} onPress={() => setMine((v) => !v)} />
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
      {mine ? (
        <Text size="xs" tone="muted" testID="mine-helper">
          Mine = tasks where you are the dev, QA or support owner.
        </Text>
      ) : null}
      {/* Never "0 tasks" while the list is still loading; plain text (the Filters button opens the sheet). */}
      {loading ? null : (
        <Text size="xs" tone="subtle" testID="task-count" style={styles.countRow}>
          {visible.length} {visible.length === 1 ? 'task' : 'tasks'} · Grouped by {groupBy}
        </Text>
      )}
    </View>
  );

  const failed = tasksQuery.isError && !all;
  // The list structure must not change under the native layer: `sections` is never empty. While loading, failed or
  // when nothing matches, ONE placeholder section (no rows, no header) carries the skeleton/error/empty block in its
  // footer, so ListHeaderComponent and ListEmptyComponent are never swapped in/out on a filter or search change.
  const showPlaceholder = loading || failed || sections.length === 0;
  const listSections = useMemo(
    () => (showPlaceholder ? [{ ...PLACEHOLDER_SECTION }] : sections) as unknown as typeof sections,
    [showPlaceholder, sections],
  );
  // The list and its header (chips, Mine helper) are ALWAYS mounted: loading, error and empty are the
  // list's empty component. A filter/search change therefore never remounts the chips or flashes the skeleton in place of them.
  const emptyState = loading ? (
    <View style={styles.skeleton}>
      <SkeletonCards label="Loading tasks..." variant="task" count={5} />
    </View>
  ) : failed ? (
    <ErrorState message={getErrorMessage(tasksQuery.error)} onRetry={() => void tasksQuery.refetch()} />
  ) : (
    <EmptyState
      icon="checkmark-done-outline"
      title={hasFilters ? 'No tasks match' : 'No tasks yet'}
      message={
        hasFilters
          ? 'Try changing or clearing the filters.'
          : selected
            ? `No tasks in ${selected.name}.`
            : 'Tasks you can access will appear here.'
      }
      {...(hasFilters ? { action: { label: 'Clear filters', onPress: clearFilters } } : {})}
    />
  );
  const body = (
    <SectionList
      sections={listSections}
      keyExtractor={(task) => String(task.id)}
      // Sticky section headers only on iOS: on Android they are the other half of the Fabric viewState crash hypothesis.
      stickySectionHeadersEnabled={Platform.OS === 'ios'}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      windowSize={7}
      maxToRenderPerBatch={8}
      // Off on purpose (RN defaults it ON for Android): view clipping combined with sticky headers and a changing
      // header/empty component is the classic New-Architecture 'Unable to find viewState for tag' crash class.
      removeClippedSubviews={false}
      contentContainerStyle={[styles.listContent, { paddingBottom: listBottom }, showPlaceholder && styles.growContent]}
      refreshControl={refreshControl}
      ListHeaderComponent={listHeader}
      ItemSeparatorComponent={Separator}
      renderSectionFooter={({ section }) => (isPlaceholder(section) ? emptyState : null)}
      renderSectionHeader={({ section }) =>
        isPlaceholder(section) ? null : (
          <View style={[styles.sectionHeader, { backgroundColor: t.colors.app }]} accessibilityRole="header">
            <Dot color={section.color} size={10} />
            <Text weight="semibold">{section.label}</Text>
            <Text size="sm" tone="subtle">
              {section.data.length}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        // One malformed row must never take the whole board (or the app) down: it degrades to a small notice.
        <ErrorBoundary
          inline
          message="This task could not be displayed."
          resetKey={item}
          action={{ label: 'Open task', onPress: () => openTask(item) }}
        >
          <TaskCard
            task={item}
            config={config}
            today={today}
            highlightOverdue={quick === 'overdue'}
            canMove={canMove(item)}
            showStatus={groupBy === 'priority'}
            onPress={openTask}
            onMove={openMove}
          />
        </ErrorBoundary>
      )}
      ListFooterComponent={
        tasksQuery.isError && all ? (
          <Text tone="danger" size="sm" style={styles.stale}>
            Could not refresh: {getErrorMessage(tasksQuery.error)}
          </Text>
        ) : null
      }
    />
  );

  return (
    <Screen
      edges={['left', 'right']}
      padded={false}
      header={<ModuleHeader title="Tasks" trailing={<ProjectButton onPress={() => setPickerOpen(true)} />} />}
    >
      {/* Fixed chrome is ONE row: search + Filters. Everything else scrolls with the list. */}
      <View style={styles.toolbar}>
        <View style={styles.flex1}>
          <Input
            label="Search tasks"
            hideLabel
            leadingIcon="search"
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search tasks"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <Button
          testID="open-filters"
          label={sheetFilterCount > 0 ? `Filters (${sheetFilterCount})` : 'Filters'}
          accessibilityLabel={sheetFilterCount > 0 ? `Filters, ${sheetFilterCount} active` : 'Filters'}
          icon="options-outline"
          variant="secondary"
          fullWidth={false}
          inline
          onPress={() => setFiltersOpen(true)}
        />
      </View>

      <View style={styles.flex1}>{body}</View>

      <ProjectPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      <BottomSheet
        visible={filtersOpen}
        title="Filters"
        onClose={() => setFiltersOpen(false)}
        footer={
          <View style={styles.sheetFooter}>
            <Button
              label="Clear all"
              variant="ghost"
              fullWidth={false}
              inline
              onPress={clearSheetFilters}
              disabled={sheetFilterCount === 0}
            />
            <Button
              testID="show-tasks"
              label={loading ? 'Show tasks' : `Show ${visible.length} ${visible.length === 1 ? 'task' : 'tasks'}`}
              fullWidth={false}
              inline
              onPress={() => setFiltersOpen(false)}
            />
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <Text size="sm" weight="semibold" tone="muted">
            Group by
          </Text>
          <SegmentedControl
            options={[
              { value: 'status' as GroupBy, label: 'By status' },
              { value: 'priority' as GroupBy, label: 'By priority' },
            ]}
            value={groupBy}
            onChange={setGroupBy}
          />
          <Text size="sm" weight="semibold" tone="muted">
            Priority
          </Text>
          <ChoiceChips
            accessibilityLabel="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              { value: ANY, label: 'Any', testID: 'chip-priority-any' },
              ...PRIORITIES.map((p) => ({
                value: p as string,
                label: priorityLabel(p),
                testID: `chip-priority-${p}`,
              })),
            ]}
          />
          <Text size="sm" weight="semibold" tone="muted">
            Type
          </Text>
          <ChoiceChips
            accessibilityLabel="Type"
            value={taskType}
            onChange={setTaskType}
            options={[
              { value: ANY, label: 'Any', testID: 'chip-type-any' },
              ...TASK_TYPES.map((x) => ({
                value: x as string,
                label: typeLabel(x),
                testID: `chip-type-${x}`,
              })),
            ]}
          />
          <Text size="sm" weight="semibold" tone="muted">
            Sprint
          </Text>
          <View style={styles.row}>
            <Chip label="Not in a sprint" selected={backlogOnly} onPress={() => setBacklogOnly((v) => !v)} />
          </View>
        </View>
      </BottomSheet>
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

const PLACEHOLDER_KEY = '__state__';
const PLACEHOLDER_SECTION = {
  key: PLACEHOLDER_KEY,
  label: '',
  title: '',
  color: null,
  data: [] as Task[],
};
const isPlaceholder = (section: { key?: string }): boolean => section.key === PLACEHOLDER_KEY;

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listHeader: { gap: 4, paddingBottom: 4 },
  chips: { gap: 8, paddingRight: 16 },
  countRow: { paddingVertical: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  growContent: { flexGrow: 1 },
  skeleton: { paddingTop: 8 },
  sep: { height: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  stale: { paddingVertical: 12 },
  sheetBody: { padding: 16, gap: 12 },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  row: { flexDirection: 'row' },
});
