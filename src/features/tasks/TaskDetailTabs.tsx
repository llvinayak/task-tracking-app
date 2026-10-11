import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { ASSIGNEE_ROLES, type AssigneeRole, type TaskDetail, type TaskStatusConfig } from '@/api/models';
import { COMMENT_MAX, getTaskAttachments } from '@/api/tasksApi';
import { RichText, openExternal } from '@/components/RichText';
import {
  BottomSheet,
  Banner,
  Button,
  Card,
  ChoiceChips,
  EmptyState,
  ErrorState,
  Input,
  ReadOnlyNotice,
  LoadingState,
  StaleBanner,
  Text,
} from '@/components/ui';
import { ROLE_IDS } from '@/config/constants';
import { attachmentSchemes } from '@/config/env';
import { captureSession } from '@/hooks/sessionMutation';
import { useAssigneeMutations, useAddComment } from '@/hooks/taskMutations';
import { useProjectTeam, useTaskAssignees, useTaskComments } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDateTime, formatDay } from '@/utils/dates';
import { isSafeUrl } from '@/utils/html';
import { statusLabel } from '@/utils/taskUtils';

import { StatusChip } from './TaskParts';

/** Sentence-case role names (the API values are upper-case codes). */
export const ROLE_LABEL: Record<AssigneeRole, string> = { DEV: 'Developer', QA: 'QA', SUPPORT: 'Support', REVIEWER: 'Reviewer' };

/* ── Overview ────────────────────────────────────────────────────────────── */

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text size="2xs" tone="subtle" weight="semibold">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </View>
  );
}

