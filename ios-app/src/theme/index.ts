import { useColorScheme } from 'react-native';

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
  accentText: string;
  accentMuted: string;
  danger: string;
  success: string;
  warning: string;
  stage: {
    backlog: string;
    in_progress: string;
    done: string;
  };
  priority: {
    high: string;
    medium: string;
    low: string;
    none: string;
  };
  tk: {
    accent: string;
    accentHover: string;
    bg: string;
    card: string;
    text: string;
    muted: string;
    line: string;
    prioHigh: string;
    prioMed: string;
    prioLow: string;
    shadow: string;
  };
}

// Matches the web app's CSS variables exactly.
const light: Theme = {
  name: 'light',
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  border: '#E2E8F0',
  borderInput: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#64748B',
  textLight: '#94A3B8',
  accent: '#3B82F6',
  accentText: '#FFFFFF',
  accentMuted: 'rgba(59,130,246,0.10)',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  stage: {
    backlog: '#94A3B8',
    in_progress: '#3B82F6',
    done: '#22C55E',
  },
  priority: {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#3B82F6',
    none: '#94A3B8',
  },
  tk: {
    accent: '#FF6B47',
    accentHover: '#E8522E',
    bg: '#F7F7FA',
    card: '#FFFFFF',
    text: '#1E1E2E',
    muted: 'rgba(30,30,46,0.45)',
    line: 'rgba(30,30,46,0.08)',
    prioHigh: '#FF6B47',
    prioMed: '#F59E0B',
    prioLow: '#9CA3AF',
    shadow: '0 1px 4px rgba(30,30,46,0.06)',
  },
};

const dark: Theme = {
  name: 'dark',
  bg: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  border: '#334155',
  borderInput: '#475569',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  textLight: '#475569',
  accent: '#3B82F6',
  accentText: '#FFFFFF',
  accentMuted: 'rgba(59,130,246,0.15)',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  stage: {
    backlog: '#94A3B8',
    in_progress: '#3B82F6',
    done: '#22C55E',
  },
  priority: {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#3B82F6',
    none: '#94A3B8',
  },
  tk: {
    accent: '#FF6B47',
    accentHover: '#E8522E',
    bg: '#16161D',
    card: '#1E1E28',
    text: '#F2F2F7',
    muted: 'rgba(242,242,247,0.5)',
    line: 'rgba(255,255,255,0.08)',
    prioHigh: '#FF6B47',
    prioMed: '#F59E0B',
    prioLow: '#9CA3AF',
    shadow: '0 1px 4px rgba(0,0,0,0.2)',
  },
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, xl: 20 };
export const font = {
  size: { xs: 11, sm: 12, md: 14, lg: 17, xl: 22, xxl: 28 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' } as const,
};
