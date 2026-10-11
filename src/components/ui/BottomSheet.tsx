import React, { useCallback } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardOverlap } from '@/hooks/useKeyboardInset';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Text } from './Text';
import { ToastView, useToastSheet } from './Toast';

export interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * picker: choose something, trailing "Close". form: leading "Cancel", actions in `footer`.
   * prompt: no header button, the body carries its own choices.
   */
  kind?: 'picker' | 'form' | 'prompt';
  /** Sticky footer (form actions) outside the scrolling body, above the keyboard. */
  footer?: React.ReactNode;
  /** Unsaved edits: closing (scrim, Cancel, Android back) asks to discard first. */
  dirty?: boolean;
  onDiscard?: () => void;
  /** Override the trailing/leading close label. */
  closeLabel?: string;
  /** Max height as a fraction of the window (default 0.9). */
  maxHeightPct?: number;
  /**
   * Wrap the body in a ScrollView (default). Pass false when the body is its own
   * FlatList so two vertical scrollers are not nested.
   */
  scroll?: boolean;
}

/**
 * Bottom sheet on RN Modal (no extra dependency): scrim, grab handle, header,
 * scrollable body, sticky footer, keyboard-aware. The toast is re-mounted inside
 * the Modal so errors are never hidden behind an open sheet.
 */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
  kind = 'picker',
  footer,
  dirty = false,
  onDiscard,
  closeLabel,
  maxHeightPct = 0.9,
  scroll = true,
}: BottomSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Lift only by what the keyboard really covers: if Android already resized the window the overlap is 0 (no double lift).
  const kb = useKeyboardOverlap();
  const keyboard = kb.overlap;
  const reduced = useReducedMotion();
  useToastSheet(visible);

  const requestClose = useCallback(() => {
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'You have unsaved changes.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          onDiscard?.();
          onClose();
        },
      },
    ]);
  }, [dirty, onClose, onDiscard]);

  const maxHeight = Math.max(160, Math.min(height * maxHeightPct, height - keyboard - insets.top - 8));
  const close = closeLabel ?? (kind === 'form' ? 'Cancel' : 'Close');

  const body = scroll ? (
    <ScrollView
      style={styles.flexShrink}
      contentContainerStyle={{ paddingBottom: footer ? t.spacing[4] : t.spacing[3] }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flexShrink}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={requestClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View ref={kb.ref} onLayout={kb.onLayout} style={[styles.root, { paddingBottom: keyboard }]}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }]}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        {/* One modal a11y container holds the sheet AND the toast: siblings of a modal view are unreachable for screen readers. */}
        <View accessibilityViewIsModal pointerEvents="box-none" style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.colors.elevated,
              borderTopLeftRadius: t.radius['2xl'],
              borderTopRightRadius: t.radius['2xl'],
              maxHeight,
              paddingBottom: footer ? 0 : insets.bottom,
            },
          ]}
        >
          <View style={styles.handleWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.handle, { backgroundColor: t.colors.fieldBorder }]} />
          </View>
          <View style={styles.header}>
            {kind === 'form' ? (
              <Button
                label={close}
                accessibilityLabel={`${close} ${title}`}
                variant="ghost"
                size="compact"
                fullWidth={false}
                onPress={requestClose}
              />
            ) : null}
            <Text size="lg" weight="semibold" accessibilityRole="header" numberOfLines={2} style={styles.title}>
              {title}
            </Text>
            {kind === 'picker' ? (
              <Pressable
                onPress={requestClose}
                accessibilityRole="button"
                accessibilityLabel={`${close} ${title}`}
                style={[styles.close, { minWidth: t.minTouch, minHeight: t.minTouch }]}
              >
                <Text weight="semibold" tone="brand">
                  {close}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {body}
          {footer ? (
            <View
              style={[
                styles.footer,
                { borderTopColor: t.colors.line, backgroundColor: t.colors.elevated, paddingBottom: (keyboard > 0 ? 0 : insets.bottom) + t.spacing[3] },
              ]}
            >
              {footer}
            </View>
          ) : null}
        </View>
        <ToastView inSheet />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {},
  flexShrink: { flexShrink: 1 },
  handleWrap: { alignItems: 'center', paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, minHeight: 48, gap: 8 },
  title: { flex: 1 },
  close: { alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16, gap: 8 },
});
