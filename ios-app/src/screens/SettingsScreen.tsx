import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '@/components/Screen';
import type { Nav } from '@/navigation/types';
import { useTheme, radius, spacing, font } from '@/theme';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import type { DigestFrequency } from '@/api/types';

interface Props {
  onBack?: () => void;
}

const OPTIONS: { value: DigestFrequency; label: string; sub: string }[] = [
  { value: 'none', label: 'Off', sub: 'No emails' },
  { value: 'daily', label: 'Daily', sub: 'Every morning' },
  { value: 'weekly', label: 'Weekly', sub: 'Once a week' },
  { value: 'fortnightly', label: 'Fortnightly', sub: 'Every two weeks' },
];

export function SettingsScreen({ onBack }: Props) {
  const nav = useNavigation<Nav>();
  const goBack = onBack ?? (() => nav.goBack());
  const t = useTheme();
  const { user, patchUser } = useAuth();
  const current = user?.digest_frequency ?? 'none';
  const [saving, setSaving] = useState<DigestFrequency | null>(null);

  const select = async (value: DigestFrequency) => {
    if (value === current || saving) return;
    setSaving(value);
    const prev = current;
    patchUser({ digest_frequency: value });
    try {
      await api.updateDigestFrequency(value);
    } catch (err) {
      patchUser({ digest_frequency: prev });
      Alert.alert('Could not save digest setting', String(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: font.size.md }}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text }]}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Email digest</Text>
        <Text style={[styles.sectionHint, { color: t.textMuted }]}>
          A summary of your overdue, due-today, and open tasks, sent to {user?.email}.
        </Text>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          {OPTIONS.map((opt, idx) => {
            const active = current === opt.value;
            const isSaving = saving === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => select(opt.value)}
                disabled={saving !== null}
                style={({ pressed }) => [
                  styles.row,
                  idx < OPTIONS.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: t.border,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: t.text }]}>{opt.label}</Text>
                  <Text style={[styles.rowSub, { color: t.textMuted }]}>{opt.sub}</Text>
                </View>
                <Text
                  style={{
                    color: active ? t.accent : 'transparent',
                    fontSize: font.size.md,
                    fontWeight: font.weight.semibold,
                  }}
                >
                  {isSaving ? '…' : '✓'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold },
  sectionLabel: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionHint: {
    fontSize: font.size.sm,
    marginBottom: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  rowSub: { fontSize: font.size.sm, marginTop: 2 },
});
