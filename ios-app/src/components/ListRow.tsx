import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, spacing, font } from '@/theme';
import { Icon } from '@/components/Icon';

interface Props {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  accessory?: 'chevron' | 'check' | 'none';
  selected?: boolean;
  destructive?: boolean;
  divider?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}

export function ListRow({
  title, subtitle, leading, trailing, accessory = 'none',
  selected, destructive, divider = true, onPress, onLongPress,
  accessibilityHint, testID,
}: Props) {
  const t = useTheme();
  const acc =
    accessory === 'chevron' ? <Icon name="chevron" label="" size={18} color={t.textLight} />
    : accessory === 'check' && selected ? <Icon name="check" label="Selected" size={18} color={t.accent} />
    : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      disabled={!onPress && !onLongPress}
      accessibilityState={selected ? { selected: true } : undefined}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
        pressed && (onPress || onLongPress) ? { opacity: 0.7 } : null,
      ]}
    >
      {leading ? <View>{leading}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: destructive ? t.danger : t.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: t.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {trailing ?? acc}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 56, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  title: { fontSize: font.size.md, fontWeight: font.weight.medium },
  subtitle: { fontSize: font.size.sm, marginTop: 2 },
});
