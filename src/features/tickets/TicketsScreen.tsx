import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import {
  SEVERITY_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  type Ticket,
  type TicketStatus,
} from '@/api/ticketsApi';
import { Badge, Button, Card, Chip, Dot, EmptyState, ErrorState, Input, LoadingState, Screen, StaleBanner, Text } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useTickets } from '@/hooks/tickets';
import type { RootStackParamList } from '@/navigation/types';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDay } from '@/utils/dates';

import { ProjectButton, ProjectPickerSheet } from '../projects/ProjectPicker';

export const SEARCH_DEBOUNCE_MS = 250;

export const severityTone = (s: number) => (s >= 4 ? 'danger' : s === 3 ? 'warning' : s === 2 ? 'info' : 'neutral');
export const statusTone = (s: TicketStatus) =>
  s === 'open' ? 'brand' : s === 'in_progress' ? 'warning' : s === 'converted' ? 'success' : 'neutral';

/** Severity and status are always TEXT badges, never color alone. */
export function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress: (t: Ticket) => void }) {
  const t = useTheme();
  return (
    <Card padded={false} testID={`ticket-${ticket.id}`}>
      <Pressable
        onPress={() => onPress(ticket)}
        accessibilityRole="button"
        accessibilityLabel={`${ticket.title}. ${SEVERITY_LABEL[ticket.severity] ?? 'Low'} severity. ${TICKET_STATUS_LABEL[ticket.status]}. ${
          ticket.assignee ? `Assigned to ${ticket.assignee.name}` : 'Unassigned'
        }`}
        style={[styles.card, { minHeight: t.minTouch }]}
      >
        <View style={styles.tags}>
          <Badge label={SEVERITY_LABEL[ticket.severity] ?? 'Low'} tone={severityTone(ticket.severity)} />
          <Badge label={TICKET_STATUS_LABEL[ticket.status]} tone={statusTone(ticket.status)} />
        </View>
        <Text weight="semibold" size="lg" numberOfLines={2}>
          {ticket.title}
        </Text>
        <View style={styles.tags}>
          {ticket.project ? <Dot color={ticket.project.color} size={8} /> : null}
          <Text size="xs" tone="muted" numberOfLines={1} style={styles.flex1}>
            {[ticket.project?.name, ticket.client?.name ?? ticket.client_name].filter(Boolean).join(' · ') || 'No project'}
          </Text>
        </View>
        <Text size="xs" tone="subtle">
          {ticket.assignee ? `Assignee: ${ticket.assignee.name}` : 'Unassigned'}
          {ticket.created_at ? ` · ${formatDay(ticket.created_at)}` : ''}
        </Text>
      </Pressable>
    </Card>
  );
}

export function TicketsScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const selected = useProjectStore((s) => s.selected);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  /** The list is filtered 250ms after the last keystroke, not on every one. */
  const q = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const [status, setStatus] = useState<'all' | TicketStatus>('all');

  const query = useTickets({ projectId: selected?.id ?? null });
  const all = query.data;

  // Search is client-side on the title (the list has no server search).
  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (all ?? []).filter((x) => !needle || x.title.toLowerCase().includes(needle));
  }, [all, q]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: searched.length };
    for (const s of TICKET_STATUSES) c[s] = searched.filter((x) => x.status === s).length;
    return c;
  }, [searched]);
  const visible = status === 'all' ? searched : searched.filter((x) => x.status === status);

  const open = (tk: Ticket) => nav.navigate('TicketDetail', { ticketId: tk.id });

  let body: React.ReactNode;
  if (query.isLoading) body = <LoadingState label="Loading tickets..." />;
  else if (query.isError && !all) body = <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  else if (visible.length === 0) {
    body = (
      <EmptyState
        title={q || status !== 'all' ? 'No tickets match' : 'No tickets yet'}
        message={q || status !== 'all' ? 'Try another search or status.' : selected ? `No tickets for ${selected.name}.` : 'Tickets will appear here.'}
      />
    );
  } else {
    body = (
      <FlatList
        data={visible}
        keyExtractor={(x) => String(x.id)}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={t.colors.brand[500]} />}
        renderItem={({ item }) => <TicketCard ticket={item} onPress={open} />}
      />
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      <View style={styles.header}>
        <View style={styles.between}>
          <Text size="2xl" weight="bold" accessibilityRole="header">
            Tickets
          </Text>
          <Button label="New ticket" fullWidth={false} onPress={() => nav.navigate('TicketCreate')} />
        </View>
        <ProjectButton onPress={() => setPickerOpen(true)} />
        <Input label="Search tickets" value={search} onChangeText={setSearch} placeholder="Title" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
        <View style={styles.chips}>
          <Chip label="All" count={counts.all ?? 0} selected={status === 'all'} onPress={() => setStatus('all')} testID="ticket-chip-all" />
          {TICKET_STATUSES.map((s) => (
            <Chip
              key={s}
              testID={`ticket-chip-${s}`}
              label={TICKET_STATUS_LABEL[s]}
              count={counts[s] ?? 0}
              selected={status === s}
              onPress={() => setStatus(status === s ? 'all' : s)}
            />
          ))}
        </View>
        {query.isError && all ? <StaleBanner message={getErrorMessage(query.error)} /> : null}
      </View>
      <View style={styles.flex1}>{body}</View>
      <ProjectPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { padding: 16, paddingBottom: 32 },
  sep: { height: 10 },
  card: { padding: 12, gap: 6 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
});
