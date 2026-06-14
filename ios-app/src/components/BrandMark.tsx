import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, radius, font } from '@/theme';

export function BrandMark({ size = 56 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.tile, { width: size, height: size, borderRadius: radius.lg, backgroundColor: t.accent }]}>
        <Text style={{ color: '#fff', fontSize: size * 0.5, fontWeight: '700' }}>✓</Text>
      </View>
      <Text style={[styles.word, { color: t.text }]}>Taskly</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: font.size.xxl, fontWeight: font.weight.bold, letterSpacing: -0.5 },
});
