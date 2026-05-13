import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, spacing } from '@/theme';

interface Props {
  children: React.ReactNode;
  padded?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, padded = true, style }: Props) {
  const t = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={['top']}>
      <View
        style={[
          styles.inner,
          padded && { paddingHorizontal: spacing.lg },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { flex: 1 },
});
