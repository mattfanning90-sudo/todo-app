import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { useTheme, radius, spacing } from '@/theme';

interface Props {
  children: React.ReactNode;
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, padded = true, onPress, style }: Props) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderRadius: radius.card,
    padding: padded ? spacing.lg : 0,
    ...t.shadowStyle,
    ...(t.name === 'dark' ? { borderWidth: 1, borderColor: t.border } : null),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { shadowOpacity: 0.1 }, style]}>
      {children}
    </Pressable>
  );
}
