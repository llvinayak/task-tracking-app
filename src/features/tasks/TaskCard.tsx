import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Task, TaskStatusConfig } from '@/api/models';
import { Button, EntityCard, FlagLine, Icon, PriorityBadge, ProgressBar, StatusBadge, Text } from '@/components/ui';
import { formatDay } from '@/utils/dates';
import { cardFlag, dueDisplay, priorityLabel, statusLabel, taskCode, typeLabel } from '@/utils/taskUtils';

const FLAG_LABEL = { blocked: 'Blocked', qa_overdue: 'QA overdue', at_risk: 'At risk' } as const;
const PRIORITY_ACCENT = { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'info', LOW: 'neutral' } as const;

interface Props {
  task: Task;
  config: readonly TaskStatusConfig[] | undefined;
  /** Local day key; changing it re-renders memoized cards so due text rolls over at midnight. */
  today: string;
  /** Kept for a stable prop contract; the due text is ALWAYS urgency-aware on mobile. */
  highlightOverdue: boolean;
  canMove: boolean;
  /** Show the status badge (when the list is grouped by priority, the group no longer says it). */
  showStatus?: boolean;
  onPress: (task: Task) => void;
  onMove: (task: Task) => void;
}

/**
 * One task in a list. The main area is a single Pressable (EntityCard); "Move" sits
 * in the footer as a sibling button. Memoized: callers pass stable callbacks.
 */
function TaskCardImpl({ task, config, canMove, showStatus = false, onPress, onMove }: Props) {
  const flag = cardFlag(task);
  const accent =
    flag === 'blocked' || flag === 'qa_overdue'
      ? 'danger'
      : flag === 'at_risk'
        ? 'warning'
        : (PRIORITY_ACCENT[task.priority as keyof typeof PRIORITY_ACCENT] ?? 'neutral');
  // One wording for text and a11y; always urgency-aware on mobile (the web only highlights under its Overdue chip).
  const due = dueDisplay(task, formatDay);
  const code = taskCode(task);
  const people = [
    task.devOwner ? `Dev: ${task.devOwner.name}` : null,
    task.qaOwner ? `QA: ${task.qaOwner.name}` : null,
  ].filter(Boolean);
  const sprintLine = [task.sprint?.name, task.releaseSprint?.name].filter(Boolean).join(' · ');
  const codeLine = [code, task.module].filter(Boolean).join(' · ');
  const dueTone = due?.tone === 'danger' ? 'danger' : due?.tone === 'warning' ? 'warning' : 'muted';

  // The generic type says nothing; show it only when it is informative.
  const showType = !!task.task_type && task.task_type !== 'TASK';

  const a11y = [
    task.title,
    code,
    statusLabel(config, task.status),
    `${priorityLabel(task.priority)} priority`,
    flag ? FLAG_LABEL[flag] : null,
    due ? due.text : null,
    people.length ? people.join(', ') : 'Unassigned',
    task.reopen_count > 0 ? `Reopened ${task.reopen_count}x` : null,
    task.module ?? null,
    showType ? typeLabel(task.task_type) : null,
    sprintLine || null,
    task.subtaskCount > 0 ? `Subtasks ${task.completedSubtaskCount}/${task.subtaskCount}` : null,
  ]
    .filter(Boolean)
    .join('. ');


  return (
    <EntityCard
      accent={accent}
      title={task.title}
      accessibilityLabel={a11y}
      accessibilityHint="Opens task details"
      onPress={() => onPress(task)}
      header={
        <View style={styles.headerStack}>
          {flag ? <FlagLine label={FLAG_LABEL[flag]} tone={flag === 'at_risk' ? 'warning' : 'danger'} /> : null}
          <View style={styles.codeRow}>
            <Text size="xs" weight="semibold" tone="subtle" numberOfLines={1} style={styles.flex1}>
              {codeLine}
            </Text>
            {task.reopen_count > 0 ? (
              <View style={styles.inline}>
                <Icon name="refresh" size={12} tone="warning" />
                <Text size="xs" weight="semibold" tone="warning">
                  Reopened {task.reopen_count}x
                </Text>
              </View>
            ) : null}
            <PriorityBadge priority={task.priority} label={priorityLabel(task.priority)} compact />
          </View>
        </View>
      }
      meta={
        <View style={styles.meta}>
          <Text size="xs" tone="muted" numberOfLines={2}>
            {people.length ? people.join('  ·  ') : 'Unassigned'}
          </Text>
          {showType || sprintLine ? (
            <View style={styles.inline}>
              {task.task_type === 'BUG' ? <Icon name="bug-outline" size={16} tone="muted" /> : null}
              <Text size="xs" tone="subtle" numberOfLines={1} style={styles.flex1}>
                {[showType ? typeLabel(task.task_type) : null, sprintLine || null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
          {task.subtaskCount > 0 ? (
            <View style={styles.inline}>
              <Text size="xs" tone="muted">
                Subtasks {task.completedSubtaskCount}/{task.subtaskCount}
              </Text>
              <View style={styles.bar}>
                <ProgressBar pct={task.subtaskCompletionPct} label="Subtask progress" />
              </View>
            </View>
          ) : null}
        </View>
      }
      footer={
        <View style={styles.footerStack}>
          <View style={styles.dueRow}>
            <View style={[styles.inline, styles.flex1]}>
              <Icon name="calendar-outline" size={16} tone={dueTone} />
              {due ? (
                <Text size="sm" weight={due.tone === 'normal' ? 'medium' : 'bold'} tone={dueTone}>
                  {due.text}
                </Text>
              ) : (
                <Text size="sm" tone="muted">
                  No due date
                </Text>
              )}
              {task.estimated_hours !== null ? (
                <View style={styles.inline}>
                  <Icon name="time-outline" size={16} tone="muted" />
                  <Text size="sm" tone="muted">
                    {task.estimated_hours}h est
                  </Text>
                </View>
              ) : null}
            </View>
            {canMove ? (
              <Button
                label="Move"
                icon="swap-horizontal"
                accessibilityLabel={`Move ${task.title}`}
                variant="ghost"
                size="compact"
                fullWidth={false}
                inline
                onPress={() => onMove(task)}
              />
            ) : null}
          </View>
          {showStatus ? (
            <StatusBadge label={statusLabel(config, task.status)} color={config?.find((s) => s.key === task.status)?.color} />
          ) : null}
        </View>
      }
    />
  );
}

export const TaskCard = memo(TaskCardImpl);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  headerStack: { gap: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta: { gap: 4 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { width: 48 },
  // Sibling of the card's pressable area: the Move button must not sit inside another button.
  footerStack: { gap: 4, paddingHorizontal: 12, paddingBottom: 8 },
});