export function OverviewTab({
  task,
  config,
  onOpenTask,
}: {
  task: TaskDetail;
  config: readonly TaskStatusConfig[] | undefined;
  onOpenTask: (id: number) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.stack}>
      {task.is_blocked ? (
        <Banner tone="danger" message={`Blocked${task.blocker_description ? `: ${task.blocker_description}` : ''}`} />
      ) : null}
      <Card style={styles.stack}>
        <Text size="xs" tone="subtle" weight="semibold">
          DESCRIPTION
        </Text>
        <RichText html={task.description} emptyLabel="No description." />
      </Card>

      <Card style={styles.stack}>
        <Text size="xs" tone="subtle" weight="semibold">
          DATES AND EFFORT
        </Text>
        <View style={styles.grid}>
          <Field label="Start" value={formatDay(task.start_date) || null} />
          <Field label="Due" value={formatDay(task.due_date) || null} />
          <Field label="Release to QA" value={formatDay(task.release_to_qa_date) || null} />
          <Field label="QA start" value={formatDay(task.qa_start_date) || null} />
          <Field label="QA pass" value={formatDay(task.qa_pass_date) || null} />
          <Field label="Estimated" value={task.estimated_hours !== null ? `${task.estimated_hours}h` : null} />
          <Field label="Actual" value={task.actual_hours !== null ? `${task.actual_hours}h` : null} />
          <Field label="Sprint" value={task.sprint?.name ?? null} />
          <Field label="Release sprint" value={task.releaseSprint?.name ?? null} />
          <Field label="Module" value={task.module} />
        </View>
      </Card>

      {task.parentTask ? (
        <Card style={styles.stack}>
          <Text size="xs" tone="subtle" weight="semibold">
            PARENT TASK
          </Text>
          <Pressable
            onPress={() => onOpenTask((task.parentTask as { id: number }).id)}
            accessibilityRole="link"
            accessibilityLabel={`Open parent task ${task.parentTask.title}`}
            style={{ minHeight: t.minTouch, justifyContent: 'center' }}
          >
            <Text weight="medium" tone="brand">
              {task.parentTask.title}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {task.subtasks.length > 0 ? (
        <Card style={styles.stack}>
          <Text size="xs" tone="subtle" weight="semibold">
            SUBTASKS ({task.completedSubtaskCount}/{task.subtaskCount})
          </Text>
          {task.subtasks.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onOpenTask(s.id)}
              accessibilityRole="link"
              accessibilityLabel={`Open subtask ${s.title}, ${statusLabel(config, s.status)}`}
              style={[styles.subtask, { minHeight: t.minTouch }]}
            >
              <Text style={styles.flex1} numberOfLines={2}>
                {s.title}
              </Text>
              {s.status ? <StatusChip status={s.status} config={config} /> : null}
            </Pressable>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/* ── People ──────────────────────────────────────────────────────────────── */

export function PeopleTab({ task, canAssign }: { task: TaskDetail; canAssign: boolean }) {
  const t = useTheme();
  const assignees = useTaskAssignees(task.id);
  const team = useProjectTeam(task.project_id);
  const { add, remove, makePrimary } = useAssigneeMutations(task.id);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AssigneeRole>('DEV');
  const [actionError, setActionError] = useState<string | null>(null);

  const candidates = (team.data?.members ?? []).filter(
    (m) => m.user && m.user.is_active && m.user.role_id !== ROLE_IDS.CLIENT,
  );

  const run = async (p: Promise<unknown>) => {
    setActionError(null);
    const alive = captureSession();
    try {
      await p;
      return alive();
    } catch (e) {
      if (alive()) setActionError(getErrorMessage(e));
      return false;
    }
  };

  if (assignees.isLoading) return <LoadingState label="Loading people..." />;
  if (assignees.isError && !assignees.data) {
    return <ErrorState message={getErrorMessage(assignees.error)} onRetry={() => void assignees.refetch()} />;
  }
  const list = assignees.data ?? [];

  return (
    <View style={styles.stack}>
      {assignees.isError ? <StaleBanner message={getErrorMessage(assignees.error)} /> : null}
      {actionError ? <Banner message={actionError} testID="assignee-error" /> : null}
      {!canAssign ? <ReadOnlyNotice message="Only people with edit access can change assignees." /> : null}
      {list.length === 0 ? (
        <EmptyState title="No one assigned" message="This task has no assignees yet." />
      ) : (
        list.map((a) => (
          <Card key={a.id} style={styles.stack} testID={`assignee-${a.id}`}>
            <View style={styles.rowBetween}>
              <View style={styles.flex1}>
                <Text weight="semibold">{a.user?.name ?? `User ${a.user_id}`}</Text>
                <Text size="xs" tone="muted">
                  {ROLE_LABEL[a.role as AssigneeRole] ?? a.role}
                  {a.is_primary ? ' · Primary' : ''}
                </Text>
              </View>
            </View>
            {canAssign ? (
              <View style={styles.actions}>
                {!a.is_primary ? (
                  <Button
                    label="Make primary"
                    accessibilityLabel={`Make primary: ${a.user?.name ?? 'user'}`}
                    variant="secondary"
                    size="compact"
                    fullWidth={false}
                    loading={makePrimary.isPending && makePrimary.variables?.id === a.id}
                    onPress={() => void run(makePrimary.mutateAsync(a))}
                  />
                ) : null}
                <Button
                  label="Remove"
                  accessibilityLabel={`Remove ${a.user?.name ?? 'user'}`}
                  variant="dangerOutline"
                  size="compact"
                  fullWidth={false}
                  onPress={() =>
                    Alert.alert('Remove assignee?', `${a.user?.name ?? 'This person'} will be removed from this task.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => void run(remove.mutateAsync(a)) },
                    ])
                  }
                />
              </View>
            ) : null}
          </Card>
        ))
      )}

      {canAssign ? (
        <>
          <Button label="Add assignee" variant="secondary" onPress={() => setOpen(true)} />
          <BottomSheet visible={open} title="Add assignee" onClose={() => setOpen(false)} scroll={false}>
            <View style={styles.sheetBody}>
              <ChoiceChips
                accessibilityLabel="Assignee role"
                value={role}
                onChange={setRole}
                options={ASSIGNEE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              />
              {team.isLoading ? <LoadingState label="Loading team..." /> : null}
              {team.isError ? (
                <ErrorState message={getErrorMessage(team.error)} onRetry={() => void team.refetch()} />
              ) : null}
              {!team.isLoading && !team.isError && candidates.length === 0 ? (
                <Text tone="muted">No eligible team members for this project.</Text>
              ) : null}
              <FlatList
                data={candidates}
                keyExtractor={(m) => String(m.user_id)}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Assign ${item.user?.name} as ${ROLE_LABEL[role]}`}
                    onPress={async () => {
                      const ok = await run(add.mutateAsync({ user_id: item.user_id, role }));
                      if (ok) setOpen(false);
                    }}
                    style={[styles.candidate, { minHeight: t.minTouch, borderBottomColor: t.colors.lineFaint }]}
                  >
                    <Text weight="medium">{item.user?.name}</Text>
                  </Pressable>
                )}
              />
              {actionError ? <Banner message={actionError} /> : null}
            </View>
          </BottomSheet>
        </>
      ) : null}
    </View>
  );
}

/* ── Comments ────────────────────────────────────────────────────────────── */

export function CommentsTab({ taskId }: { taskId: number }) {
  const comments = useTaskComments(taskId);
  const post = useAddComment(taskId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const content = text.trim();
    if (!content || post.isPending) return;
    setError(null);
    const alive = captureSession();
    try {
      await post.mutateAsync(content);
      if (!alive()) return;
      setText('');
    } catch (e) {
      if (!alive()) return;
      // Keep the draft so nothing is lost, and say what went wrong.
      setError(getErrorMessage(e));
    }
  };

  return (
    <View style={styles.stack}>
      {comments.isLoading ? <LoadingState label="Loading comments..." /> : null}
      {comments.isError && !comments.data ? (
        <ErrorState message={getErrorMessage(comments.error)} onRetry={() => void comments.refetch()} />
      ) : null}
      {comments.isError && comments.data ? <StaleBanner message={getErrorMessage(comments.error)} /> : null}
      {comments.data && comments.data.length === 0 ? (
        <EmptyState title="No comments yet" message="Start the discussion below." />
      ) : null}
      {(comments.data ?? []).map((c) => (
        <Card key={c.id} style={styles.stack} testID={`comment-${c.id}`}>
          <View style={styles.rowBetween}>
            <Text weight="semibold">{c.author?.name ?? 'Unknown'}</Text>
            <Text size="2xs" tone="subtle">
              {formatDateTime(c.created_at)}
            </Text>
          </View>
          {/* Plain text; newlines preserved. Never rendered as HTML. */}
          <Text>{c.content}</Text>
        </Card>
      ))}

      <Card style={styles.stack}>
        {error ? <Banner message={error} testID="comment-error" /> : null}
        <Input
          label="Add a comment"
          counter
          maxLength={COMMENT_MAX}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          editable={!post.isPending}
        />
        <Button
          label="Post comment"
          onPress={() => void submit()}
          loading={post.isPending}
          disabled={!text.trim()}
        />
      </Card>
    </View>
  );
}

/* ── History ─────────────────────────────────────────────────────────────── */

export function HistoryTab({
  task,
  config,
}: {
  task: TaskDetail;
  config: readonly TaskStatusConfig[] | undefined;
}) {
  const logs = [...task.statusLogs].sort(
    (a, b) => (Date.parse(b.changed_at ?? '') || 0) - (Date.parse(a.changed_at ?? '') || 0) || b.id - a.id,
  );
  if (logs.length === 0) return <EmptyState title="No history yet" message="Status changes will appear here." />;
  return (
    <View style={styles.stack}>
      {logs.map((l) => (
        <Card key={l.id} style={styles.stack}>
          <Text weight="semibold">
            {l.from_status ? `${statusLabel(config, l.from_status)} → ` : ''}
            {statusLabel(config, l.to_status)}
          </Text>
          <Text size="xs" tone="muted">
            {l.changedBy?.name ?? 'Unknown'}
            {l.changed_at ? ` · ${formatDateTime(l.changed_at)}` : ''}
          </Text>
          {l.notes ? <Text size="sm">{l.notes}</Text> : null}
        </Card>
      ))}
    </View>
  );
}

/* ── Attachments (list + open only) ──────────────────────────────────────── */

export const formatBytes = (n: number | null) => {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export function AttachmentsTab({ task }: { task: TaskDetail }) {
  const t = useTheme();
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (id: number) => {
    setError(null);
    setOpening(id);
    try {
      // Signed URLs expire (~1h): always fetch a fresh one right before opening.
      const fresh = (await getTaskAttachments(task.id)).find((a) => a.id === id);
      if (!fresh?.s3_url || !isSafeUrl(fresh.s3_url, attachmentSchemes())) {
        setError('This file is not available to open right now.');
      } else {
        await openExternal(fresh.s3_url, attachmentSchemes());
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setOpening(null);
    }
  };

  if (task.attachments.length === 0) return <EmptyState title="No attachments" />;
  return (
    <View style={styles.stack}>
      {error ? <Banner message={error} /> : null}
      {task.attachments.map((a) => (
        <Pressable
          key={a.id}
          onPress={() => void open(a.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${a.original_name}${a.file_size !== null ? `, ${formatBytes(a.file_size)}` : ''}`}
          style={[
            styles.attachment,
            { minHeight: t.minTouch, borderColor: t.colors.line, borderRadius: t.radius.xl, backgroundColor: t.colors.surface },
          ]}
        >
          <Text style={styles.flex1} numberOfLines={2} weight="medium">
            {a.original_name}
          </Text>
          <Text size="xs" tone="subtle">
            {opening === a.id ? 'Opening...' : formatBytes(a.file_size)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  flex1: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  field: { minWidth: '40%', gap: 2 },
  subtask: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetBody: { padding: 16, gap: 8, maxHeight: 480 },
  candidate: { justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1 },
});
