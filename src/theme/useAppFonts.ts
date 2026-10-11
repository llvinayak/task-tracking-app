import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

/** Release the splash even if fonts are slow: Text falls back to the system font. */
export const FONT_TIMEOUT_MS = 2500;

// Keep the native splash up until fonts load (or the timeout below). Failure to
// prevent auto hide (e.g. already hidden during fast refresh) is harmless.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Call once the first real frame is laid out (App root onLayout): no blank frame between splash and UI. */
export function hideSplash(): void {
  SplashScreen.hideAsync().catch(() => undefined);
}

/**
 * One loader for Inter + the Ionicons glyph font. Returns:
 *  - fontsLoaded: Inter is registered (Text switches to the Inter family)
 *  - ready: safe to render the app (fonts loaded, failed, or timed out)
 */
export function useAppFonts(): { fontsLoaded: boolean; ready: boolean } {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Ionicons.font,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded || error) return;
    const id = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [loaded, error]);

  const ready = loaded || !!error || timedOut;

  return { fontsLoaded: loaded && !error, ready };
}
