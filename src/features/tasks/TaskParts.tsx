import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Task, TaskStatusConfig } from '@/api/models';
import { Dot, FlagLine, StatusBadge, Text } from '@/components/ui';
import { useTodayKey } from '@/hooks/useToday';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDay } from '@/utils/dates';
import { PRIORITY_TONE, dueDisplay, priorityLabel, statusLabel } from '@/utils/taskUtils';

/** Kept name; the shared StatusBadge (dot + text) does the drawing. */
export function StatusChip({ status, config }: { status: string; config: readonly TaskStatusConfig[] | undefined }) {
  return <StatusBadge label={statusLabel(config, status)} color={config?.find((s) => s.key === status)?.color} />;
}

export function PriorityDot({ priority }: { priority: string }) {
  const t = useTheme();
  const tone = PRIORITY_TONE[priority] ?? 'neutral';
  return <Dot color={t.colors[tone === 'brand' ? 'neutral' : tone].base} size={10} />;
}

/**
 * Compact row used by dashboards. Tap opens Task Detail. An optional `action` (e.g. quick
 * Start) is a SIBLING of the pressable area, never nested inside it. The priority is a
 * visible word in the meta line (not only the dot).
 */
export function TaskRow({
  task,
  config,
  onPress,
  trailing,
  action,
}: {
  task: Task;
  config: readonly TaskStatusConfig[] | undefined;
  onPress: (task: Task) => void;
  /** Extra right-aligned text, e.g. "3d late". */
  trailing?: string;
  action?: React.ReactNode;
}) {
  const t = useTheme();
  useTodayKey(); // re-render at midnight / resume so due text and "Nd late" stay correct
  const due = dueDisplay(task, formatDay);
  const meta = [priorityLabel(task.priority), task.project?.name, due ? due.text : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.row, { borderBottomColor: t.colors.divider }]}>
      <Pressable
        onPress={() => onPress(task)}
        accessibilityRole="button"
        accessibilityLabel={[
          task.title,
          `${priorityLabel(task.priority)} priority`,
          statusLabel(config, task.status),
          task.is_blocked ? 'Blocked' : null,
          task.reopen_count > 0 ? `Reopened ${task.reopen_count}x` : null,
          task.project ? task.project.name : null,
          due ? due.text : null,
          trailing ?? null,
        ]
          .filter(Boolean)
          .join('. ')}
        style={({ pressed }) => [styles.main, { minHeight: t.minTouch, backgroundColor: pressed ? t.colors.hover : t.colors.transparent }]}
      >
        <PriorityDot priority={task.priority} />
        <View style={styles.rowBody}>
          <Text weight="medium" numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.rowMeta}>
            {task.project ? <Dot color={task.project.color} size={6} /> : null}
            {meta ? (
              <Text size="xs" tone="muted" numberOfLines={1} style={styles.flex1}>
                {meta}
              </Text>
            ) : null}
          </View>
          <View style={styles.tags}>
            <StatusChip status={task.status} config={config} />
            {task.is_blocked ? <FlagLine label="Blocked" /> : null}
            {task.reopen_count > 0 ? (
              <Text size="xs" weight="semibold" tone="warning">
                Reopened {task.reopen_count}x
              </Text>
            ) : null}
          </View>
        </View>
        {trailing ? (
          <Text size="xs" weight="bold" tone="danger">
            {trailing}
          </Text>
        ) : null}
      </Pressable>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8 },
  rowBody: { flex: 1, gap: 4 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  flex1: { flex: 1 },
});
