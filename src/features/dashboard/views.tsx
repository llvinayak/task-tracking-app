import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type {
  ClientDashboard,
  DeveloperDashboard,
  PMDashboard,
  QADashboard,
  TLDashboard,
} from '@/api/dashboardApi';
import type { Task, TaskStatusConfig } from '@/api/models';
import { Badge, Button, Card, Dot, EmptyState, KpiCard, KpiGrid, ProgressBar, SectionHeader, Text } from '@/components/ui';
import { useDashboardQuery, useTaskConfig } from '@/hooks/queries';
import type { RootStackParamList } from '@/navigation/types';
import { daysFromToday, daysLeftFor, daysLeftLabel, formatDay, formatDateTime } from '@/utils/dates';
import { sortByPriority, statusLabel } from '@/utils/taskUtils';

import { useTodayKey } from '@/hooks/useToday';
import { DashboardFrame, usePollInterval } from './DashboardFrame';
import { TaskRow } from '../tasks/TaskParts';
import { QuickStart } from './QuickStart';

/** Copy for the Overdue info sheet: the dashboard (server) and the Tasks chip (device calendar) count differently. */
export const OVERDUE_INFO =
  'This count comes from the server and includes tasks due today. The Overdue filter on Tasks only counts tasks due before today, so the two numbers can differ.';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Opens Task Detail from any dashboard row. */
function useOpenTask() {
  const nav = useNavigation<Nav>();
  return useCallback((task: Task) => nav.navigate('TaskDetail', { taskId: task.id }), [nav]);
}

function TaskSection({
  title,
  hint,
  tasks,
  empty,
  config,
  trailing,
  limit,
  action,
}: {
  title: string;
  hint?: string;
  tasks: Task[];
  empty: string;
  config: readonly TaskStatusConfig[] | undefined;
  trailing?: (t: Task) => string | undefined;
  limit?: number;
  /** Per-row control beside the row (quick Start). */
  action?: (t: Task) => React.ReactNode;
}) {
  const open = useOpenTask();
  // Long sections show `limit` rows and expand IN PLACE (UI state only; the data is untouched).
  const [expanded, setExpanded] = useState(false);
  const shown = limit && !expanded ? tasks.slice(0, limit) : tasks;
  return (
    <View>
      <SectionHeader title={title} count={tasks.length} {...(hint ? { hint } : {})} />
      <Card padded={false} style={styles.listCard}>
        {shown.length === 0 ? (
          <Text tone="subtle" size="sm" style={styles.emptyText}>
            {empty}
          </Text>
        ) : (
          shown.map((t) => {
            const tr = trailing?.(t);
            return <TaskRow key={t.id} task={t} config={config} onPress={open} {...(tr ? { trailing: tr } : {})} {...(action ? { action: action(t) } : {})} />;
          })
        )}
      </Card>
      {limit && tasks.length > limit ? (
        <Button
          label={expanded ? 'Show fewer' : `Show all ${tasks.length}`}
          variant="ghost"
          size="compact"
          fullWidth={false}
          onPress={() => setExpanded((v) => !v)}
        />
      ) : null}
    </View>
  );
}

/** "Xd left" / "Xd overdue" from the end date on the device calendar (server clamps at 0). */
function DaysLeftBadge({ endDate, serverDaysLeft }: { endDate: string | null; serverDaysLeft: number | null }) {
  useTodayKey();
  const days = daysLeftFor(endDate, serverDaysLeft);
  if (days === null) return null;
  const l = daysLeftLabel(days);
  return <Badge label={l.text} tone={l.tone} />;
}

/** Days past the due date (else start date), as in the web "Old Pending" list. */
export function lateDays(t: Task): number | null {
  const d = daysFromToday(t.due_date ?? t.start_date);
  return d === null ? null : Math.max(0, -d);
}

/* ── Developer ───────────────────────────────────────────────────────────── */

/**
 * Server KPIs (overdue, today, old pending) use the SERVER's local timezone and
 * count tasks due today as overdue, so they can disagree with the Tasks list
 * chips (device calendar, due today is not overdue). Both are shown as-is.
 */
