import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MyMenu } from '@/api/types';
import { Badge, Card, EmptyState, ErrorState, LoadingState, Screen, StaleBanner, Text } from '@/components/ui';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { isModuleAvailable, moduleForUrl } from '@/navigation/modules';
import type { RootStackParamList } from '@/navigation/types';
import { useOpenModule } from '@/navigation/useOpenModule';
import { useAuthStore } from '@/store/authStore';

/** Emoji icons only; the seed also holds words like "rocket" which we skip. */
const EMOJI_RE = /^\p{Extended_Pictographic}/u;
const iconOf = (m: MyMenu) =>
  m.menu_icon && EMOJI_RE.test(m.menu_icon) ? m.menu_icon : m.menu_name.charAt(0).toUpperCase();

function MenuRow({ menu }: { menu: MyMenu }) {
  const openModule = useOpenModule();
  const mod = moduleForUrl(menu.menu_url);
  const available = isModuleAvailable(menu.menu_url);
  const level = menu.access_level === 'edit' ? 'Can edit' : 'View only';
  const card = (
    <Card
      accessible={!available}
      accessibilityLabel={available ? undefined : `${menu.menu_name}. ${level}. Not available in this version yet.`}
      accessibilityState={available ? undefined : { disabled: true }}
      style={[styles.row, !available && styles.dim]}
    >
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
        <Text size="xl">{iconOf(menu)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text weight="semibold">{menu.menu_name}</Text>
        <View style={styles.badges}>
          <Badge label={level} tone={menu.access_level === 'edit' ? 'success' : 'neutral'} />
          {available ? null : <Badge label="Not available in this version yet" tone="warning" />}
        </View>
      </View>
    </Card>
  );
  if (!available || !mod) return card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${menu.menu_name}. ${level}. Opens ${mod.title}`}
      onPress={() => openModule(mod.name)}
    >
      {card}
    </Pressable>
  );
}

export function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { mobileMenus, isLoading, loadFailed, refreshFailed, error, refetch, isRefetching } = useMenuAccess();

  let body: React.ReactNode;
  if (isLoading) {
    body = <LoadingState label="Loading your menus..." />;
  } else if (loadFailed) {
    body = (
      <ErrorState
        message={error instanceof Error ? error.message : 'Could not load your menus.'}
        onRetry={() => void refetch()}
      />
    );
  } else if (mobileMenus.length === 0) {
    body = (
      <EmptyState
        title="Nothing here yet"
        message="Your role has no screens enabled for mobile. Ask an administrator for access."
      />
    );
  } else {
    body = (
      <View style={styles.list}>
        {mobileMenus.map((m) => (
          <MenuRow key={m.id} menu={m} />
        ))}
      </View>
    );
  }

  return (
    <Screen scroll edges={['top', 'left', 'right']} onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View style={styles.header}>
        <Text size="2xl" weight="bold" accessibilityRole="header">
          More{user ? ` for ${user.name.split(' ')[0]}` : ''}
        </Text>
        <Text tone="muted">
          What your role can access. Items marked &ldquo;Not available in this version yet&rdquo; are only on the web for now.
        </Text>
      </View>
      {refreshFailed ? (
        <View style={styles.stale}>
          <StaleBanner message={error instanceof Error ? error.message : 'Unknown error.'} />
        </View>
      ) : null}
      <Pressable
        onPress={() => nav.navigate('Profile')}
        accessibilityRole="button"
        accessibilityLabel="Profile and settings"
        style={styles.profile}
        testID="open-profile"
      >
        <Card style={styles.row}>
          <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
            <Text size="xl">{user?.name?.charAt(0).toUpperCase() ?? '?'}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text weight="semibold">Profile and settings</Text>
            <Text size="xs" tone="muted">
              {user ? `${user.name} · ${user.roleName}` : 'Account, theme, sign out'}
            </Text>
          </View>
        </Card>
      </Pressable>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 16 },
  profile: { marginBottom: 12 },
  stale: { marginBottom: 12 },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dim: { opacity: 0.85 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
