import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import {
  SEVERITY_LABEL,
  TICKET_COMMENT_MAX,
  TICKET_STATUS_LABEL,
  allowedTicketStatuses,
  canOfferConvert,
  parseNumericId,
  type TicketDetail,
  type TicketStatus,
} from '@/api/ticketsApi';
import { openExternal } from '@/components/RichText';
import { useTaskConfig } from '@/hooks/queries';
import { statusLabel } from '@/utils/taskUtils';
import {
  Badge,
  Banner,
  BottomSheet,
  Button,
  Card,
  Dot,
  ErrorState,
  OptionRow,
  Input,
  LoadingState,
  SkeletonDetailHeader,
  Screen,
  StaleBanner,
  Text,
} from '@/components/ui';
import { attachmentSchemes } from '@/config/env';
import { captureSession } from '@/hooks/sessionMutation';
import { useAddTicketComment, useAssignableUsers, useTicket, useTicketComments, useUpdateTicket } from '@/hooks/tickets';
import type { RootStackParamList } from '@/navigation/types';
import { formatDateTime } from '@/utils/dates';
import { normalizeUrl } from '@/utils/html';

import { severityTone, statusTone } from './TicketsScreen';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text size="2xs" tone="subtle" weight="semibold">
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function AssigneeSheet({ ticket, visible, onClose }: { ticket: TicketDetail; visible: boolean; onClose: () => void }) {
  const users = useAssignableUsers(visible);
  const update = useUpdateTicket(ticket.id);
  const choose = (id: number | null) => {
    onClose();
    update.mutate({ assigned_to: id });
  };
  return (
    <BottomSheet visible={visible} title="Assignee" onClose={onClose} scroll={false}>
      <View style={styles.sheet}>
        {users.isLoading ? <LoadingState label="Loading people..." /> : null}
        {users.isError ? <ErrorState message={getErrorMessage(users.error)} onRetry={() => void users.refetch()} /> : null}
        {users.data ? (
          <FlatList removeClippedSubviews={false}
            data={[{ id: 0, name: 'Unassigned' }, ...users.data]}
            keyExtractor={(u) => String(u.id)}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => {
              const selected = (item.id === 0 && !ticket.assignee) || ticket.assignee?.id === item.id;
              return (
                <OptionRow label={item.name} selected={selected} onPress={() => choose(item.id === 0 ? null : item.id)} />
              );
            }}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

export function TicketDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TicketDetail'>>();
  const id = parseNumericId(params.ticketId);
  const ticket = useTicket(id ?? 0);
  const comments = useTicketComments(id ?? 0);
  const update = useUpdateTicket(id ?? 0);
  const add = useAddTicketComment(id ?? 0);
  const { config } = useTaskConfig();
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [text, setText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  if (id === null) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <ErrorState title="Couldn't open this ticket" message="That ticket link is not valid." secondary={{ label: 'Go back', onPress: () => nav.goBack() }} />
      </Screen>
    );
  }
  if (ticket.isLoading) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <SkeletonDetailHeader label="Loading ticket..." />
      </Screen>
    );
  }
  if (!ticket.data) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <ErrorState
          title="Couldn't open this ticket"
          message={getErrorMessage(ticket.error)}
          onRetry={() => void ticket.refetch()}
          secondary={{ label: 'Go back', onPress: () => nav.goBack() }}
        />
      </Screen>
    );
  }

  const tk = ticket.data;
  const targets = allowedTicketStatuses(tk.status);
  const post = async () => {
    const content = text.trim();
    if (!content || add.isPending) return;
    setCommentError(null);
    const alive = captureSession();
    try {
      await add.mutateAsync(content);
      if (!alive()) return;
      setText('');
    } catch (e) {
      if (!alive()) return;
      setCommentError(getErrorMessage(e)); // 422 verbatim; the draft is kept
    }
  };
  const openAttachment = (url: string | null) => {
    const safe = normalizeUrl(url, attachmentSchemes());
    if (safe) void openExternal(safe, attachmentSchemes());
  };

  return (
    <Screen scroll keyboardAvoiding edges={['left', 'right', 'bottom']} onRefresh={() => { void ticket.refetch(); void comments.refetch(); }} refreshing={ticket.isRefetching}>
      {ticket.isError ? <StaleBanner message={getErrorMessage(ticket.error)} /> : null}
      <View style={styles.head}>
        <View style={styles.tags}>
          <Badge label={`${SEVERITY_LABEL[tk.severity] ?? 'Low'} severity`} tone={severityTone(tk.severity)} />
          <Badge label={TICKET_STATUS_LABEL[tk.status]} tone={statusTone(tk.status)} />
        </View>
        <Text size="xl" weight="bold" accessibilityRole="header">
          {tk.title}
        </Text>
      </View>

      <Card style={styles.gap}>
        <Fact label="Project">
          <View style={styles.tags}>
            {tk.project ? <Dot color={tk.project.color} size={8} /> : null}
            <Text>{tk.project?.name ?? 'None'}</Text>
          </View>
        </Fact>
        <Fact label="Client">
          <Text>{tk.client?.name ?? tk.client_name ?? 'None'}</Text>
        </Fact>
        <Fact label="Raised by">
          <Text>
            {tk.creator?.name ?? 'Unknown'}
            {tk.created_at ? ` · ${formatDateTime(tk.created_at)}` : ''}
          </Text>
        </Fact>
        <Fact label="Assignee">
          <View style={styles.between}>
            <Text testID="ticket-assignee">{tk.assignee?.name ?? 'Unassigned'}</Text>
            <Button label="Change assignee" variant="secondary" size="compact" fullWidth={false} inline onPress={() => setAssigneeOpen(true)} />
          </View>
        </Fact>
      </Card>

      <Card style={styles.gap} testID="ticket-status-card">
        <Text size="xs" tone="subtle" weight="semibold">
          STATUS
        </Text>
        {tk.status === 'converted' ? (
          <Text size="sm" tone="muted">
            Converted tickets can only be closed.
          </Text>
        ) : null}
        <View style={styles.tags}>
          {targets.map((s: TicketStatus) => (
            <Button
              key={s}
              testID={`ticket-status-${s}`}
              label={`Mark ${TICKET_STATUS_LABEL[s]}`}
              variant="secondary"
              size="compact"
              fullWidth={false}
              disabled={update.isPending}
              onPress={() => {
                if (s !== 'closed') {
                  update.mutate({ status: s });
                  return;
                }
                // Closing is the one status change worth a second look.
                Alert.alert(`Mark this ticket as ${TICKET_STATUS_LABEL[s]}?`, 'You can change the status again later.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: `Mark ${TICKET_STATUS_LABEL[s]}`, onPress: () => update.mutate({ status: s }) },
                ]);
              }}
            />
          ))}
        </View>
        {update.isPending ? <Text size="xs" tone="muted">Updating...</Text> : null}
      </Card>

      <Card style={styles.gap}>
        <Text size="xs" tone="subtle" weight="semibold">
          REPORTED ISSUE
        </Text>
        {/* Plain text on the web too (whitespace-pre-wrap): never rendered as HTML. */}
        <Text testID="ticket-description">{tk.description || 'No description was given.'}</Text>
      </Card>

      {canOfferConvert(tk) ? (
        <Banner
          testID="convert-note"
          tone="info"
          message="Converting a ticket to a task needs sprint, release and team rules, so it is only available on the web for now."
        />
      ) : null}

      {tk.tasks.length > 0 ? (
        <Card style={styles.gap} testID="ticket-tasks">
          <Text size="xs" tone="subtle" weight="semibold">
            LINKED TASKS
          </Text>
          {tk.tasks.map((x) => (
            <Pressable
              key={x.id}
              onPress={() => nav.navigate('TaskDetail', { taskId: x.id })}
              accessibilityRole="link"
              accessibilityLabel={`Open task ${x.title}`}
              style={styles.linkRow}
            >
              <Text weight="medium" tone="brand" style={styles.flex1} numberOfLines={2}>
                {x.title}
              </Text>
              <Text size="xs" tone="muted">
                {statusLabel(config, x.status)}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {tk.attachments.length > 0 ? (
        <Card style={styles.gap} testID="ticket-attachments">
          <Text size="xs" tone="subtle" weight="semibold">
            ATTACHMENTS ({tk.attachments.length})
          </Text>
          {tk.attachments.map((a, i) => {
            const openable = normalizeUrl(a.url, attachmentSchemes()) !== null;
            return (
              <Pressable
                key={`${a.name}-${i}`}
                disabled={!openable}
                onPress={() => openAttachment(a.url)}
                accessibilityRole={openable ? 'button' : 'text'}
                accessibilityLabel={openable ? `Open ${a.name}` : `${a.name}, cannot be opened here`}
                style={styles.linkRow}
              >
                <Text weight="medium" tone={openable ? 'brand' : 'muted'} style={styles.flex1} numberOfLines={2}>
                  {a.name}
                </Text>
                {!openable ? (
                  <Text size="2xs" tone="subtle">
                    not available
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <View style={styles.section}>
        <Text size="lg" weight="semibold" accessibilityRole="header">
          Notes
        </Text>
        {comments.isLoading ? <LoadingState label="Loading notes..." /> : null}
        {comments.isError && !comments.data ? (
          <ErrorState message={getErrorMessage(comments.error)} onRetry={() => void comments.refetch()} />
        ) : null}
        {comments.isError && comments.data ? <StaleBanner message={getErrorMessage(comments.error)} testID="comments-stale" /> : null}
        {comments.data && comments.data.length === 0 ? (
          <Text tone="muted" size="sm">
            No notes yet.
          </Text>
        ) : null}
        {(comments.data ?? []).map((c) => (
          <Card key={c.id} style={styles.gap} testID={`ticket-comment-${c.id}`}>
            <View style={styles.between}>
              <Text weight="semibold">{c.author?.name ?? 'Unknown'}</Text>
              <Text size="2xs" tone="subtle">
                {formatDateTime(c.created_at)}
              </Text>
            </View>
            <Text>{c.content}</Text>
          </Card>
        ))}
        <Card style={styles.gap}>
          {commentError ? <Banner message={commentError} testID="ticket-comment-error" /> : null}
          <Input
            label="Add a note"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={3}
            maxLength={TICKET_COMMENT_MAX}
            textAlignVertical="top"
            editable={!add.isPending}
          />
          <Button label="Post note" onPress={() => void post()} loading={add.isPending} disabled={!text.trim()} />
        </Card>
      </View>

      <AssigneeSheet ticket={tk} visible={assigneeOpen} onClose={() => setAssigneeOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  head: { gap: 8, marginBottom: 12 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  gap: { gap: 8, marginBottom: 8 },
  fact: { gap: 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  section: { gap: 8, marginTop: 12, paddingBottom: 24 },
  sheet: { padding: 16, gap: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
