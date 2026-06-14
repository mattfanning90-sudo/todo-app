import React, { useState } from 'react';
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

export function TextField({ label, error, style, onFocus, onBlur, ...rest }: Props) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.danger : focused ? t.accent : t.borderInput;
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={t.textLight}
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          styles.input,
          { backgroundColor: t.surface, borderColor, borderWidth: 1.5, color: t.text },
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
