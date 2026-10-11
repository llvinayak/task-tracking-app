import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Task, TaskStatusConfig } from '@/api/models';
import { BottomSheet, Dot, OptionRow, Text } from '@/components/ui';
import { allowedTargets, statusLabel } from '@/utils/taskUtils';

/**
 * "Move to": ONLY the transitions the DB allows from the task's current status
 * (the same gate the server enforces). Never the whole pipeline.
 */
export function StatusSheet({
  task,
  config,
  busy,
  onClose,
  onSelect,
}: {
  task: Task | null;
  config: readonly TaskStatusConfig[] | undefined;
  busy?: boolean;
  onClose: () => void;
  onSelect: (task: Task, status: string) => void;
}) {
  const targets = task ? allowedTargets(config, task.status) : [];

  return (
    <BottomSheet visible={!!task} title="Move to" onClose={onClose}>
      {task ? (
        <View style={styles.body}>
          <Text size="sm" tone="muted" numberOfLines={2} style={styles.pad}>
            {task.title}
          </Text>
          <Text size="xs" tone="subtle" style={styles.pad}>
            Current: {statusLabel(config, task.status)}
          </Text>
          {targets.length === 0 ? (
            <Text tone="muted" style={styles.empty}>
              No moves are available from this status.
            </Text>
          ) : (
            targets.map((s) => (
              <OptionRow
                key={s.key}
                role="button"
                label={s.label}
                accessibilityLabel={`Move to ${s.label}`}
                leading={<Dot color={s.color} size={10} />}
                selected={false}
                disabled={busy}
                onPress={() => onSelect(task, s.key)}
              />
            ))
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingVertical: 8, gap: 8 },
  pad: { paddingHorizontal: 16 },
  empty: { paddingVertical: 12, paddingHorizontal: 16 },
});
