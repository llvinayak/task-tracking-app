import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hapticNotify } from '@/lib/haptics';
import { animationsEnabled } from '@/lib/motion';
import { useTheme } from '@/theme/ThemeProvider';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'success' | 'danger' | 'info' | 'warning';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number | null; // null = persist until dismissed
}

interface ToastApi {
  /** `durationMs` defaults by tone: success 3s, info 4s, warning 7s, danger 8s+ (read time, max 15s). */
  show: (message: string, tone?: ToastTone, durationMs?: number) => void;
  dismiss: () => void;
}

interface ToastInternal {
  toast: ToastItem | null;
  dismiss: () => void;
  /** A sheet (RN Modal) draws above the app root; it mounts its own ToastView while open. */
  registerSheet: () => () => void;
}

const noop = () => {};
const ToastContext = createContext<ToastApi>({ show: noop, dismiss: noop });
const InternalContext = createContext<ToastInternal>({ toast: null, dismiss: noop, registerSheet: () => noop });

const MAX_QUEUE = 3;
/** Root toasts sit just below the 52dp header row; toasts inside a sheet use the top of the modal. */
const HEADER_ROW = 52;
const DEDUPE_MS = 1500;
const TONE_ICON: Record<ToastTone, IconName> = {
  success: 'checkmark-circle',
  danger: 'alert-circle',
  info: 'information-circle',
  warning: 'warning',
};

function defaultDuration(tone: ToastTone, message: string): number {
  if (tone === 'success') return 3000;
  if (tone === 'info') return 4000;
  if (tone === 'warning') return 7000;
  return Math.min(15000, Math.max(8000, 50 * message.length));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [sheets, setSheets] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const queue = useRef<ToastItem[]>([]);
  const current = useRef<ToastItem | null>(null);
  const last = useRef<{ message: string; at: number } | null>(null);
  const screenReader = useRef(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => {
        if (alive) screenReader.current = v;
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', (v) => {
      screenReader.current = v;
    });
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const present = useCallback((item: ToastItem | null) => {
    clearTimer();
    current.current = item;
    setToast(item);
    // iOS has no live regions: speak the message when it becomes visible (Android uses accessibilityLiveRegion).
    if (item && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility?.(item.message);
    if (item && item.durationMs !== null) {
      timer.current = setTimeout(() => {
        const next = queue.current.shift() ?? null;
        present(next);
      }, item.durationMs);
    }
  }, []);

  const dismiss = useCallback(() => {
    present(queue.current.shift() ?? null);
  }, [present]);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info', durationMs?: number) => {
      const now = Date.now();
      if (last.current && last.current.message === message && now - last.current.at < DEDUPE_MS) return;
      last.current = { message, at: now };
      if (tone === 'danger') hapticNotify('error');
      nextId.current += 1;
      // Errors persist until dismissed when a screen reader is on: nobody should lose them to a timer.
      const persist = tone === 'danger' && screenReader.current && durationMs === undefined;
      const item: ToastItem = {
        id: nextId.current,
        message,
        tone,
        durationMs: persist ? null : (durationMs ?? defaultDuration(tone, message)),
      };
      const cur = current.current;
      if (!cur) {
        present(item);
        return;
      }
      if (tone === 'danger' && cur.tone !== 'danger') {
        // An error must not wait behind a success/info toast: it takes the slot now.
        present(item);
        return;
      }
      // Everything else waits its turn (FIFO). A danger toast already on screen is never displaced;
      // queued errors go ahead of queued non-errors. At most MAX_QUEUE wait; the oldest non-danger is dropped first.
      const q = [...queue.current];
      if (tone === 'danger') {
        const firstLesser = q.findIndex((x) => x.tone !== 'danger');
        q.splice(firstLesser === -1 ? q.length : firstLesser, 0, item);
      } else {
        q.push(item);
      }
      while (q.length > MAX_QUEUE) {
        const drop = q.findIndex((x) => x.tone !== 'danger');
        q.splice(drop === -1 ? 0 : drop, 1);
      }
      queue.current = q;
    },
    [present],
  );

  useEffect(() => () => clearTimer(), []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const registerSheet = useCallback(() => {
    setSheets((n) => n + 1);
    return () => setSheets((n) => Math.max(0, n - 1));
  }, []);
  const internal = useMemo(() => ({ toast, dismiss, registerSheet }), [toast, dismiss, registerSheet]);

  return (
    <ToastContext.Provider value={api}>
      <InternalContext.Provider value={internal}>
        {children}
        {sheets === 0 ? <ToastView /> : null}
      </InternalContext.Provider>
    </ToastContext.Provider>
  );
}

/** Registers an open sheet so the toast renders inside its Modal instead of under it. */
export function useToastSheet(open: boolean) {
  const { registerSheet } = useContext(InternalContext);
  useEffect(() => {
    if (!open) return;
    return registerSheet();
  }, [open, registerSheet]);
}

/** The toast itself. Mounted by the provider at the root, or by an open BottomSheet. */
export function ToastView({ inSheet = false }: { inSheet?: boolean } = {}) {
  const { toast, dismiss } = useContext(InternalContext);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(1)).current;
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined || !animationsEnabled() || reduced) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: t.motion.base, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [id, reduced, anim, t.motion.base]);

  if (!toast) return null;
  const c = t.colors[toast.tone];
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + t.spacing[2] + (inSheet ? 0 : HEADER_ROW) }]}>
      <Animated.View
        style={{
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        }}
      >
        <Pressable
          onPress={dismiss}
          accessible={false}
          style={[
            styles.box,
            { backgroundColor: c.soft, borderColor: c.base, borderRadius: t.radius.xl },
            t.elevation('md'),
          ]}
        >
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion={toast.tone === 'danger' ? 'assertive' : 'polite'}
            accessible
            style={styles.message}
          >
            <Icon name={TONE_ICON[toast.tone]} size={20} color={c.fg} />
            <Text size="sm" weight="medium" style={[styles.flex1, { color: c.fg }]}>
              {toast.message}
            </Text>
          </View>
          <Pressable
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={[styles.close, { minWidth: t.minTouch, minHeight: t.minTouch }]}
          >
            <Icon name="close" size={20} color={c.fg} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingLeft: 12 },
  message: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 12 },
  flex1: { flex: 1 },
  close: { alignItems: 'center', justifyContent: 'center' },
});
