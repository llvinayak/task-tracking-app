import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Haptics are reserved for outcomes (timer start/stop, submit, error). Never throw, never block. */
const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  try {
    void fn().catch(() => undefined);
  } catch {
    // simulator / unsupported device
  }
};

export const hapticImpact = (style: 'light' | 'medium' = 'medium') =>
  run(() =>
    Haptics.impactAsync(style === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium),
  );

export const hapticNotify = (type: 'success' | 'error') =>
  run(() =>
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ),
  );
