import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import React, { createContext, useContext } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { useKeyboardOpen, useKeyboardOverlap } from '@/hooks/useKeyboardInset';
import { useTheme } from '@/theme/ThemeProvider';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Pad against the keyboard (forms). */
  keyboardAvoiding?: boolean;
  /** Safe-area edges to pad. Tab screens usually omit 'bottom'. */
  edges?: readonly Edge[];
  padded?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * The screen's PageHeader, rendered ABOVE the (padded) body and outside the scroll
   * area, so it stays visible in every state. The header pads the status bar itself.
   */
  header?: React.ReactNode;
  /** Sticky footer outside the scroll area (primary actions). Hidden while the keyboard is open. */
  footer?: React.ReactNode;
  /** Children indices of the ScrollView content that pin while scrolling (e.g. a TabStrip). Needs `scroll`. */
  stickyHeaderIndices?: number[];
}

const ALL_EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

/** A host that already padded the status bar (ModuleHost) tells screens inside it not to do it again. */
export const TopInsetHandledContext = createContext(false);

/** True when a PageHeader above already shows this screen's title, so the screen drops its own title row. */
export const HeaderProvidedContext = createContext(false);

/** Which PageHeader a self-headed module screen renders: `tab` inside the tab bar, `push` when pushed (shows Back). */
export type HeaderVariant = 'tab' | 'push';
export const HeaderVariantContext = createContext<HeaderVariant>('tab');

export function Screen({
  children,
  scroll = false,
  keyboardAvoiding = false,
  edges = ALL_EDGES,
  padded = true,
  onRefresh,
  refreshing = false,
  contentStyle,
  header,
  footer,
  stickyHeaderIndices,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const topHandled = useContext(TopInsetHandledContext);
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const keyboardOpen = useKeyboardOpen();
  const kb = useKeyboardOverlap();

  const pad = {
    // With a `header`, the PageHeader pads the status bar itself.
    paddingTop: edges.includes('top') && !topHandled && !header ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };
  // Nothing else clears the bottom inset when 'bottom' is not an edge and there is no tab bar (module pushed
  // from More): scrolling content carries it. A footer already clears it, so then there is no extra.
  const bottomExtra = !edges.includes('bottom') && tabBarHeight == null && !footer ? insets.bottom : 0;
  const inner = [padded && { padding: t.spacing[4] }, contentStyle];

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.grow, inner, bottomExtra > 0 && { paddingBottom: (padded ? t.spacing[4] : 0) + bottomExtra }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      {...(stickyHeaderIndices ? { stickyHeaderIndices } : {})}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.colors.brand[500]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, inner]}>{children}</View>
  );

  // Footer clearance: nothing else pads the bottom inset when 'bottom' is not an edge AND there is
  // no tab bar below (e.g. a module pushed from More); otherwise the edge/tab bar already did.
  const footerInset = !edges.includes('bottom') && tabBarHeight == null ? insets.bottom : 0;
  const footerNode =
    footer && !keyboardOpen ? (
      <View
        style={[
          styles.footer,
          { backgroundColor: t.colors.surface, borderTopColor: t.colors.line, paddingBottom: t.spacing[3] + footerInset },
        ]}
      >
        {footer}
      </View>
    ) : null;

  return (
    <View style={[styles.flex, { backgroundColor: t.colors.app }, pad]}>
      {header}
      {keyboardAvoiding ? (
        // iOS: KeyboardAvoidingView. Android (edge-to-edge: adjustResize does not resize the window):
        // lift by how far the keyboard actually overlaps this view (see useKeyboardOverlap).
        <View
          ref={kb.ref}
          onLayout={Platform.OS === 'android' ? kb.onLayout : undefined}
          style={[styles.flex, Platform.OS === 'android' && { paddingBottom: kb.overlap }]}
        >
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {body}
            {footerNode}
          </KeyboardAvoidingView>
        </View>
      ) : (
        <>
          {body}
          {footerNode}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  footer: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16, gap: 8 },
});
