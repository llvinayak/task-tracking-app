import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';
import { useThemeStore } from './themeStore';

const ThemeContext = createContext<Theme>(lightTheme);
/** True once the Inter files are registered. Until then Text uses the system font + fontWeight. */
const FontsLoadedContext = createContext(false);

export function ThemeProvider({
  children,
  fontsLoaded = false,
}: {
  children: React.ReactNode;
  fontsLoaded?: boolean;
}) {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();

  const theme = useMemo(() => {
    const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
    return scheme === 'dark' ? darkTheme : lightTheme;
  }, [mode, system]);

  return (
    <ThemeContext.Provider value={theme}>
      <FontsLoadedContext.Provider value={fontsLoaded}>{children}</FontsLoadedContext.Provider>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export const useFontsLoaded = () => useContext(FontsLoadedContext);
