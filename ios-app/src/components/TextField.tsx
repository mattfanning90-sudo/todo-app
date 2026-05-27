import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { useTheme, radius, spacing, font } from '@/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={t.textLight}
        {...rest}
        style={[
          styles.input,
          {
            backgroundColor: t.surfaceElevated,
            borderColor: error ? t.danger : t.borderInput,
            color: t.text,
          },
          style,
        ]}
      />
      {error ? (
        <Text style={[styles.error, { color: t.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: font.size.md,
  },
  error: {
    fontSize: font.size.sm,
    marginTop: spacing.xs,
  },
});
