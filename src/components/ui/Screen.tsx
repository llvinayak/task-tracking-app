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
}

const ALL_EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

/** A host that already padded the status bar (ModuleHost) tells screens inside it not to do it again. */
export const TopInsetHandledContext = createContext(false);

export function Screen({
  children,
  scroll = false,
  keyboardAvoiding = false,
  edges = ALL_EDGES,
  padded = true,
  onRefresh,
  refreshing = false,
  contentStyle,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const topHandled = useContext(TopInsetHandledContext);

  const pad = {
    paddingTop: edges.includes('top') && !topHandled ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };
  const inner = [padded && { padding: t.spacing[4] }, contentStyle];

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.grow, inner]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
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

  return (
    <View style={[styles.flex, { backgroundColor: t.colors.app }, pad]}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
