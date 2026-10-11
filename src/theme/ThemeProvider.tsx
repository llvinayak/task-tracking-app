import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';
import { useThemeStore } from './themeStore';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();

  const theme = useMemo(() => {
    const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
    return scheme === 'dark' ? darkTheme : lightTheme;
  }, [mode, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
