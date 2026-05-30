// ios-app/src/components/TagChip.tsx
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

interface Props {
  name: string;
  color: string;     // 6-digit hex, e.g. '#3B82F6'
  testID?: string;
}

export function TagChip({ name, color, testID }: Props) {
  if (!name) return null;
  // Append '1a' for ~10% opacity tint; works with 6-digit hex category colors
  const bg = `${color}1a`;
  return (
    <View testID={testID} style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color }]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
