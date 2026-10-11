import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Platform, RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { groupSprintsByStatus, type Sprint } from '@/api/sprintsApi';
import { Badge, Dot, EmptyState, EntityCard, ErrorState, ModuleHeader, ProgressBar, Screen, SkeletonCards, StaleBanner, Text } from '@/components/ui';
import { useSprints } from '@/hooks/sprints';
import { useScreenBottomPadding } from '@/hooks/useScreenBottomPadding';
import { useTodayKey } from '@/hooks/useToday';
import type { RootStackParamList } from '@/navigation/types';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';
import { daysLeftFor, daysLeftLabel, formatDay } from '@/utils/dates';

import { ProjectButton, ProjectPickerSheet } from '../projects/ProjectPicker';

/** Stable (not an inline arrow) so the list does not rebuild its separators on every render. */
const Separator = () => <View style={styles.sep} />;

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
  const days = sprint.status === 'completed' ? null : daysLeftFor(sprint.end_date);
  const left = days === null ? null : daysLeftLabel(days).text;
  const dates = [sprint.start_date, sprint.end_date].map((d) => (d ? formatDay(d) : null)).filter(Boolean).join(' to ');
  return (
    <EntityCard
      testID={`sprint-${sprint.id}`}
      accent={sprint.status === 'active' ? 'success' : sprint.status === 'completed' ? 'neutral' : 'info'}
      title={sprint.name}
      onPress={() => onPress(sprint)}
      // Every visible fact is in the name (Label in Name for a summarised card).
      accessibilityLabel={`${sprint.name}. ${sprint.status}. ${sprint.completionPct}% complete. ${sprint.completedCount} of ${sprint.taskCount} tasks done${
        sprint.blockedCount > 0 ? `. ${sprint.blockedCount} blocked` : ''
      }${sprint.project ? `. ${sprint.project.name}` : ''}${dates ? `. ${dates}` : ''}${left ? `. ${left}` : ''}`}
      header={
        <View style={styles.between}>
          <View style={styles.tags}>
            {sprint.project ? <Dot color={sprint.project.color} size={8} /> : null}
            <Text size="xs" tone="muted" numberOfLines={1} style={styles.flex1}>
              {[sprint.project?.name, dates].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <SprintDays sprint={sprint} />
        </View>
      }
      meta={
        <View style={styles.metaStack}>
          <ProgressBar pct={sprint.completionPct} label={`${sprint.name} progress`} height={8} />
          <Text size="xs" tone="muted">
            {sprint.completionPct}% · {sprint.completedCount}/{sprint.taskCount} tasks done
            {sprint.blockedCount > 0 ? ` · ${sprint.blockedCount} blocked` : ''}
          </Text>
        </View>
      }
    />
  );
}

/** Read-only sprint list, grouped by status (values come from the data). */
export function SprintsScreen() {
  const t = useTheme();
  const listBottom = useScreenBottomPadding(32);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const selected = useProjectStore((s) => s.selected);
  const [pickerOpen, setPickerOpen] = useState(false);
  const query = useSprints({ projectId: selected?.id ?? null });
  const groups = groupSprintsByStatus(query.data ?? []);
  const open = (s: Sprint) => nav.navigate('SprintDetail', { sprintId: s.id });

  let body: React.ReactNode;
  if (query.isLoading) {
    body = (
      <View style={styles.list}>
        <SkeletonCards label="Loading sprints..." variant="sprint" count={4} />
      </View>
    );
  }
  else if (query.isError && !query.data) body = <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  else if (groups.length === 0) {
    body = <EmptyState icon="flash-outline" title="No sprints" message={selected ? `No sprints for ${selected.name}.` : 'Sprints will appear here.'} />;
  } else {
    body = (
      <SectionList removeClippedSubviews={false}
        sections={groups.map((g) => ({ ...g, title: g.label }))}
        keyExtractor={(s) => String(s.id)}
        stickySectionHeadersEnabled={Platform.OS === 'ios'}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={7}
        contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
        ItemSeparatorComponent={Separator}
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
    <Screen
      edges={['left', 'right']}
      padded={false}
      header={<ModuleHeader title="Sprints" trailing={<ProjectButton onPress={() => setPickerOpen(true)} />} />}
    >
      {query.isError && query.data ? (
        <View style={styles.header}>
          <StaleBanner message={getErrorMessage(query.error)} />
        </View>
      ) : null}
      <View style={styles.flex1}>{body}</View>
      <ProjectPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  sep: { height: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  metaStack: { gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
