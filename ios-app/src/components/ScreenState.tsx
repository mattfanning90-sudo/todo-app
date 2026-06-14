import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme, spacing, font } from '@/theme';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';
import type { IconName } from '@/components/Icon';

interface Props {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyBody?: string;
  children?: React.ReactNode;
}

export function ScreenState({
  loading,
  error,
  onRetry,
  empty,
  emptyIcon,
  emptyTitle,
  emptyBody,
  children,
}: Props) {
  const t = useTheme();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.errorText, { color: t.textMuted }]}>{error}</Text>
        {onRetry && (
          <Button
            label="Try again"
            onPress={onRetry}
            variant="primary"
            style={styles.retryButton}
          />
        )}
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.center}>
        {emptyIcon && (
          <Icon
            name={emptyIcon}
            label=""
            size={48}
            color={t.textLight}
            style={styles.emptyIcon}
          />
        )}
        {emptyTitle && (
          <Text style={[styles.emptyTitle, { color: t.text }]}>{emptyTitle}</Text>
        )}
        {emptyBody && (
          <Text style={[styles.emptyBody, { color: t.textMuted }]}>{emptyBody}</Text>
        )}
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: font.size.md,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    minWidth: 140,
  },
  emptyIcon: {
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontSize: font.size.md,
    textAlign: 'center',
    lineHeight: 22,
  },
});
