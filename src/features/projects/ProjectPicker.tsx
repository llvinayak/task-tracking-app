import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { Project } from '@/api/models';
import { getErrorMessage } from '@/api/errors';
import { BottomSheet, Dot, ErrorState, Icon, Input, LoadingState, OptionRow, StaleBanner, Text } from '@/components/ui';
import { useProjects } from '@/hooks/queries';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Header button showing the current project (or "All projects"). */
export function ProjectButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const selected = useProjectStore((s) => s.selected);
  const label = selected ? selected.name : 'All Projects';
  const { isError } = useProjects();
  // Keep the selection when /projects fails, but say we could not verify it.
  const unverified = isError && !!selected;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Project: ${label}. Change project${unverified ? '. Could not verify this project right now' : ''}`}
      style={[
        styles.button,
        { minHeight: t.minTouch, borderColor: t.colors.fieldBorder, borderRadius: t.radius.xl, backgroundColor: t.colors.surface },
      ]}
    >
      <Dot color={selected?.color} size={10} />
      <Text weight="medium" numberOfLines={1} style={styles.flex1}>
        {label}
      </Text>
      {unverified ? (
        <Text size="2xs" weight="semibold" tone="warning" testID="project-unverified">
          Can&apos;t verify
        </Text>
      ) : null}
      <Icon name="chevron-down" size={16} tone="subtle" />
    </Pressable>
  );
}

export function ProjectPickerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useProjects();
  const selected = useProjectStore((s) => s.selected);
  const select = useProjectStore((s) => s.select);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [data, query]);

  const choose = (p: Project | null) => {
    select(
      p ? { id: p.id, name: p.name, color: p.color, status: p.status, product_id: p.product_id } : null,
    );
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} title="Select project" onClose={onClose} scroll={false}>
      {isError && data ? <StaleBanner message={getErrorMessage(error)} /> : null}
      <View style={styles.search}>
        <Input
          label="Search projects"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      {isLoading ? (
        <View style={styles.state}>
          <LoadingState label="Loading projects..." />
        </View>
      ) : isError && !data ? (
        <View style={styles.state}>
          <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
        </View>
      ) : (
        <FlatList
          data={[null, ...filtered] as (Project | null)[]}
          keyExtractor={(p) => (p ? String(p.id) : 'all')}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={null}
          renderItem={({ item }) => {
            const isSelected = item ? selected?.id === item.id : selected === null;
            const name = item ? item.name : 'All Projects';
            return (
              <OptionRow
                label={name}
                description={item?.status && item.status !== 'active' ? item.status.replace(/_/g, ' ') : undefined}
                leading={<Dot color={item?.color} size={10} />}
                selected={isSelected}
                onPress={() => choose(item)}
              />
            );
          }}
          ListFooterComponent={
            filtered.length === 0 && query ? (
              <Text tone="muted" style={styles.none}>
                No projects match &ldquo;{query.trim()}&rdquo;.
              </Text>
            ) : null
          }
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1 },
  flex1: { flex: 1 },
  search: { paddingHorizontal: 16, paddingVertical: 8 },
  state: { height: 220 },
  none: { padding: 16 },
});
