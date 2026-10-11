import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';

import { useMenuAccess } from '@/hooks/useMenuAccess';

import { grantedModules, splitModules } from './moduleTabs';
import { MOBILE_MODULES } from './modules';
import type { ModuleName, RootStackParamList } from './types';

/**
 * Opens a module wherever it lives: its tab if it has one, otherwise as a
 * pushed screen. Returns false (and does nothing) when the user was not granted
 * the module.
 */
export function useOpenModule() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { canView, mobileMenus } = useMenuAccess();
  return useCallback(
    (name: ModuleName): boolean => {
      const granted = grantedModules(MOBILE_MODULES, canView, mobileMenus);
      if (!granted.some((m) => m.name === name)) return false;
      const { tabs } = splitModules(granted);
      if (tabs.some((m) => m.name === name)) nav.navigate('Main', { screen: name });
      else nav.navigate('Module', { name });
      return true;
    },
    [nav, canView, mobileMenus],
  );
}
