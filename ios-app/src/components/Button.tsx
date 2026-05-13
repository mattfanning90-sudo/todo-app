import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { useTheme, radius, spacing, font } from '@/theme';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: Props) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? t.accent
      : variant === 'secondary'
      ? t.surfaceElevated
      : 'transparent';
  const fg =
    variant === 'primary'
      ? t.accentText
      : variant === 'ghost'
      ? t.accent
      : t.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1,
          borderColor: variant === 'secondary' ? t.border : 'transparent',
          borderWidth: variant === 'secondary' ? 1 : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
});
