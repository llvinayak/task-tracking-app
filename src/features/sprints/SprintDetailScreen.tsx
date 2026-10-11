import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { sprintStatusLabel, type BurnPoint, type SprintMetrics } from '@/api/sprintsApi';
import { parseNumericId } from '@/api/ticketsApi';
import { Badge, Card, Dot, ErrorState, LoadingState, ProgressBar, Screen, StaleBanner, Text } from '@/components/ui';
import { useTaskConfig } from '@/hooks/queries';
import { useSprint, useSprintMetrics } from '@/hooks/sprints';
import type { RootStackParamList } from '@/navigation/types';
import { formatDay } from '@/utils/dates';

import { StatusChip } from '../tasks/TaskParts';
import { SprintDays } from './SprintsScreen';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${sub ? `. ${sub}` : ''}`}>
      <Text size="xl" weight="bold">
        {value}
      </Text>
      <Text size="xs" tone="muted" weight="medium">
        {label}
      </Text>
      {sub ? (
        <Text size="2xs" tone="subtle">
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

const hours = (n: number) => `${Math.round(n * 10) / 10}h`;

/** Metric tiles from GET /sprints/:id/metrics. Nulls (no baseline, not closed) read as "n/a". */
export function MetricTiles({ m }: { m: SprintMetrics }) {
  return (
    <View style={styles.tiles} testID="sprint-metrics">
      <Tile label="Progress" value={`${m.progress.completion_pct}%`} sub={m.progress.commitment_met_pct !== null ? `${m.progress.commitment_met_pct}% of commitment met` : undefined} />
      <Tile
        label="Committed"
        value={m.committed ? `${m.committed.tasks} tasks` : 'n/a'}
        sub={m.committed ? hours(m.committed.estimated_hours) : 'No baseline yet'}
      />
      <Tile label="Delivered" value={`${m.delivered.tasks} tasks`} sub={hours(m.delivered.estimated_hours)} />
      <Tile
        label="Scope"
        value={`${m.scope.tasks} tasks`}
        sub={[
          hours(m.scope.estimated_hours),
          m.scope.change_tasks !== null ? `${m.scope.change_tasks >= 0 ? '+' : ''}${m.scope.change_tasks} since commit` : null,
          m.scope.blocked_tasks > 0 ? `${m.scope.blocked_tasks} blocked` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <Tile
        label="Effort"
        value={`${hours(m.effort.logged_hours)} logged`}
        sub={`${hours(m.effort.estimated_hours)} estimated${m.effort.ratio !== null ? ` · ${m.effort.ratio}x` : ''}`}
      />
      <Tile
        label="Duration"
        value={m.duration.planned_days !== null ? `${m.duration.planned_days} days` : 'n/a'}
        sub={m.duration.actual_days !== null ? `${m.duration.actual_days} days actual` : undefined}
      />
    </View>
  );
}

/** Simple text/bar burndown: remaining hours per snapshot (no chart library). */
export function Burndown({ points, ideal }: { points: BurnPoint[]; ideal: SprintMetrics['ideal'] }) {
  if (points.length === 0) {
    return (
      <Text size="sm" tone="muted" testID="burndown-empty">
        No burndown snapshots yet.
      </Text>
    );
  }
  const shown = points.slice(-14);
  const max = Math.max(1, ...shown.map((p) => Math.max(p.remaining_hours, p.total_hours)));
  const idealByDate = new Map(ideal.filter((i) => i.date).map((i) => [i.date as string, i.remaining_hours]));
  return (
    <View style={styles.burn} testID="burndown">
      {shown.map((p) => {
        const id = idealByDate.get(p.date);
        return (
          <View key={p.date} style={styles.burnRow} accessible accessibilityLabel={`${formatDay(p.date)}: ${hours(p.remaining_hours)} remaining${id !== undefined ? `, ideal ${hours(id)}` : ''}`}>
            <Text size="2xs" tone="muted" style={styles.burnDate}>
              {formatDay(p.date)}
            </Text>
            <View style={styles.flex1}>
              <ProgressBar pct={(p.remaining_hours / max) * 100} label={`${formatDay(p.date)} remaining`} />
            </View>
            <Text size="2xs" weight="semibold" style={styles.burnNum}>
              {hours(p.remaining_hours)}
              {id !== undefined ? ` / ${hours(id)}` : ''}
            </Text>
          </View>
        );
      })}
      <Text size="2xs" tone="subtle">
        Remaining hours{ideal.length ? ' / ideal' : ''}, last {shown.length} snapshots.
      </Text>
    </View>
  );
}

export function SprintDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SprintDetail'>>();
  const id = parseNumericId(params.sprintId);
  const sprint = useSprint(id ?? 0);
  const metrics = useSprintMetrics(id ?? 0);
  const { config } = useTaskConfig();

  if (id === null) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <ErrorState title="Couldn't open this sprint" message="That sprint link is not valid." secondary={{ label: 'Go back', onPress: () => nav.goBack() }} />
      </Screen>
    );
  }
  if (sprint.isLoading) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <LoadingState label="Loading sprint..." />
      </Screen>
    );
  }
  if (!sprint.data) {
    // 403 / 404 messages are the server's own.
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <ErrorState
          title="Couldn't open this sprint"
          message={getErrorMessage(sprint.error)}
          onRetry={() => void sprint.refetch()}
          secondary={{ label: 'Go back', onPress: () => nav.goBack() }}
        />
      </Screen>
    );
  }
  const s = sprint.data;
  return (
    <Screen scroll edges={['left', 'right', 'bottom']} onRefresh={() => { void sprint.refetch(); void metrics.refetch(); }} refreshing={sprint.isRefetching}>
      {sprint.isError ? <StaleBanner message={getErrorMessage(sprint.error)} /> : null}
      <View style={styles.head}>
        <View style={styles.tags}>
          <Badge label={sprintStatusLabel(s.status)} tone={s.status === 'active' ? 'success' : s.status === 'completed' ? 'neutral' : 'info'} />
          <SprintDays sprint={s} />
        </View>
        <Text size="2xl" weight="bold" accessibilityRole="header">
          {s.name}
        </Text>
        <View style={styles.tags}>
          {s.project ? <Dot color={s.project.color} size={8} /> : null}
          <Text size="sm" tone="muted">
            {[s.project?.name, [s.start_date, s.end_date].map((d) => (d ? formatDay(d) : null)).filter(Boolean).join(' to ')].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {s.goal ? <Text>{s.goal}</Text> : null}
        <ProgressBar pct={s.completionPct} label="Sprint progress" />
        <Text size="xs" tone="muted">
          {s.completionPct}% · {s.completedCount}/{s.taskCount} tasks done
          {s.blockedCount > 0 ? ` · ${s.blockedCount} blocked` : ''}
        </Text>
      </View>

      <Text size="lg" weight="semibold" accessibilityRole="header" style={styles.h}>
        Metrics
      </Text>
      {metrics.isLoading ? <LoadingState label="Loading metrics..." /> : null}
      {metrics.isError && !metrics.data ? <ErrorState message={getErrorMessage(metrics.error)} onRetry={() => void metrics.refetch()} /> : null}
      {metrics.isError && metrics.data ? <StaleBanner message={getErrorMessage(metrics.error)} testID="metrics-stale" /> : null}
      {metrics.data ? (
        <>
          <MetricTiles m={metrics.data} />
          <Text size="lg" weight="semibold" accessibilityRole="header" style={styles.h}>
            Burndown
          </Text>
          <Burndown points={metrics.data.burndown} ideal={metrics.data.ideal} />
        </>
      ) : null}

      {s.subSprints.length > 0 ? (
        <>
          <Text size="lg" weight="semibold" accessibilityRole="header" style={styles.h}>
            Release sprints
          </Text>
          {s.subSprints.map((x) => (
            <Card key={x.id} style={styles.sub} testID={`sub-sprint-${x.id}`}>
              <View style={styles.between}>
                <Text weight="medium" style={styles.flex1}>
                  {x.name}
                </Text>
                <Badge label={sprintStatusLabel(x.status)} tone={x.status === 'active' ? 'success' : x.status === 'completed' ? 'neutral' : 'info'} />
              </View>
              <ProgressBar pct={x.completionPct} label={`${x.name} progress`} />
              <Text size="xs" tone="muted">
                {x.completedCount}/{x.taskCount} tasks done
              </Text>
            </Card>
          ))}
        </>
      ) : null}

      <Text size="lg" weight="semibold" accessibilityRole="header" style={styles.h}>
        Tasks ({s.tasks.length})
      </Text>
      {s.tasks.length === 0 ? (
        <Text tone="muted" size="sm">
          No tasks in this sprint.
        </Text>
      ) : (
        s.tasks.map((x) => (
          <Pressable
            key={x.id}
            onPress={() => nav.navigate('TaskDetail', { taskId: x.id })}
            accessibilityRole="button"
            accessibilityLabel={`${x.title}. ${x.status.replace(/_/g, ' ')}${x.is_blocked ? '. Blocked' : ''}`}
            style={[styles.taskRow]}
            testID={`sprint-task-${x.id}`}
          >
            <Text weight="medium" numberOfLines={2}>
              {x.title}
            </Text>
            <View style={styles.tags}>
              <StatusChip status={x.status} config={config} />
              {x.is_blocked ? <Badge label="Blocked" tone="danger" /> : null}
              {x.devOwnerName ? (
                <Text size="2xs" tone="subtle">
                  Dev: {x.devOwnerName}
                </Text>
              ) : null}
              {x.qaOwnerName ? (
                <Text size="2xs" tone="subtle">
                  QA: {x.qaOwnerName}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}
      <View style={styles.bottom} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  head: { gap: 8, marginBottom: 8 },
  h: { marginTop: 18, marginBottom: 8 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', gap: 2 },
  burn: { gap: 8 },
  burnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  burnDate: { width: 56 },
  burnNum: { width: 84, textAlign: 'right' },
  sub: { gap: 6, marginBottom: 8 },
  taskRow: { minHeight: 44, paddingVertical: 8, gap: 4 },
  bottom: { height: 24 },
});
