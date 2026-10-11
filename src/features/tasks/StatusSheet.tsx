import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Task, TaskStatusConfig } from '@/api/models';
import { BottomSheet, Dot, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
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
  const t = useTheme();
  const targets = task ? allowedTargets(config, task.status) : [];

  return (
    <BottomSheet visible={!!task} title="Move to" onClose={onClose}>
      {task ? (
        <View style={styles.body}>
          <Text size="sm" tone="muted" numberOfLines={2}>
            {task.title}
          </Text>
          <Text size="xs" tone="subtle">
            Current: {statusLabel(config, task.status)}
          </Text>
          {targets.length === 0 ? (
            <Text tone="muted" style={styles.empty}>
              No moves are available from this status.
            </Text>
          ) : (
            targets.map((s) => (
              <Pressable
                key={s.key}
                disabled={busy}
                onPress={() => onSelect(task, s.key)}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${s.label}`}
                style={({ pressed }) => [
                  styles.option,
                  {
                    minHeight: t.minTouch,
                    borderColor: t.colors.line,
                    borderRadius: t.radius.xl,
                    backgroundColor: pressed ? t.colors.hover : t.colors.surface,
                    opacity: busy ? 0.5 : 1,
                  },
                ]}
              >
                <Dot color={s.color} size={10} />
                <Text weight="medium">{s.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8 },
  empty: { paddingVertical: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1 },
});