export function DeveloperView() {
  const poll = usePollInterval(true);
  const q = useDashboardQuery('developer', { poll });
  const { config } = useTaskConfig();
  return (
    <DashboardFrame query={q}>
      {(d: DeveloperDashboard) => (
        <>
          <TaskSection
            title="Today's focus"
            hint="In progress and pending for today, by priority"
            tasks={sortByPriority(d.todayTasks)}
            empty="Nothing urgent today."
            config={config}
            limit={5}
            action={(t) => <QuickStart task={t} />}
          />
          <TaskSection title="Needs attention" hint="Failed QA or reopened" tasks={d.problemTasks} empty="No failed or reopened tasks." config={config} />
          <KpiGrid>
            <KpiCard dense label="Active tasks" value={d.stats.activeTasks} />
            <KpiCard dense label="Completed today" value={d.stats.completedToday} tone={d.stats.completedToday > 0 ? 'success' : 'default'} />
            <KpiCard dense label="Overdue" value={d.stats.overdueTasks} tone={d.stats.overdueTasks > 0 ? 'danger' : 'success'} info={OVERDUE_INFO} />
            <KpiCard dense label="Old pending" value={d.oldPendingTasks.length} tone={d.oldPendingTasks.length > 0 ? 'warning' : 'success'} />
          </KpiGrid>
          <TaskSection
            title="Old pending"
            hint="Not started and past their start or deadline"
            tasks={d.oldPendingTasks}
            empty="No overdue pending tasks."
            config={config}
            trailing={(t) => {
              const n = lateDays(t);
              return n === null ? undefined : `${n}d late`;
            }}
          />
          <TaskSection title="Next 7 days" tasks={d.upcomingTasks} empty="No upcoming deadlines." config={config} />
        </>
      )}
    </DashboardFrame>
  );
}

/* ── QA ──────────────────────────────────────────────────────────────────── */

export function QAView() {
  const poll = usePollInterval(true);
  const q = useDashboardQuery('qa', { poll });
  const { config } = useTaskConfig();
  return (
    <DashboardFrame query={q}>
      {(d: QADashboard) => (
        <>
          <TaskSection title="Ready for QA" tasks={d.myReadyForQA} empty="Nothing waiting for you." config={config} />
          <TaskSection title="Needs retest" hint="Failed or reopened" tasks={[...d.myFailed, ...d.myReopened]} empty="Nothing to retest." config={config} />
          <KpiGrid>
            <KpiCard dense label="Active tasks" value={d.stats.activeTasks} />
            <KpiCard dense label="Passed" value={d.stats.passedTasks} tone={d.stats.passedTasks > 0 ? 'success' : 'default'} />
            <KpiCard dense label="Needs retest" value={d.stats.needsRetest} tone={d.stats.needsRetest > 0 ? 'warning' : 'success'} />
          </KpiGrid>
          <TaskSection title="Unassigned in QA" hint="Suggested" tasks={d.unassigned} empty="No unassigned tasks." config={config} limit={8} />
        </>
      )}
    </DashboardFrame>
  );
}

/* ── Tech lead / team health ─────────────────────────────────────────────── */

export function TechLeadView({ teamHealth = false }: { teamHealth?: boolean }) {
  const q = useDashboardQuery('techLead');
  const { config } = useTaskConfig();
  return (
    <DashboardFrame query={q}>
      {(d: TLDashboard) => {
        const k = d.kpis;
        if (d.projectIds.length === 0) {
          return (
            <EmptyState
              title="No team data yet"
              message={
                teamHealth
                  ? 'Team Health only covers projects you are a member of, and you are not a member of any project yet.'
                  : 'This view only covers projects you are a member of, and you are not a member of any project yet.'
              }
            />
          );
        }
        const queueByStatus = d.qaQueue.reduce<Record<string, number>>((acc, t) => {
          acc[t.status] = (acc[t.status] ?? 0) + 1;
          return acc;
        }, {});
        return (
          <>
            <KpiGrid>
              <KpiCard dense label="In progress" value={k.inProgress} />
              <KpiCard dense label="Dev done" value={k.devDone} />
              <KpiCard dense label="Blocked" value={k.blockedCount} tone={k.blockedCount > 0 ? 'danger' : 'success'} />
              <KpiCard dense label="At risk" value={k.atRiskCount} tone={k.atRiskCount > 0 ? 'warning' : 'success'} />
              <KpiCard dense label="Unassigned" value={k.unassignedCount} tone={k.unassignedCount > 0 ? 'warning' : 'default'} />
              <KpiCard dense label="Done this week" value={k.completedThisWeek} tone={k.completedThisWeek > 0 ? 'success' : 'default'} />
              <KpiCard dense label="Done last week" value={k.completedLastWeek} />
            </KpiGrid>

            <TaskSection
              title="Blocked and at risk"
              tasks={d.blockedTasks}
              empty="Nothing is blocked."
              config={config}
              limit={8}
            />
            {d.blockedTasks.slice(0, 8).some((t) => t.blocker_description) ? (
              <Card style={styles.blockers}>
                <Text size="xs" tone="subtle" weight="semibold">
                  BLOCKER NOTES
                </Text>
                {d.blockedTasks
                  .slice(0, 8)
                  .filter((t) => t.blocker_description)
                  .map((t) => (
                    <Text key={t.id} size="sm">
                      {t.title}: {t.blocker_description}
                    </Text>
                  ))}
              </Card>
            ) : null}

            <TaskSection
              title="Overdue"
              tasks={d.overdueTasks}
              empty="Nothing is overdue."
              config={config}
              trailing={(t) => {
                const n = lateDays(t);
                return n === null ? undefined : `Overdue by ${n}d`;
              }}
            />

            <SectionHeader title="Sprint health" count={d.sprintHealth.length} />
            {d.sprintHealth.length === 0 ? (
              <Text tone="subtle" size="sm">
                No active sprints.
              </Text>
            ) : (
              d.sprintHealth.map((s, i) => (
                <Card key={s.id ?? `${s.name}-${i}`} style={styles.cardGap}>
                  <View style={styles.between}>
                    <Text weight="semibold" style={styles.flex1}>
                      {s.name}
                    </Text>
                    <DaysLeftBadge endDate={s.end_date} serverDaysLeft={s.daysLeft} />
                  </View>
                  <ProgressBar pct={s.pctComplete} label={`${s.name} progress`} />
                  <Text size="xs" tone="muted">
                    {s.pctComplete}% · {s.passed} passed · {s.inProgress} in progress · {s.inQA} in QA · {s.total} total
                  </Text>
                </Card>
              ))
            )}

            <SectionHeader title="QA queue" count={d.qaQueue.length} />
            <Card style={styles.cardGap}>
              {d.qaQueue.length === 0 ? (
                <Text tone="subtle" size="sm">
                  Nothing is waiting for QA.
                </Text>
              ) : (
                Object.entries(queueByStatus).map(([status, n]) => (
                  <View key={status} style={styles.between}>
                    <Text>{statusLabel(config, status)}</Text>
                    <Text weight="semibold">{n}</Text>
                  </View>
                ))
              )}
            </Card>
          </>
        );
      }}
    </DashboardFrame>
  );
}

