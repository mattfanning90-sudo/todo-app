import React from 'react';
import { Pressable, Text } from 'react-native';
import { useTheme, radius, font } from '@/theme';

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  mode?: 'filter' | 'choice';
  color?: string;
}

export function Chip({ label, active, onPress, mode = 'filter', color }: Props) {
  const t = useTheme();
  const activeBg = mode === 'choice' ? (color ?? t.accent) : t.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: active ? activeBg : t.chipMuted,
      }}
    >
      <Text style={{
        fontSize: 13, fontWeight: font.weight.semibold,
        color: active ? '#fff' : t.textMuted, textTransform: 'capitalize',
      }}>{label}</Text>
    </Pressable>
  );
}
