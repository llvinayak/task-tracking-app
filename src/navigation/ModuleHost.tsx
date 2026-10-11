import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { TopInsetHandledContext } from '@/components/ui/Screen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { useTheme } from '@/theme/ThemeProvider';

import { MOBILE_MODULES } from './modules';
import type { RootStackParamList } from './types';

/**
 * Hosts a screen that normally lives in a tab as a PUSHED screen (a granted
 * module that did not fit in the tab bar, or Profile). It draws its own back
 * bar, and tells the screen inside not to pad the status bar a second time.
 */
export function ModuleHost({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={[styles.root, { backgroundColor: t.colors.app }]}>
      <View
        style={[
          styles.bar,
          { paddingTop: insets.top, backgroundColor: t.colors.surface, borderBottomColor: t.colors.line },
        ]}
      >
        <Pressable
          onPress={() => nav.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.back, { minHeight: t.minTouch, minWidth: t.minTouch }]}
        >
          <Text weight="semibold" tone="brand">
            ‹ Back
          </Text>
        </Pressable>
        <Text weight="semibold" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      <TopInsetHandledContext.Provider value>
        <View style={styles.flex1}>{children}</View>
      </TopInsetHandledContext.Provider>
    </View>
  );
}

/** Route target for `Module`: renders the registered screen for the module name. */
export function ModuleRoute() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Module'>>();
  const mod = MOBILE_MODULES.find((m) => m.name === params.name);
  if (!mod) return null;
  const Screen = mod.screen;
  return (
    <ModuleHost title={mod.title}>
      <Screen />
    </ModuleHost>
  );
}

export function ProfileRoute() {
  return (
    <ModuleHost title="Profile">
      <ProfileScreen />
    </ModuleHost>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderBottomWidth: 1 },
  back: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  title: { flex: 1 },
});
