import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme, radius, spacing, font } from '@/theme';

interface Props {
  children: React.ReactNode;
  eyebrow?: string;
  style?: ViewStyle;
}

export function SectionCard({ children, eyebrow, style }: Props) {
  const t = useTheme();
  return (
    <View style={style}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: t.textMuted }]}>{eyebrow}</Text> : null}
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: radius.card,
          overflow: 'hidden',
          ...t.shadowStyle,
          ...(t.name === 'dark' ? { borderWidth: 1, borderColor: t.border } : null),
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.7,
    textTransform: 'uppercase', marginBottom: spacing.sm, marginLeft: spacing.xs,
  },
});