/* ── Project manager ─────────────────────────────────────────────────────── */

export function ProjectManagerView() {
  const q = useDashboardQuery('projectManager');
  const { config } = useTaskConfig();
  return (
    <DashboardFrame query={q}>
      {(d: PMDashboard) => (
        <>
          <KpiGrid>
            <KpiCard label="Total tasks" value={d.totalTasks} />
            <KpiCard label="Completed" value={d.completedTasks} tone={d.completedTasks > 0 ? 'success' : 'default'} />
            <KpiCard label="Overdue" value={d.overdueTasks} tone={d.overdueTasks > 0 ? 'danger' : 'success'} />
            <KpiCard label="Open tickets" value={d.openTickets} tone={d.openTickets > 0 ? 'warning' : 'success'} />
          </KpiGrid>

          <SectionHeader title="Active sprints" count={d.sprintOverview.length} />
          {d.sprintOverview.length === 0 ? (
            <Text tone="subtle" size="sm">
              No active sprints.
            </Text>
          ) : (
            d.sprintOverview.map((s) => (
              <Card key={s.id} style={[styles.cardGap, styles.gapBelow]}>
                <View style={styles.between}>
                  <View style={styles.flex1}>
                    <Text weight="semibold">{s.name}</Text>
                    {s.projectName ? (
                      <Text size="xs" tone="subtle">
                        {s.projectName}
                      </Text>
                    ) : null}
                  </View>
                  <DaysLeftBadge endDate={s.end_date} serverDaysLeft={s.daysLeft} />
                </View>
                <ProgressBar pct={s.progress} label={`${s.name} progress`} />
                <Text size="xs" tone="muted">
                  {s.doneTasks}/{s.totalTasks} done{s.blockedTasks > 0 ? ` · ${s.blockedTasks} blocked` : ''}
                </Text>
              </Card>
            ))
          )}

          <SectionHeader title="Release progress" count={d.releases.length} />
          {d.releases.length === 0 ? (
            <Text tone="subtle" size="sm">
              No releases.
            </Text>
          ) : (
            d.releases.map((r) => (
              <Card key={r.id} style={[styles.cardGap, styles.gapBelow]}>
                <View style={styles.between}>
                  <Text weight="semibold" style={styles.flex1}>
                    {r.name}
                    {r.version ? ` v${r.version}` : ''}
                  </Text>
                  {r.status ? <Badge label={r.status.replace(/_/g, ' ')} tone="info" /> : null}
                </View>
                <ProgressBar pct={r.progress} label={`${r.name} progress`} />
                <Text size="xs" tone="muted">
                  {r.progress}%{r.release_date ? ` · ${formatDay(r.release_date)}` : ''}
                </Text>
              </Card>
            ))
          )}

          <SectionHeader title="Overloaded people" count={d.overloadedUsers.length} />
          <Card style={styles.cardGap}>
            {d.overloadedUsers.length === 0 ? (
              <Text tone="subtle" size="sm">
                No one is overloaded.
              </Text>
            ) : (
              d.overloadedUsers.map((u) => (
                <View key={u.id} style={styles.between}>
                  <Text>{u.name}</Text>
                  {u.roleName ? (
                    <Text size="xs" tone="subtle">
                      {u.roleName}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </Card>

          <SectionHeader title="Tasks by status" />
          <Card style={styles.cardGap}>
            {d.tasksByStatus.length === 0 ? (
              <Text tone="subtle" size="sm">
                No tasks yet.
              </Text>
            ) : (
              d.tasksByStatus.map((s) => (
                <View key={s.status} style={styles.between}>
                  <View style={styles.statusLabel}>
                    <Dot color={config?.find((c) => c.key === s.status)?.color} />
                    <Text>{statusLabel(config, s.status)}</Text>
                  </View>
                  <Text weight="semibold">{s.count}</Text>
                </View>
              ))
            )}
          </Card>

          {d.recentActivity.length > 0 ? (
            <>
              <SectionHeader title="Recent activity" />
              <Card style={styles.cardGap}>
                {d.recentActivity.slice(0, 8).map((a) => (
                  <View key={a.id}>
                    <Text size="sm">
                      {a.actor ? `${a.actor}: ` : ''}
                      {a.text}
                    </Text>
                    {a.at ? (
                      <Text size="2xs" tone="subtle">
                        {formatDateTime(a.at)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </DashboardFrame>
  );
}

/* ── Client (read-only, not tappable) ────────────────────────────────────── */

/**
 * KNOWN API ISSUE (do not paper over): GET /dashboard/client-stats likely answers
 * 500 for clients that have projects (wrong sort column on the server). The
 * error is shown with a retry; the app never fakes a success.
 */
export function ClientView() {
  const q = useDashboardQuery('client');
  return (
    <DashboardFrame query={q}>
      {(d: ClientDashboard) => (
        <>
          <KpiGrid>
            <KpiCard label="Total projects" value={d.summary.totalProjects} />
            <KpiCard label="Active projects" value={d.summary.activeProjects} tone={d.summary.activeProjects > 0 ? 'success' : 'default'} />
            <KpiCard label="Overall completion" value={`${d.summary.completionPct}%`} />
            <KpiCard label="Open issues" value={d.summary.openTickets} tone={d.summary.openTickets > 0 ? 'danger' : 'success'} />
          </KpiGrid>
          <SectionHeader title="Projects" count={d.projects.length} />
          {d.projects.length === 0 ? (
            <EmptyState title="No projects yet" message="Your projects will appear here once they are created." />
          ) : (
            d.projects.map((p) => {
              const left = p.activeSprint?.end_date ? daysFromToday(p.activeSprint.end_date) : null;
              return (
                <Card key={p.id} style={[styles.cardGap, styles.gapBelow]} accessible>
                  <View style={styles.between}>
                    <View style={[styles.statusLabel, styles.flex1]}>
                      <Dot color={p.color} size={10} />
                      <Text weight="semibold" style={styles.flex1}>
                        {p.name}
                      </Text>
                    </View>
                    {p.status ? <Badge label={p.status.replace(/_/g, ' ')} tone={p.status === 'active' ? 'success' : 'neutral'} /> : null}
                  </View>
                  <ProgressBar pct={p.completionPct} label={`${p.name} completion`} />
                  <Text size="xs" tone="muted">
                    {p.completionPct}% · {p.doneTasks}/{p.totalTasks} done
                  </Text>
                  {p.totalTasks > 0 ? (
                    <Text size="xs" tone="subtle">
                      {p.pendingTasks} pending · {p.activeTasks} in progress{p.openTickets > 0 ? ` · ${p.openTickets} issues` : ''}
                    </Text>
                  ) : (
                    <Text size="xs" tone="subtle">
                      No tasks created yet
                    </Text>
                  )}
                  {p.activeSprint ? (
                    <Text size="xs" tone="muted">
                      Sprint: {p.activeSprint.name}
                      {left !== null ? ` · ${daysLeftLabel(left).text.replace('Ends today', 'ends today')}` : ''}
                    </Text>
                  ) : null}
                </Card>
              );
            })
          )}
        </>
      )}
    </DashboardFrame>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  listCard: { paddingHorizontal: 12 },
  emptyText: { paddingVertical: 16 },
  blockers: { gap: 4, marginTop: 8 },
  cardGap: { gap: 8 },
  gapBelow: { marginBottom: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
