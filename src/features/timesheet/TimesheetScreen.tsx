import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DAY_TARGET_MINUTES } from '@/config/constants';
import { getErrorMessage } from '@/api/errors';
import type { TimesheetEntry } from '@/api/timesheetApi';
import { Badge, Banner, Button, Card, Dot, EmptyState, ErrorState, LoadingState, Screen, StaleBanner, Text } from '@/components/ui';
import { useTimesheet } from '@/hooks/timesheet';
import { useTodayKey } from '@/hooks/useToday';
import { useTheme } from '@/theme/ThemeProvider';
import { utcMsToWall, weekDates, weekRange, weekStart } from '@/utils/companyTime';
import { addDaysToDateString, formatDateLabel } from '@/utils/dates';
import { formatDuration } from '@/utils/time';

import { TimeEntrySheet } from './TimeEntrySheet';

function clock(iso: string | null, tz: string | null): string {
  if (!iso) return '--:--';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '--:--';
  const w = tz ? utcMsToWall(ms, tz) : null;
  if (w) return w.time;
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Week view: Monday to Sunday, in the company timezone the server reports.
 *
 * ACCESS DECISION (no menu gate): Timesheet is NOT gated by a '/timesheet' menu.
 * That menu was removed by an old migration, and the server only requires a signed-in
 * user for these routes and returns the caller's own data. So the entry points (My
 * Day button, Task Detail link) are shown to everyone signed in; the My Day button
 * itself stays behind the '/my-day' grant because it lives on that screen.
 */
export function TimesheetScreen() {
  const t = useTheme();
  const deviceToday = useTodayKey();
  /** null = "this week", which follows the clock (and rolls over at midnight); set only when the user navigates. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ entry: TimesheetEntry | null } | null>(null);

  // The company zone is learned from the response; until then (and for the first request) the device calendar is used.
  const [knownTz, setKnownTz] = useState<string | null>(null);
  const companyToday = knownTz ? (utcMsToWall(Date.now(), knownTz)?.date ?? null) : null;
  // Recomputed every render; deviceToday re-renders us at the device's midnight.
  const today = companyToday ?? deviceToday;
  const effective = anchor ?? today;
  const { from, to } = weekRange(effective);
  const query = useTimesheet(from, to);
  const data = query.data;
  // Previous-week data stays while the next week loads (placeholderData): never show it as the new week's.
  const placeholder = query.isPlaceholderData;
  const tz = data?.timezone ?? knownTz;
  if (data?.timezone && data.timezone !== knownTz) setKnownTz(data.timezone);

  const isCurrentOrFuture = to >= today;
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
  const days = weekDates(effective);

  const openAdd = () => setSheet({ entry: null });

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <View style={styles.head}>
        <Text size="lg" weight="semibold" testID="week-label" accessibilityRole="header">
          {formatDateLabel(from)} to {formatDateLabel(to)}
        </Text>
        <View style={styles.nav}>
          <Button label="Previous week" variant="secondary" fullWidth={false} onPress={() => setAnchor(addDaysToDateString(from, -7))} />
          <Button
            label="Next week"
            variant="secondary"
            fullWidth={false}
            disabled={isCurrentOrFuture}
            onPress={() => setAnchor(addDaysToDateString(from, 7))}
          />
          <Button label="This week" variant="secondary" fullWidth={false} disabled={weekStart(today) === from && anchor === null} onPress={() => setAnchor(null)} />
        </View>
        <Button label="Add time" onPress={openAdd} disabled={!tz} />
        {!tz && !query.isError ? (
          <Text size="xs" tone="muted" testID="tz-wait">
            Add time is available once the company timezone is loaded.
          </Text>
        ) : null}
      </View>

      {query.isError && data ? <StaleBanner message={getErrorMessage(query.error)} /> : null}
      {query.isLoading || (placeholder && query.isFetching) ? <LoadingState label="Loading timesheet..." /> : null}
      {query.isError && !data ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}

      {data && !placeholder ? (
        <>
          <Card style={styles.gap} testID="week-total">
            <Text size="xs" tone="subtle" weight="semibold">
              WEEK TOTAL
            </Text>
            <Text size="2xl" weight="bold">
              {formatDuration(data.totalMinutes)}
            </Text>
            {data.needsReview > 0 ? (
              <Banner
                tone="warning"
                testID="needs-review"
                message={`${data.needsReview} auto-closed ${data.needsReview === 1 ? 'entry needs' : 'entries need'} confirming. Do it from My Day or by editing the entry.`}
              />
            ) : null}
            {data.byProject.map((p) => (
              <View key={p.project_id} style={styles.row} testID={`project-total-${p.project_id}`}>
                <Dot color={p.color} size={8} />
                <Text style={styles.flex1} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text weight="semibold">{formatDuration(p.minutes)}</Text>
              </View>
            ))}
          </Card>

          {days.map((date) => {
            const d = byDate.get(date);
            const minutes = d?.minutes ?? 0;
            const met = minutes >= DAY_TARGET_MINUTES;
            return (
              <View key={date} style={styles.day} testID={`day-${date}`}>
                <View style={styles.row}>
                  <Text weight="semibold" style={styles.flex1}>
                    {formatDateLabel(date)}
                    {date === today ? ' (today)' : ''}
                  </Text>
                  {/* Target state is text plus a check mark, not color alone. */}
                  <Badge label={met ? `✓ ${formatDuration(minutes)} (target met)` : `${formatDuration(minutes)} of ${formatDuration(DAY_TARGET_MINUTES)}`} tone={met ? 'success' : minutes > 0 ? 'warning' : 'neutral'} />
                </View>
                {(d?.entries ?? []).map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => setSheet({ entry: e })}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.task_title}, ${clock(e.started_at, tz)} to ${clock(e.ended_at, tz)}, ${formatDuration(e.minutes)}. ${e.source === 'manual' ? 'Manual' : 'Timer'}${e.auto_closed ? '. Auto-closed' : ''}${e.note ? `. ${e.note}` : ''}. Edit`}
                    style={[styles.entry, { minHeight: t.minTouch, borderColor: t.colors.line, borderRadius: t.radius.xl, backgroundColor: t.colors.surface }]}
                    testID={`entry-${e.id}`}
                  >
                    <View style={styles.row}>
                      <Text weight="medium" style={styles.flex1} numberOfLines={2}>
                        {e.task_title}
                      </Text>
                      <Text weight="semibold">{formatDuration(e.minutes)}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text size="xs" tone="muted">
                        {clock(e.started_at, tz)} to {clock(e.ended_at, tz)}
                      </Text>
                      <Badge label={e.source === 'manual' ? 'Manual' : 'Timer'} tone="neutral" />
                      {e.auto_closed && !e.reviewed_at ? <Badge label="Auto-closed" tone="warning" /> : null}
                    </View>
                    {e.note ? (
                      <Text size="xs" tone="subtle" numberOfLines={2}>
                        {e.note}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            );
          })}

          {data.days.length === 0 ? <EmptyState title="No time this week" message="Start a timer or add time by hand." /> : null}
        </>
      ) : null}

      <TimeEntrySheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        timezone={tz}
        defaultDate={isCurrentOrFuture ? today : to}
        todayDate={today}
        entry={sheet?.entry ?? null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  head: { gap: 8, marginBottom: 12 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap: { gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  day: { gap: 8, marginBottom: 16 },
  entry: { borderWidth: 1, padding: 12, gap: 4 },
});
