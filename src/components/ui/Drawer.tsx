import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { animationsEnabled } from '@/lib/motion';
import { useTheme } from '@/theme/ThemeProvider';

import { ToastView, useToastSheet } from './Toast';

export interface DrawerProps {
  visible: boolean;
  /** Scrim tap, Android hardware Back. The owner decides (normally: close). */
  onRequestClose: () => void;
  /** The slide-out has finished (immediately with reduced motion / skipAnimation). */
  onClosed?: () => void;
  /** Close without sliding (e.g. a status prompt sheet is about to show). */
  skipAnimation?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
}

/**
 * Navigation drawer built from core RN: a transparent Modal, a scrim and a panel that slides in from the
 * left. It owns mounting and animation only; content and actions belong to the caller. The Modal stays
 * mounted until the close animation ends. Toasts are re-mounted inside it (useToastSheet) so they are never
 * hidden behind the drawer.
 */
export function Drawer({ visible, onRequestClose, onClosed, skipAnimation = false, accessibilityLabel = 'Navigation menu', children }: DrawerProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const reduced = useReducedMotion();
  const width = Math.max(256, Math.min(320, Math.round(windowWidth * 0.85)));
  const progress = useRef(new Animated.Value(0)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [mounted, setMounted] = useState(visible);
  const openedOnce = useRef(false);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  useToastSheet(mounted);

  useEffect(() => {
    running.current?.stop();
    running.current = null;
    const animate = animationsEnabled() && !reduced && !skipAnimation;
    if (visible) {
      openedOnce.current = true;
      setMounted(true);
      if (!animate) {
        progress.setValue(1);
        return;
      }
      const a = Animated.timing(progress, { toValue: 1, duration: t.motion.slow, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      running.current = a;
      a.start();
      return;
    }
    if (!openedOnce.current) return; // never opened: nothing to close, nothing to report
    if (!animate) {
      progress.setValue(0);
      setMounted(false);
      closedRef.current?.();
      return;
    }
    const a = Animated.timing(progress, { toValue: 0, duration: t.motion.base, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    running.current = a;
    // `finished` is false when a re-open interrupted this close: then neither unmount nor onClosed.
    a.start(({ finished }) => {
      if (!finished) return;
      running.current = null;
      setMounted(false);
      closedRef.current?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, skipAnimation]);

  // Unmounting mid-animation: stop it and make sure no stale onClosed fires afterwards.
  useEffect(
    () => () => {
      running.current?.stop();
      running.current = null;
      closedRef.current = undefined;
    },
    [],
  );

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onRequestClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root} accessibilityViewIsModal>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Pressable
            testID="drawer-scrim"
            onPress={onRequestClose}
            accessible={false}
            style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }]}
          />
        </Animated.View>
        <Animated.View
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.panel,
            {
              width,
              backgroundColor: t.colors.surface,
              borderRightColor: t.colors.line,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
              transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }],
            },
            t.scheme === 'light' ? t.elevation('lg') : null,
          ]}
        >
          {children}
        </Animated.View>
        <ToastView inSheet />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRightWidth: 1 },
});
