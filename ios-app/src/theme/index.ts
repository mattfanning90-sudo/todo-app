import { useThemeContext } from '@/theme/ThemeProvider';

export type ThemeName = 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderInput: string;
  text: string;
  textMuted: string;
  textLight: string;
  accent: string;
  accentHover: string;
  accentText: string;
  accentMuted: string;
  danger: string;
  success: string;
  warning: string;
  overlay: string;
  shadowStyle: {
    shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number;
  };
  stage: { backlog: string; in_progress: string; done: string };
  priority: { high: string; medium: string; low: string; none: string };
}

export const lightTheme: Theme = {
  name: 'light',
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  border: 'rgba(30,30,46,0.08)',
  borderInput: 'rgba(30,30,46,0.15)',
  text: '#1E1E2E',
  textMuted: 'rgba(30,30,46,0.45)',
  textLight: 'rgba(30,30,46,0.30)',
  accent: '#FF6B47',
  accentHover: '#E8522E',
  accentText: '#FFFFFF',
  accentMuted: 'rgba(255,107,71,0.10)',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#F59E0B',
  overlay: 'rgba(30,30,46,0.40)',
  shadowStyle: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  stage: { backlog: '#94A3B8', in_progress: '#64748B', done: '#16A34A' },
  priority: { high: '#FF6B47', medium: '#F59E0B', low: '#9CA3AF', none: '#9CA3AF' },
};

export const darkTheme: Theme = {
  name: 'dark',
  bg: '#16161D',
  surface: '#1E1E28',
  surfaceElevated: '#2A2A36',
  border: 'rgba(255,255,255,0.08)',
  borderInput: 'rgba(255,255,255,0.15)',
  text: '#F2F2F7',
  textMuted: 'rgba(242,242,247,0.50)',
  textLight: 'rgba(242,242,247,0.35)',
  accent: '#FF6B47',
  accentHover: '#E8522E',
  accentText: '#FFFFFF',
  accentMuted: 'rgba(255,107,71,0.15)',
  danger: '#F87171',
  success: '#22C55E',
  warning: '#F59E0B',
  overlay: 'rgba(0,0,0,0.50)',
  shadowStyle: { shadowColor: '#000', shadowOpacity: 0.30, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  stage: { backlog: '#94A3B8', in_progress: '#64748B', done: '#22C55E' },
  priority: { high: '#FF6B47', medium: '#F59E0B', low: '#9CA3AF', none: '#9CA3AF' },
};

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, card: 16, pill: 999, xl: 20 };
export const font = {
  size: { xs: 11, sm: 12, md: 14, lg: 17, xl: 22, xxl: 28 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' } as const,
};
