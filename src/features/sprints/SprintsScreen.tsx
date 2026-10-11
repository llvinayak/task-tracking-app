import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { groupSprintsByStatus, type Sprint } from '@/api/sprintsApi';
import { Badge, Card, Dot, EmptyState, ErrorState, LoadingState, ProgressBar, Screen, StaleBanner, Text } from '@/components/ui';
import { useSprints } from '@/hooks/sprints';
import { useTodayKey } from '@/hooks/useToday';
import type { RootStackParamList } from '@/navigation/types';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';
import { daysLeftFor, daysLeftLabel, formatDay } from '@/utils/dates';

import { ProjectButton, ProjectPickerSheet } from '../projects/ProjectPicker';

/** "3d left" / "2d overdue" from end_date on the device calendar (server clamping is ignored). */
export function SprintDays({ sprint }: { sprint: Pick<Sprint, 'end_date' | 'status'> }) {
  useTodayKey();
  if (sprint.status === 'completed') return null;
  const d = daysLeftFor(sprint.end_date);
  if (d === null) return null;
  const l = daysLeftLabel(d);
  return <Badge label={l.text} tone={l.tone} />;
}

export function SprintCard({ sprint, onPress }: { sprint: Sprint; onPress: (s: Sprint) => void }) {
  const t = useTheme();
  const dates = [sprint.start_date, sprint.end_date].map((d) => (d ? formatDay(d) : null)).filter(Boolean).join(' to ');
  return (
    <Card padded={false} testID={`sprint-${sprint.id}`}>
      <Pressable
        onPress={() => onPress(sprint)}
        accessibilityRole="button"
        accessibilityLabel={`${sprint.name}. ${sprint.status}. ${sprint.completionPct}% complete. ${sprint.completedCount} of ${sprint.taskCount} tasks done`}
        style={[styles.card, { minHeight: t.minTouch }]}
      >
        <View style={styles.between}>
          <Text weight="semibold" size="lg" style={styles.flex1} numberOfLines={2}>
            {sprint.name}
          </Text>
          <SprintDays sprint={sprint} />
        </View>
        <View style={styles.tags}>
          {sprint.project ? <Dot color={sprint.project.color} size={8} /> : null}
          <Text size="xs" tone="muted" numberOfLines={1} style={styles.flex1}>
            {[sprint.project?.name, dates].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <ProgressBar pct={sprint.completionPct} label={`${sprint.name} progress`} />
        <Text size="xs" tone="muted">
          {sprint.completionPct}% · {sprint.completedCount}/{sprint.taskCount} tasks done
          {sprint.blockedCount > 0 ? ` · ${sprint.blockedCount} blocked` : ''}
        </Text>
      </Pressable>
    </Card>
  );
}

/** Read-only sprint list, grouped by status (values come from the data). */
export function SprintsScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const selected = useProjectStore((s) => s.selected);
  const [pickerOpen, setPickerOpen] = useState(false);
  const query = useSprints({ projectId: selected?.id ?? null });
  const groups = groupSprintsByStatus(query.data ?? []);
  const open = (s: Sprint) => nav.navigate('SprintDetail', { sprintId: s.id });

  let body: React.ReactNode;
  if (query.isLoading) body = <LoadingState label="Loading sprints..." />;
  else if (query.isError && !query.data) body = <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  else if (groups.length === 0) {
    body = <EmptyState title="No sprints" message={selected ? `No sprints for ${selected.name}.` : 'Sprints will appear here.'} />;
  } else {
    body = (
      <SectionList
        sections={groups.map((g) => ({ ...g, title: g.label }))}
        keyExtractor={(s) => String(s.id)}
        stickySectionHeadersEnabled
        initialNumToRender={14}
        windowSize={7}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={t.colors.brand[500]} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: t.colors.app }]} accessibilityRole="header">
            <Text weight="semibold">{section.label}</Text>
            <Text size="sm" tone="subtle">
              {section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item }) => <SprintCard sprint={item} onPress={open} />}
      />
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      <View style={styles.header}>
        <Text size="2xl" weight="bold" accessibilityRole="header">
          Sprints
        </Text>
        <ProjectButton onPress={() => setPickerOpen(true)} />
        {query.isError && query.data ? <StaleBanner message={getErrorMessage(query.error)} /> : null}
      </View>
      <View style={styles.flex1}>{body}</View>
      <ProjectPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  sep: { height: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  card: { padding: 12, gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
