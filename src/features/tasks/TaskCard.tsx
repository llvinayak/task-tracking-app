import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Task, TaskStatusConfig } from '@/api/models';
import { Avatar, Badge, ProgressBar, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDay } from '@/utils/dates';
import {
  PRIORITY_TONE,
  TYPE_TONE,
  cardFlag,
  dueLabel,
  priorityLabel,
  statusLabel,
  taskCode,
  typeLabel,
} from '@/utils/taskUtils';

const FLAG_LABEL = { blocked: 'Blocked', qa_overdue: 'QA overdue', at_risk: 'At risk' } as const;

interface Props {
  task: Task;
  config: readonly TaskStatusConfig[] | undefined;
  /** Local day key; changing it re-renders memoized cards so due pills roll over at midnight. */
  today: string;
  /** Overdue chip active -> urgency wording on the due pill (web behavior). */
  highlightOverdue: boolean;
  canMove: boolean;
  onPress: (task: Task) => void;
  onMove: (task: Task) => void;
}

function TaskCardImpl({ task, config, highlightOverdue, canMove, onPress, onMove }: Props) {
  const t = useTheme();
  const flag = cardFlag(task);
  const priorityTone = PRIORITY_TONE[task.priority] ?? 'neutral';
  const accent =
    flag === 'blocked' || flag === 'qa_overdue'
      ? t.colors.danger.base
      : flag === 'at_risk'
        ? t.colors.warning.base
        : t.colors[priorityTone === 'brand' ? 'neutral' : priorityTone].base;
  const due = dueLabel(task, highlightOverdue, formatDay);
  const sprintLine = [task.sprint?.name, task.releaseSprint?.name].filter(Boolean).join(' · ');
  const code = taskCode(task);

  const a11y = [
    task.title,
    code,
    statusLabel(config, task.status),
    `${priorityLabel(task.priority)} priority`,
    flag ? FLAG_LABEL[flag] : null,
    due ? `Due ${due.text}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.colors.surface, borderColor: t.colors.line, borderRadius: t.radius.xl },
        t.elevation('xs'),
      ]}
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.main}>
        <Pressable
          onPress={() => onPress(task)}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityHint="Opens task details"
          style={({ pressed }) => [styles.pressArea, { minHeight: t.minTouch, opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.topLine}>
            <Text size="2xs" weight="semibold" tone="subtle">
              {code}
            </Text>
            {flag ? <Badge label={FLAG_LABEL[flag]} tone={flag === 'at_risk' ? 'warning' : 'danger'} /> : null}
            {task.reopen_count > 0 ? <Badge label={`x${task.reopen_count}`} tone="warning" /> : null}
          </View>

          <Text weight="semibold" size="lg" numberOfLines={2}>
            {task.title}
          </Text>

          <View style={styles.tags}>
            <Badge label={typeLabel(task.task_type)} tone={TYPE_TONE[task.task_type] ?? 'neutral'} />
            <Badge label={priorityLabel(task.priority)} tone={priorityTone} />
            {task.module ? (
              <Text size="2xs" tone="subtle" numberOfLines={1}>
                {task.module}
              </Text>
            ) : null}
          </View>

          {sprintLine ? (
            <Text size="xs" tone="subtle" numberOfLines={1}>
              {sprintLine}
            </Text>
          ) : null}

          {task.subtaskCount > 0 ? (
            <View style={styles.subtasks}>
              <Text size="2xs" tone="muted">
                Subtasks {task.completedSubtaskCount}/{task.subtaskCount}
              </Text>
              <ProgressBar pct={task.subtaskCompletionPct} label="Subtask progress" />
            </View>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.people}>
              {task.devOwner ? <Avatar name={task.devOwner.name} kind="dev" /> : null}
              {task.qaOwner ? <Avatar name={task.qaOwner.name} kind="qa" /> : null}
              {!task.devOwner && !task.qaOwner ? (
                <Text size="xs" tone="subtle">
                  Unassigned
                </Text>
              ) : null}
            </View>
            {task.estimated_hours !== null ? (
              <Text size="xs" tone="subtle">
                {task.estimated_hours}h
              </Text>
            ) : null}
            {due ? (
              <Text
                size="xs"
                weight={due.tone === 'normal' ? 'regular' : 'bold'}
                tone={due.tone === 'danger' ? 'danger' : due.tone === 'warning' ? 'warning' : 'subtle'}
              >
                {due.text}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {canMove ? (
          <Pressable
            onPress={() => onMove(task)}
            accessibilityRole="button"
            accessibilityLabel={`Move ${task.title}`}
            style={[styles.move, { minHeight: t.minTouch, borderTopColor: t.colors.lineFaint }]}
          >
            <Text size="sm" weight="semibold" tone="brand">
              Move to...
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const TaskCard = memo(TaskCardImpl);

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  accent: { width: 4 },
  main: { flex: 1 },
  pressArea: { padding: 12, gap: 6 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  subtasks: { gap: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  people: { flexDirection: 'row', alignItems: 'center', gap: 4, flexGrow: 1 },
  move: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 12 },
});
