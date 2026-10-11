import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Task, TaskStatusConfig } from '@/api/models';
import { Badge, Dot, Text } from '@/components/ui';
import { useTodayKey } from '@/hooks/useToday';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDay } from '@/utils/dates';
import { PRIORITY_TONE, dueLabel, priorityLabel, statusLabel } from '@/utils/taskUtils';

/** Status = colored dot (DB color) + text label, so it never relies on color alone. */
export function StatusChip({ status, config }: { status: string; config: readonly TaskStatusConfig[] | undefined }) {
  const t = useTheme();
  const color = config?.find((s) => s.key === status)?.color;
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: t.colors.subtle, borderColor: t.colors.line, borderRadius: t.radius.pill },
      ]}
    >
      <Dot color={color} />
      <Text size="2xs" weight="semibold" tone="muted">
        {statusLabel(config, status)}
      </Text>
    </View>
  );
}

export function PriorityDot({ priority }: { priority: string }) {
  const t = useTheme();
  const tone = PRIORITY_TONE[priority] ?? 'neutral';
  return <Dot color={t.colors[tone === 'brand' ? 'neutral' : tone].base} size={10} />;
}

/** Compact row used by dashboards. Tap opens Task Detail. */
export function TaskRow({
  task,
  config,
  onPress,
  trailing,
}: {
  task: Task;
  config: readonly TaskStatusConfig[] | undefined;
  onPress: (task: Task) => void;
  /** Extra right-aligned text, e.g. "3d late". */
  trailing?: string;
}) {
  const t = useTheme();
  useTodayKey(); // re-render at midnight / resume so due text and "Nd late" stay correct
  const due = dueLabel(task, false, formatDay);
  const meta = [task.project?.name, due ? `Due ${due.text}` : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => onPress(task)}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${priorityLabel(task.priority)} priority. ${statusLabel(config, task.status)}${
        task.is_blocked ? '. Blocked' : ''
      }${trailing ? `. ${trailing}` : ''}`}
      style={({ pressed }) => [
        styles.row,
        { minHeight: t.minTouch, borderBottomColor: t.colors.lineFaint, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <PriorityDot priority={task.priority} />
      <View style={styles.rowBody}>
        <Text weight="medium" numberOfLines={2}>
          {task.title}
        </Text>
        <View style={styles.rowMeta}>
          {task.project ? <Dot color={task.project.color} size={6} /> : null}
          {meta ? (
            <Text size="2xs" tone="subtle" numberOfLines={1} style={styles.flex1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <View style={styles.tags}>
          <StatusChip status={task.status} config={config} />
          {task.is_blocked ? <Badge label="Blocked" tone="danger" /> : null}
          {task.reopen_count > 0 ? <Badge label={`x${task.reopen_count}`} tone="warning" /> : null}
        </View>
      </View>
      {trailing ? (
        <Text size="xs" weight="bold" tone="danger">
          {trailing}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: 4 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  flex1: { flex: 1 },
});
