import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { RichText } from '@/components/RichText';
import { Button, Card, ErrorState, Screen, SkeletonDetailHeader, Text } from '@/components/ui';
import { useTask, useTaskConfig } from '@/hooks/queries';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import type { RootStackParamList } from '@/navigation/types';
import { taskCode } from '@/utils/taskUtils';

import { StatusChip } from '../tasks/TaskParts';
import { QAPanel } from './QAPanel';

/** QA panel for one task, opened from the QA queue. */
export function QATaskScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'QATask'>>();
  const task = useTask(params.taskId);
  const { config } = useTaskConfig();
  const { canView } = useMenuAccess();

  if (task.isLoading) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <SkeletonDetailHeader label="Loading task..." />
      </Screen>
    );
  }
  if (!task.data) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <ErrorState
          title="Couldn't open this task"
          message={getErrorMessage(task.error)}
          onRetry={() => void task.refetch()}
          secondary={{ label: 'Go back', onPress: () => nav.goBack() }}
        />
      </Screen>
    );
  }
  const data = task.data;
  const owners = [data.devOwner ? `Dev: ${data.devOwner.name}` : null, data.qaOwner ? `QA: ${data.qaOwner.name}` : null].filter(Boolean).join(' · ');
  return (
    <Screen scroll edges={['left', 'right', 'bottom']} onRefresh={() => void task.refetch()} refreshing={task.isRefetching}>
      <View style={styles.head}>
        <Text size="xs" tone="subtle" weight="semibold">
          {taskCode(data)}
        </Text>
        <Text size="xl" weight="bold" accessibilityRole="header">
          {data.title}
        </Text>
        <StatusChip status={data.status} config={config} />
        {owners ? (
          <Text size="sm" tone="muted" testID="qa-owners">
            {owners}
          </Text>
        ) : null}
        <Button
          label="Open task"
          icon="chevron-forward"
          iconPosition="end"
          accessibilityLabel={`Open task ${data.title}`}
          variant="secondary"
          size="compact"
          fullWidth={false}
          onPress={() => nav.navigate('TaskDetail', { taskId: data.id })}
        />
      </View>
      {data.description ? (
        <Card style={styles.desc} testID="qa-description">
          <Text size="xs" tone="subtle" weight="semibold">
            DESCRIPTION
          </Text>
          <RichText html={data.description} emptyLabel="No description." />
        </Card>
      ) : null}
      {/* The server has no project/assignee checks on QA endpoints: this gate is a courtesy. */}
      <QAPanel taskId={data.id} status={data.status} canAct={canView('/qa')} />
    </Screen>
  );
}

const styles = StyleSheet.create({ head: { gap: 4, marginBottom: 12 }, desc: { gap: 8, marginBottom: 12 } });
