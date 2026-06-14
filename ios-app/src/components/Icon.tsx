import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import {
  Search, Bell, Settings, MoreHorizontal, ChevronRight, ChevronLeft,
  Check, Mail, Repeat, Plus, X, Trash2,
} from 'lucide-react-native';
import { useTheme } from '@/theme';

const MAP = {
  search: Search, bell: Bell, settings: Settings, more: MoreHorizontal,
  chevron: ChevronRight, back: ChevronLeft, check: Check, mail: Mail,
  repeat: Repeat, plus: Plus, close: X, trash: Trash2,
} as const;

export type IconName = keyof typeof MAP;

interface Props {
  name: IconName;
  label: string;            // required: accessibility label
  size?: number;
  color?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Icon({ name, label, size = 22, color, onPress, style }: Props) {
  const t = useTheme();
  const Glyph = MAP[name];
  const glyph = <Glyph size={size} color={color ?? t.textMuted} strokeWidth={2} />;
  if (!onPress) {
    return <View accessibilityLabel={label} accessibilityElementsHidden style={style}>{glyph}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      {glyph}
    </Pressable>
  );
}
