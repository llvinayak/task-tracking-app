import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useContext, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MyMenu } from '@/api/types';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  HeaderProvidedContext,
  Icon,
  ListRow,
  LoadingState,
  Screen,
  StaleBanner,
  Text,
} from '@/components/ui';
import { useDailyPending } from '@/hooks/dailyReport';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { MODULE_ICONS } from '@/navigation/moduleIcons';
import { grantedModules, splitModules } from '@/navigation/moduleTabs';
import { MOBILE_MODULES, isModuleAvailable } from '@/navigation/modules';
import type { RootStackParamList } from '@/navigation/types';
import { useOpenModule } from '@/navigation/useOpenModule';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

const levelOf = (m: MyMenu) => (m.access_level === 'edit' ? 'Can edit' : 'View only');

/**
 * More: Profile first, then ONLY the granted modules that did not fit in the tab
 * bar, then a collapsed "Not available in this version yet" list of web-only
 * menus. Modules that are tabs are not repeated here.
 */
export function HomeScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openModule = useOpenModule();
  const headerProvided = useContext(HeaderProvidedContext);
  const { canView, mobileMenus, isLoading, loadFailed, refreshFailed, error, refetch, isRefetching } = useMenuAccess();
  const [showWebOnly, setShowWebOnly] = useState(false);

  const { overflow } = splitModules(grantedModules(MOBILE_MODULES, canView, mobileMenus, user?.roleId));
  // My Day in More (e.g. PM / CTO): carry the "not filed yet" cue the tab dot would have shown.
  const myDayHere = overflow.some((m) => m.name === 'MyDay');
  const pending = useDailyPending(myDayHere);
  const notFiled = myDayHere && pending.data?.needsSubmit === true;
  const webOnly = mobileMenus.filter((m) => !isModuleAvailable(m.menu_url));

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
        icon="lock-closed-outline"
      />
    );
  } else {
    body = (
      <>
        {overflow.length > 0 ? (
          <View style={styles.section}>
            <Text size="xs" weight="semibold" tone="subtle" accessibilityRole="header">
              MODULES
            </Text>
            <Card padded={false}>
              {overflow.map((m, i) => {
                const menu = mobileMenus.find((x) => x.menu_url === m.menuUrl);
                return (
                  <ListRow
                    key={m.menuUrl}
                    leading={<Icon name={MODULE_ICONS[m.name].off} size={24} tone="brand" />}
                    title={menu?.menu_name ?? m.title}
                    chevron
                    divider={i < overflow.length - 1}
                    accessibilityLabel={[menu?.menu_name ?? m.title, menu ? levelOf(menu) : null, `Opens ${m.title}`, m.name === 'MyDay' && notFiled ? 'Not filed yet' : null].filter(Boolean).join('. ')}
                    {...(m.name === 'MyDay' && notFiled ? { trailing: <Badge label="Not filed yet" tone="warning" icon="alert-circle" /> } : {})}
                    onPress={() => openModule(m.name)}
                  />
                );
              })}
            </Card>
          </View>
        ) : null}

        {webOnly.length > 0 ? (
          <View style={styles.section}>
            <Pressable
              onPress={() => setShowWebOnly((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={`Not available in this version yet, ${webOnly.length}`}
              accessibilityState={{ expanded: showWebOnly }}
              style={[styles.disclosure, { minHeight: t.minTouch }]}
              testID="web-only-toggle"
            >
              <Text weight="medium" tone="muted" style={styles.flex1}>
                Not available in this version yet
              </Text>
              <Text size="sm" weight="semibold" tone="subtle">
                {webOnly.length}
              </Text>
              <Icon name={showWebOnly ? 'chevron-up' : 'chevron-down'} size={20} tone="subtle" />
            </Pressable>
            {showWebOnly ? (
              <Card padded={false}>
                {webOnly.map((m, i) => (
                  <ListRow
                    key={m.id}
                    title={m.menu_name}
                    divider={i < webOnly.length - 1}
                    accessibilityLabel={`${m.menu_name}. ${levelOf(m)}. Not available in this version yet.`}
                    style={styles.dim}
                  />
                ))}
              </Card>
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Screen scroll edges={['top', 'left', 'right']} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {headerProvided ? null : (
        <Text size="xl" weight="bold" accessibilityRole="header" style={styles.title}>
          More
        </Text>
      )}
      {refreshFailed ? (
        <View style={styles.stale}>
          <StaleBanner message={error instanceof Error ? error.message : 'Unknown error.'} />
        </View>
      ) : null}
      <Card
        variant="interactive"
        chevron
        onPress={() => nav.navigate('Profile')}
        accessibilityLabel="Profile and settings"
        testID="open-profile"
        style={styles.profile}
      >
        <View style={styles.profileRow}>
          <Avatar name={user?.name} size={40} />
          <View style={styles.flex1}>
            <Text weight="semibold">Profile and settings</Text>
            <Text size="xs" tone="muted">
              {user ? `${user.name} · ${user.roleName}` : 'Account, theme, sign out'}
            </Text>
          </View>
        </View>
      </Card>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 16 },
  profile: { marginBottom: 24 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stale: { marginBottom: 12 },
  section: { gap: 8, marginBottom: 24 },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dim: { opacity: 0.85 },
  flex1: { flex: 1 },
});
