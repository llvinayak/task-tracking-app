import React, { useContext } from 'react';
import { StyleSheet } from 'react-native';

import { Button, Card, ChoiceChips, HeaderProvidedContext, Screen, Text } from '@/components/ui';
import { useSignOut } from '@/hooks/useSignOut';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, type ThemeMode } from '@/theme/themeStore';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemeModePicker() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <ChoiceChips
      accessibilityLabel="Theme"
      value={mode}
      onChange={setMode}
      options={MODES.map((m) => ({ value: m.value, label: m.label, accessibilityLabel: `${m.label} theme` }))}
    />
  );
}

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const headerProvided = useContext(HeaderProvidedContext);
  const { confirmSignOut, busy } = useSignOut();

  return (
    <Screen scroll edges={['top', 'left', 'right']}>
      {headerProvided ? null : (
        <Text size="xl" weight="bold" accessibilityRole="header" style={styles.title}>
          Profile
        </Text>
      )}

      <Card style={styles.section}>
        <Text size="xs" tone="subtle" weight="semibold" accessibilityRole="header">
          ACCOUNT
        </Text>
        <Text size="xl" weight="semibold">
          {user?.name ?? '-'}
        </Text>
        <Text tone="muted">{user?.email ?? ''}</Text>
        <Text tone="muted">Role: {user?.roleName ?? '-'}</Text>
      </Card>

      <Card style={styles.section}>
        <Text size="xs" tone="subtle" weight="semibold" accessibilityRole="header">
          APPEARANCE
        </Text>
        <ThemeModePicker />
      </Card>

      <Button
        label="Sign out"
        variant="dangerOutline"
        loading={busy}
        onPress={() => void confirmSignOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 16 },
  section: { gap: 8, marginBottom: 16 },
});
