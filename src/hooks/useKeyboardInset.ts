import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type View } from 'react-native';

/** True while the keyboard is open (any height). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return open;
}

/**
 * How far the keyboard covers THIS view's bottom edge (0 when it does not).
 *
 * Why measured instead of "keyboard height - safe area": the amount a view must
 * lift depends on what already sits below it (tab bar, nav bar, nothing) and on
 * whether Android already resized the window (adjustResize; not applied under
 * edge-to-edge). Comparing the view's real window position with the keyboard's top
 * edge (`endCoordinates.screenY`) is correct in all of those cases: a tab screen is
 * not over-lifted by the tab-bar height, and a Modal sheet is not lifted twice
 * when the window already shrank (its bottom is then above the keyboard: overlap 0).
 * Needs on-device verification (Android 11+ edge-to-edge, iOS).
 */
export function useKeyboardOverlap() {
  const ref = useRef<View>(null);
  const [overlap, setOverlap] = useState(0);
  const keyboardTop = useRef<number | null>(null);
  /** Bumped by every show/hide: a measureInWindow callback from an older epoch is ignored. */
  const epoch = useRef(0);

  const measure = useCallback(() => {
    const top = keyboardTop.current;
    if (top === null) {
      setOverlap(0);
      return;
    }
    const mine = epoch.current;
    ref.current?.measureInWindow((_x, y, _w, h) => {
      // A late callback (after the keyboard hid or changed) must not resurrect a stale lift.
      if (mine !== epoch.current || keyboardTop.current === null) return;
      const next = Math.round(y + h - keyboardTop.current);
      setOverlap(Number.isFinite(next) ? Math.max(0, next) : 0);
    });
  }, []);

  useEffect(() => {
    const onShow = (e: { endCoordinates?: { screenY?: number; height?: number } }) => {
      epoch.current += 1;
      const screenY = e.endCoordinates?.screenY;
      const height = e.endCoordinates?.height;
      if (typeof screenY === 'number' && Number.isFinite(screenY)) {
        keyboardTop.current = screenY;
        measure();
      } else {
        // No usable top edge: fall back to the keyboard height when that is sane, else do not lift.
        keyboardTop.current = null;
        setOverlap(typeof height === 'number' && Number.isFinite(height) && height > 0 ? Math.round(height) : 0);
      }
    };
    const onHide = () => {
      epoch.current += 1;
      keyboardTop.current = null;
      setOverlap(0);
    };
    const subs =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillShow', onShow),
            // The frame can change while shown (predictive bar, floating/split keyboard).
            Keyboard.addListener('keyboardWillChangeFrame', onShow),
            Keyboard.addListener('keyboardWillHide', onHide),
          ]
        : [Keyboard.addListener('keyboardDidShow', onShow), Keyboard.addListener('keyboardDidHide', onHide)];
    return () => subs.forEach((x) => x.remove());
  }, [measure]);

  return { ref, overlap, onLayout: measure };
}
