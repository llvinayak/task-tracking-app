import { useRoute, type RouteProp } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/ui';
import { HeaderProvidedContext, HeaderVariantContext, TopInsetHandledContext } from '@/components/ui/Screen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { useTheme } from '@/theme/ThemeProvider';

import { MOBILE_MODULES } from './modules';
import type { RootStackParamList } from './types';

/**
 * Hosts a screen as a PUSHED screen under the single PageHeader (back + title +
 * global strips). The header pads the status bar, so it tells the screen inside
 * not to pad it a second time (TopInsetHandledContext) and that the title is
 * already shown (HeaderProvidedContext).
 */
export function ModuleHost({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: t.colors.app }]}>
      <PageHeader variant="push" title={title} />
      <TopInsetHandledContext.Provider value>
        <HeaderProvidedContext.Provider value>
          <View style={styles.flex1}>{children}</View>
        </HeaderProvidedContext.Provider>
      </TopInsetHandledContext.Provider>
    </View>
  );
}

/**
 * Route target for `Module`: renders the registered screen for the module name.
 * The module screens are self-headed: they draw a `push` ModuleHeader (Back + title +
 * strips) themselves in every state, so this host adds no header of its own.
 */
export function ModuleRoute() {
  const t = useTheme();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Module'>>();
  const mod = MOBILE_MODULES.find((m) => m.name === params.name);
  if (!mod) return null;
  const Screen = mod.screen;
  return (
    <View style={[styles.root, { backgroundColor: t.colors.app }]}>
      <HeaderVariantContext.Provider value="push">
        <Screen />
      </HeaderVariantContext.Provider>
    </View>
  );
}

export function ProfileRoute() {
  return (
    <ModuleHost title="Profile">
      <ProfileScreen />
    </ModuleHost>
  );
}

/** Wraps a pushed detail screen with the single push header (native headers are hidden). */
export function withPushHeader(Component: React.ComponentType, title: string): React.ComponentType {
  function PushScreen() {
    return (
      <ModuleHost title={title}>
        <Component />
      </ModuleHost>
    );
  }
  PushScreen.displayName = `Push(${title})`;
  return PushScreen;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
});
