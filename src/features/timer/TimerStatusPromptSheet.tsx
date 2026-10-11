import React from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Text } from '@/components/ui';
import { useTimerPromptStore } from '@/hooks/timer';
import { useChangeStatus } from '@/hooks/taskMutations';

/**
 * Post start/stop status prompt. Choices are already filtered to statuses that
 * exist in /config AND are allowed from the current status; a server rejection
 * is shown verbatim by the status mutation.
 */
export function TimerStatusPromptSheet() {
  const prompt = useTimerPromptStore((s) => s.prompt);
  const dismiss = useTimerPromptStore((s) => s.dismiss);
  const change = useChangeStatus();

  return (
    <BottomSheet visible={!!prompt} kind="prompt" title={prompt?.title ?? ''} onClose={dismiss}>
      {prompt ? (
        <View style={styles.body}>
          <Text size="sm" weight="semibold" numberOfLines={2}>
            {prompt.taskTitle}
          </Text>
          <Text tone="muted" size="sm">
            {prompt.body}
          </Text>
          {prompt.choices.map((c) => (
            <Button
              key={c.key}
              label={c.label}
              accessibilityHint={c.hint}
              loading={change.isPending}
              onPress={() => {
                change.mutate({ taskId: prompt.taskId, status: c.key, successMessage: `Moved to ${c.label}` });
                dismiss();
              }}
            />
          ))}
          <Button label={prompt.dismissLabel} variant="ghost" onPress={dismiss} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({ body: { padding: 16, gap: 8 } });
