import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

type ToastTone = 'success' | 'danger' | 'info';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  /** `durationMs` defaults to 4s; use longer for warnings that must be read. */
  show: (message: string, tone?: ToastTone, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });
const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = 'info', durationMs: number = DURATION_MS) => {
    if (timer.current) clearTimeout(timer.current);
    nextId.current += 1;
    setToast({ id: nextId.current, message, tone });
    timer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show }), [show]);
  const c = toast ? t.colors[toast.tone] : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && c ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 8 }}
        >
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessible
            style={[
              {
                backgroundColor: c.soft,
                borderColor: c.base,
                borderWidth: 1,
                borderRadius: t.radius.xl,
                padding: t.spacing[3],
              },
              t.elevation('md'),
            ]}
          >
            <Text size="sm" weight="medium" style={{ color: c.fg }}>
              {toast.message}
            </Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
