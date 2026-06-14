import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, spacing, font } from '@/theme';
import { Icon } from '@/components/Icon';

interface Props {
  title: string;
  variant?: 'primary' | 'detail';
  eyebrow?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

export function ScreenHeader({ title, variant = 'detail', eyebrow, onBack, actions }: Props) {
  const t = useTheme();
  if (variant === 'primary') {
    return (
      <View style={styles.primary}>
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: t.textMuted }]}>{eyebrow}</Text> : null}
          <Text style={[styles.h1, { color: t.text }]}>{title}</Text>
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    );
  }
  return (
    <View style={[styles.detail, { borderBottomColor: t.border }]}>
      <View style={styles.side}>
        {onBack ? <Icon name="back" label="Back" size={24} onPress={onBack} /> : null}
      </View>
      <Text style={[styles.h2, { color: t.text }]} numberOfLines={1}>{title}</Text>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: spacing.xl },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyebrow: { fontSize: font.size.xs, fontWeight: font.weight.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  h1: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  detail: { flexDirection: 'row', alignItems: 'center', height: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { width: 60, justifyContent: 'center' },
  h2: { flex: 1, textAlign: 'center', fontSize: font.size.lg, fontWeight: font.weight.bold },
});
