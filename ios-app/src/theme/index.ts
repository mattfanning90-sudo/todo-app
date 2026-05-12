import { useColorScheme } from 'react-native';

export type ThemeName = 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  warning: string;
  stage: {
    backlog: string;
    progress: string;
    done: string;
  };
  priority: {
    high: string;
    medium: string;
    low: string;
    none: string;
  };
}

const dark: Theme = {
  name: 'dark',
  bg: '#0B0B0F',
  surface: '#16161D',
  surfaceElevated: '#1F1F29',
  border: '#2A2A38',
  text: '#F5F5F7',
  textMuted: '#8B8B9A',
  accent: '#6E6BF5',
  accentText: '#FFFFFF',
  danger: '#F5556B',
  success: '#3DD68C',
  warning: '#F5B85C',
  stage: {
    backlog: '#8B8B9A',
    progress: '#6E6BF5',
    done: '#3DD68C',
  },
  priority: {
    high: '#F5556B',
    medium: '#F5B85C',
    low: '#6BC5F5',
    none: '#8B8B9A',
  },
};

const light: Theme = {
  name: 'light',
  bg: '#FAFAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#F2F2F6',
  border: '#E5E5EA',
  text: '#0B0B0F',
  textMuted: '#6B6B7A',
  accent: '#5856F5',
  accentText: '#FFFFFF',
  danger: '#E5384D',
  success: '#22B670',
  warning: '#E59A2B',
  stage: {
    backlog: '#6B6B7A',
    progress: '#5856F5',
    done: '#22B670',
  },
  priority: {
    high: '#E5384D',
    medium: '#E59A2B',
    low: '#3B9DE5',
    none: '#6B6B7A',
  },
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'light' ? light : dark;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, xl: 20 };
export const font = {
  size: { xs: 11, sm: 13, md: 15, lg: 17, xl: 22, xxl: 28 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' } as const,
};
