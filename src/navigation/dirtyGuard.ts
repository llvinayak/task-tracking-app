import { Alert } from 'react-native';

import { useDirtyGuard } from '@/hooks/dailyReport';

/**
 * My Day dirty guard, shared by the tab bar and the drawer. If the day has unsaved edits an Alert asks
 * first ("Keep editing" stays, "Discard" resets the form then runs `proceed`); otherwise `proceed` runs at once.
 * `targetIsMyDay` skips the question (moving to My Day is not leaving it).
 * Returns true when `proceed` ran immediately, false when the question was shown.
 */
export function confirmLeaveDirtyDay(proceed: () => void, opts: { targetIsMyDay?: boolean } = {}): boolean {
  const guard = useDirtyGuard.getState();
  if (!guard.dirty || opts.targetIsMyDay) {
    proceed();
    return true;
  }
  Alert.alert('Discard changes?', 'You have unsaved changes to your day.', [
    { text: 'Keep editing', style: 'cancel' },
    {
      text: 'Discard',
      style: 'destructive',
      onPress: () => {
        guard.requestDiscard();
        proceed();
      },
    },
  ]);
  return false;
}
