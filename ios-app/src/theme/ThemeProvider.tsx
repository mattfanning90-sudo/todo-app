import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { lightTheme, darkTheme, type Theme } from '@/theme';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORE_KEY = 'taskly.themePref';

interface ThemeState {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const Ctx = createContext<ThemeState | null>(null);
export const ThemeContext = Ctx;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const os = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY)
      .then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setPref(v); })
      .catch(() => {});
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPref(p);
    SecureStore.setItemAsync(STORE_KEY, p).catch(() => {});
  };

  const theme = useMemo(() => {
    const scheme = preference === 'system' ? (os ?? 'light') : preference;
    return scheme === 'dark' ? darkTheme : lightTheme;
  }, [preference, os]);

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeContext(): ThemeState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useThemeContext must be used within ThemeProvider');
  return c;
}
