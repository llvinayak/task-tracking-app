import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom padding for scrolling content (lists, scroll views) of a screen that does not pad the
 * bottom safe area itself. Under Android edge-to-edge nothing else clears the gesture/3-button
 * bar: inside the tab bar the tab bar does it (extra = 0), but a module pushed from the drawer (or any
 * screen without a tab bar) needs the inset added to its content padding.
 */
export function useBottomInsetExtra(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  return tabBarHeight == null ? insets.bottom : 0;
}

export function useScreenBottomPadding(base: number): number {
  return base + useBottomInsetExtra();
}
