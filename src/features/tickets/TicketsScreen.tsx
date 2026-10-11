import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import {
  SEVERITY_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  type Ticket,
  type TicketStatus,
} from '@/api/ticketsApi';
import { Badge, Button, Chip, Dot, EmptyState, EntityCard, ErrorState, Input, ModuleHeader, Screen, SkeletonCards, StaleBanner, Text } from '@/components/ui';
import { useDebounced } from '@/hooks/useDebounced';
import { useScreenBottomPadding } from '@/hooks/useScreenBottomPadding';
import { useTickets } from '@/hooks/tickets';
import type { RootStackParamList } from '@/navigation/types';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDay } from '@/utils/dates';

import { ProjectButton, ProjectPickerSheet } from '../projects/ProjectPicker';

export const SEARCH_DEBOUNCE_MS = 250;

/** Stable (not an inline arrow) so the list does not rebuild its separators on every render. */
const Separator = () => <View style={styles.sep} />;

export const severityTone = (s: number) => (s >= 4 ? 'danger' : s === 3 ? 'warning' : s === 2 ? 'info' : 'neutral');
export const statusTone = (s: TicketStatus) =>
  s === 'open' ? 'brand' : s === 'in_progress' ? 'warning' : s === 'converted' ? 'success' : 'neutral';

/** Severity and status are always TEXT badges, never colour alone. */
export function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress: (t: Ticket) => void }) {
  const tone = severityTone(ticket.severity);
  return (
    <EntityCard
      testID={`ticket-${ticket.id}`}
      accent={tone}
      title={ticket.title}
      onPress={() => onPress(ticket)}
      // Every visible fact is in the name (Label in Name for a summarised card): title, severity, status, then who and where.
      accessibilityLabel={[
        ticket.title,
        `${SEVERITY_LABEL[ticket.severity] ?? 'Low'} severity`,
        TICKET_STATUS_LABEL[ticket.status],
        ticket.assignee ? `Assignee: ${ticket.assignee.name}` : 'Unassigned',
        [ticket.project?.name, ticket.client?.name ?? ticket.client_name].filter(Boolean).join(' · ') || 'No project',
        ticket.created_at ? formatDay(ticket.created_at) : null,
      ]
        .filter(Boolean)
        .join('. ')}
      header={
        <View style={styles.tags}>
          <Badge label={`Severity: ${SEVERITY_LABEL[ticket.severity] ?? 'Low'}`} tone={tone} icon={ticket.severity >= 3 ? 'alert-circle' : undefined} />
          <Badge label={TICKET_STATUS_LABEL[ticket.status]} tone={statusTone(ticket.status)} />
        </View>
      }
      meta={
        <View style={styles.metaStack}>
          <View style={styles.tags}>
            {ticket.project ? <Dot color={ticket.project.color} size={8} /> : null}
            <Text size="xs" tone="muted" numberOfLines={1} style={styles.flex1}>
              {[ticket.project?.name, ticket.client?.name ?? ticket.client_name].filter(Boolean).join(' · ') || 'No project'}
            </Text>
          </View>
          <Text size="xs" tone="muted">
            {ticket.assignee ? `Assignee: ${ticket.assignee.name}` : 'Unassigned'}
            {ticket.created_at ? ` · ${formatDay(ticket.created_at)}` : ''}
          </Text>
        </View>
      }
    />
  );
}

export function TicketsScreen() {
  const t = useTheme();
  const listBottom = useScreenBottomPadding(32);
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

  const loading = query.isLoading;
  const failed = query.isError && !all;
  const clearFilters = () => {
    setSearch('');
    setStatus('all');
  };
  // Chips scroll with the list; the list is always mounted so loading/error/empty never remount them.
  const listHeader = (
    <View style={styles.listHeader}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
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
      </ScrollView>
      {query.isError && all ? <StaleBanner message={getErrorMessage(query.error)} /> : null}
    </View>
  );
  const emptyState = loading ? (
    <SkeletonCards label="Loading tickets..." variant="ticket" count={5} />
  ) : failed ? (
    <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  ) : (
    <EmptyState
      icon="ticket-outline"
      title={q || status !== 'all' ? 'No tickets match' : 'No tickets yet'}
      message={q || status !== 'all' ? 'Try another search or status.' : selected ? `No tickets for ${selected.name}.` : 'Tickets will appear here.'}
      // The toolbar already has "New ticket" (a second one here would be a duplicate control).
      {...(q || status !== 'all' ? { action: { label: 'Clear filters', onPress: clearFilters } } : {})}
    />
  );

  return (
    <Screen
      edges={['left', 'right']}
      padded={false}
      header={<ModuleHeader title="Tickets" trailing={<ProjectButton onPress={() => setPickerOpen(true)} />} />}
    >
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <View style={styles.flex1}>
            <Input
              label="Search tickets"
              hideLabel
              leadingIcon="search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search tickets"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <Button label="New ticket" icon="add" size="compact" fullWidth={false} inline onPress={() => nav.navigate('TicketCreate')} />
        </View>
      </View>
      <View style={styles.flex1}>
        <FlatList
          data={loading || failed ? [] : visible}
          keyExtractor={(x) => String(x.id)}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews={false}
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }, (loading || failed || visible.length === 0) && styles.grow]}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyState}
          ItemSeparatorComponent={Separator}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={t.colors.brand[500]} />}
          renderItem={({ item }) => <TicketCard ticket={item} onPress={open} />}
        />
      </View>
      <ProjectPickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chips: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  listHeader: { gap: 8, paddingBottom: 8 },
  grow: { flexGrow: 1 },
  list: { padding: 16, paddingBottom: 32 },
  sep: { height: 8 },
  metaStack: { gap: 4 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
});
