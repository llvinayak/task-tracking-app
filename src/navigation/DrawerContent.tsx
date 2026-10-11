import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { MyMenu } from '@/api/types';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Avatar, Badge, Button, EmptyState, Icon, StaleBanner, Text, useToast } from '@/components/ui';
import { captureSession } from '@/hooks/sessionMutation';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useSignOut } from '@/hooks/useSignOut';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { ANDROID_TOUCH } from '@/theme/tokens';

import appJson from '../../app.json';
import { confirmLeaveDirtyDay } from './dirtyGuard';
import { useDrawer } from './DrawerContext';
import { MODULE_ICONS } from './moduleIcons';
import { isModuleAvailable, type MobileModule } from './modules';
import type { ModuleName, RootStackParamList } from './types';
import { useOpenModule } from './useOpenModule';

const levelOf = (m: MyMenu) => (m.access_level === 'edit' ? 'Can edit' : 'View only');
const VERSION: string | undefined = (appJson as { expo?: { version?: string } }).expo?.version;

interface Props {
  /** Granted + mobile-visible modules in role order (the same list the tab bar is cut from). */
  granted: readonly MobileModule[];
  currentTab: ModuleName | null;
  needsSubmit: boolean;
}

function ModuleRow({
  mod,
  menu,
  current,
  unfiled,
  onPress,
}: {
  mod: MobileModule;
  menu: MyMenu | undefined;
  current: boolean;
  unfiled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const name = menu?.menu_name ?? mod.title;
  const label = [name, menu ? levelOf(menu) : null, `Opens ${mod.title}`, unfiled ? 'Not filed yet' : null, current ? 'Current page' : null]
    .filter(Boolean)
    .join('. ');
  return (
    <Pressable
      testID={`drawer-item-${mod.name}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      android_ripple={{ color: t.colors.ripple, borderless: false }}
      style={({ pressed }) => [
        styles.row,
        { minHeight: 56, backgroundColor: current ? t.colors.brand[50] : pressed && Platform.OS === 'ios' ? t.colors.hover : t.colors.transparent },
      ]}
    >
      {/* Current module: 3dp bar + filled icon + semibold label + tint (never colour alone). */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.indicator, { backgroundColor: current ? t.colors.indicator : t.colors.transparent }]}
      />
      <Icon name={current ? MODULE_ICONS[mod.name].on : MODULE_ICONS[mod.name].off} size={24} tone={current ? 'brand' : 'muted'} />
      <Text weight={current ? 'semibold' : 'medium'} style={styles.flex1}>
        {name}
      </Text>
      {unfiled ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Badge label="Not filed yet" tone="warning" icon="alert-circle" />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Drawer body: brand row, account block (Profile), the granted modules (current one marked), the collapsed list
 * of web-only menus, and a fixed footer with Sign out. Pure navigation: every action that LEAVES the current
 * screen closes the drawer first and runs through the My Day dirty guard; Sign out keeps the drawer open while its
 * checks and dialog run (Android) so the spinner is visible.
 */
export function DrawerContent({ granted, currentTab, needsSubmit }: Props) {
  const t = useTheme();
  const drawer = useDrawer();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const toast = useToast();
  const openModule = useOpenModule();
  const { mobileMenus, refreshFailed, error } = useMenuAccess();
  const [showWebOnly, setShowWebOnly] = useState(false);
  const pendingAction = useRef(false);

  const closeDrawer = drawer?.closeDrawer ?? ((then?: () => void) => then?.());
  const signOut = useSignOut({ reviewVia: (go) => closeDrawer(go) });

  const webOnly = mobileMenus.filter((m) => !isModuleAvailable(m.menu_url));
  const empty = granted.length === 0 && mobileMenus.length === 0;

  /** Close first, then (guarded by the session epoch and a double-tap latch) leave through the dirty-day guard. */
  const leave = (proceed: () => void, targetIsMyDay = false) => {
    if (pendingAction.current) return;
    pendingAction.current = true;
    const alive = captureSession();
    closeDrawer(() => {
      pendingAction.current = false;
      if (!alive()) return;
      confirmLeaveDirtyDay(proceed, { targetIsMyDay });
    });
  };

  const onSignOut = () => {
    const run = () => void signOut.confirmSignOut();
    if (Platform.OS === 'ios') {
      // iOS: an Alert over an open Modal is unreliable: close the drawer first and say what is happening.
      toast.show('Checking before sign out...', 'info');
      leave(run);
      return;
    }
    confirmLeaveDirtyDay(run);
  };

  return (
    <View style={styles.flex1}>
      <View style={styles.brandRow}>
        <Text size="lg" weight="bold" accessibilityRole="header" style={styles.flex1}>
          TaskTracking
        </Text>
        <Pressable
          onPress={() => closeDrawer()}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          hitSlop={4}
          style={[styles.close, { minWidth: Platform.OS === 'android' ? ANDROID_TOUCH : t.minTouch, minHeight: Platform.OS === 'android' ? ANDROID_TOUCH : t.minTouch }]}
        >
          <Icon name="close" size={24} tone="default" />
        </Pressable>
      </View>

      <OfflineBanner live={false} />

      <Pressable
        testID="open-profile"
        onPress={() => leave(() => nav.navigate('Profile'))}
        accessibilityRole="button"
        accessibilityLabel={`Profile and settings. ${user?.name ?? ''}${user?.roleName ? `, ${user.roleName}` : ''}`.replace(/\.\s*$/, '')}
        android_ripple={{ color: t.colors.ripple, borderless: false }}
        style={[styles.account, { borderBottomColor: t.colors.line }]}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Avatar name={user?.name} size={40} />
        </View>
        <View style={styles.flex1}>
          <Text weight="semibold" numberOfLines={2} maxFontScale={1.3}>
            {user?.name ?? 'Account'}
          </Text>
          {user?.roleName ? (
            <Text size="xs" tone="muted" numberOfLines={1}>
              {user.roleName}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={20} tone="subtle" />
      </Pressable>

      <ScrollView style={styles.flex1} contentContainerStyle={styles.body}>
        {refreshFailed ? <StaleBanner message={error instanceof Error ? error.message : 'Unknown error.'} /> : null}
        <Text size="xs" weight="semibold" tone="subtle" accessibilityRole="header" style={styles.section}>
          MODULES
        </Text>
        {granted.length > 0 ? (
          granted.map((m) => (
            <ModuleRow
              key={m.menuUrl}
              mod={m}
              menu={mobileMenus.find((x) => x.menu_url === m.menuUrl)}
              current={m.name === currentTab}
              unfiled={m.name === 'MyDay' && needsSubmit}
              onPress={() => (m.name === currentTab ? closeDrawer() : leave(() => void openModule(m.name), m.name === 'MyDay'))}
            />
          ))
        ) : empty ? (
          <EmptyState
            icon="lock-closed-outline"
            title="Nothing here yet"
            message="Your role has no screens enabled for mobile. Ask an administrator for access."
          />
        ) : (
          <Text tone="muted" size="sm" style={styles.pad}>
            No screens are enabled for mobile for your role.
          </Text>
        )}

        {webOnly.length > 0 ? (
          <View style={styles.webOnly}>
            <Pressable
              testID="web-only-toggle"
              onPress={() => setShowWebOnly((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={`Not available in this version yet, ${webOnly.length}`}
              accessibilityState={{ expanded: showWebOnly }}
              style={[styles.disclosure, { minHeight: t.minTouch }]}
            >
              <Text weight="medium" tone="muted" style={styles.flex1}>
                Not available in this version yet
              </Text>
              <Text size="sm" weight="semibold" tone="subtle">
                {webOnly.length}
              </Text>
              <Icon name={showWebOnly ? 'chevron-up' : 'chevron-down'} size={20} tone="subtle" />
            </Pressable>
            {showWebOnly
              ? webOnly.map((m) => (
                  <View
                    key={m.id}
                    accessible
                    accessibilityLabel={`${m.menu_name}. ${levelOf(m)}. Not available in this version yet.`}
                    style={styles.webRow}
                  >
                    <Text tone="muted" style={styles.flex1}>
                      {m.menu_name}
                    </Text>
                  </View>
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: t.colors.line }]}>
        <Button label="Sign out" icon="log-out-outline" variant="dangerOutline" loading={signOut.busy} onPress={onSignOut} />
        {VERSION ? (
          <Text size="xs" tone="subtle" testID="drawer-version">
            {`TaskTracking ${VERSION}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingLeft: 16, paddingRight: 8 },
  close: { alignItems: 'center', justifyContent: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  body: { paddingBottom: 16 },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  indicator: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  pad: { paddingHorizontal: 16 },
  webOnly: { marginTop: 16, paddingHorizontal: 16 },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  webRow: { minHeight: 44, justifyContent: 'center', opacity: 0.85 },
  footer: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
});
