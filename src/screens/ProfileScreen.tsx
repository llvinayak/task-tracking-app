import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { getPendingDay } from '@/api/dailyReportApi';
import { getRunningTimer, type RunningTimer } from '@/api/timeApi';
import { dailyKeys } from '@/hooks/dailyReport';
import { keys } from '@/hooks/queries';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useOpenModule } from '@/navigation/useOpenModule';

import { buildSignOutDialog, withTimeout } from './signOutDialog';

import { Button, Card, Screen, Text, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { useThemeStore, type ThemeMode } from '@/theme/themeStore';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemeModePicker() {
  const t = useTheme();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <View accessibilityRole="radiogroup" style={styles.modes}>
      {MODES.map((m) => {
        const selected = mode === m.value;
        return (
          <Pressable
            key={m.value}
            onPress={() => setMode(m.value)}
            accessibilityRole="radio"
            accessibilityLabel={`${m.label} theme`}
            accessibilityState={{ selected }}
            style={[
              styles.mode,
              {
                minHeight: t.minTouch,
                borderRadius: t.radius.xl,
                borderColor: selected ? t.colors.brand[500] : t.colors.lineStrong,
                backgroundColor: selected ? t.colors.brand[50] : t.colors.surface,
              },
            ]}
          >
            <Text weight={selected ? 'semibold' : 'medium'} tone={selected ? 'brand' : 'default'}>
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const signingOut = useAuthStore((s) => s.signingOut);
  const toast = useToast();

  const qc = useQueryClient();
  const openModule = useOpenModule();
  const { canView } = useMenuAccess();
  const [checking, setChecking] = useState(false);

  const doSignOut = () => {
    logout().catch((e: unknown) => toast.show(e instanceof Error ? e.message : 'Could not sign out.', 'danger'));
  };

  const confirmSignOut = async () => {
    if (signingOut || checking) return;
    setChecking(true);
    // Both checks are best-effort and time-boxed: a failure or a slow network
    // must never keep the user from signing out.
    const [pending, timer] = await Promise.all([
      withTimeout(qc.fetchQuery({ queryKey: dailyKeys.pending, queryFn: getPendingDay, staleTime: 0, retry: false }), 3000),
      withTimeout(qc.fetchQuery({ queryKey: keys.runningTimer, queryFn: getRunningTimer, staleTime: 15_000, retry: false }), 3000),
    ]);
    setChecking(false);

    const dialog = buildSignOutDialog({
      pending,
      runningTaskTitle: (timer ?? qc.getQueryData<RunningTimer | null>(keys.runningTimer))?.task.title ?? null,
      canReview: canView('/my-day'),
    });
    Alert.alert(
      dialog.title,
      dialog.message,
      dialog.buttons.map((b) => ({
        text: b.text,
        ...(b.style ? { style: b.style } : {}),
        onPress: () => {
          if (b.action === 'signOut') doSignOut();
          else if (b.action === 'review') openModule('MyDay');
        },
      })),
    );
  };

  return (
    <Screen scroll edges={['top', 'left', 'right']}>
      <Text size="2xl" weight="bold" accessibilityRole="header" style={styles.title}>
        Profile
      </Text>

      <Card style={styles.section}>
        <Text size="xs" tone="subtle" weight="semibold">
          ACCOUNT
        </Text>
        <Text size="xl" weight="semibold">
          {user?.name ?? '-'}
        </Text>
        <Text tone="muted">{user?.email ?? ''}</Text>
        <Text tone="muted">Role: {user?.roleName ?? '-'}</Text>
      </Card>

      <Card style={styles.section}>
        <Text size="xs" tone="subtle" weight="semibold">
          APPEARANCE
        </Text>
        <ThemeModePicker />
      </Card>

      <Button
        label="Sign out"
        variant="danger"
        loading={signingOut || checking}
        onPress={() => void confirmSignOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 16 },
  section: { gap: 8, marginBottom: 16 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
