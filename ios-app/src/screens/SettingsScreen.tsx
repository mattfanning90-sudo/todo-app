import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
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

const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '18:00', label: '6:00 PM' },
  { value: '20:00', label: '8:00 PM' },
];

const LEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'On the due date' },
  { value: 1, label: '1 day before' },
  { value: 2, label: '2 days before' },
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

  // ── Task reminders ──
  // patchUser updates the synced prefs; the app-level ReminderSync effect reacts
  // and reschedules the OS notifications (so we don't reconcile here directly).
  const reminders_enabled = user?.reminders_enabled ?? false;
  const reminder_time = user?.reminder_time ?? '09:00';
  const reminder_lead_days = user?.reminder_lead_days ?? 0;

  const saveReminders = async (next: { enabled: boolean; time: string; lead_days: number }) => {
    const prev = { reminders_enabled, reminder_time, reminder_lead_days };
    patchUser({
      reminders_enabled: next.enabled,
      reminder_time: next.time,
      reminder_lead_days: next.lead_days,
    });
    try {
      await api.updateReminders(next);
    } catch (err) {
      patchUser(prev);
      Alert.alert('Could not save reminder setting', String(err));
    }
  };

  const toggleReminders = async (value: boolean) => {
    if (value) {
      const perm = await Notifications.requestPermissionsAsync();
      if (!(perm.granted || perm.status === 'granted')) {
        Alert.alert(
          'Notifications are off',
          'Turn on notifications for this app in iOS Settings to get task reminders.'
        );
        return; // leave the toggle off
      }
    }
    saveReminders({ enabled: value, time: reminder_time, lead_days: reminder_lead_days });
  };

  const checkmark = (active: boolean) => (
    <Text style={{ color: active ? t.accent : 'transparent', fontSize: font.size.md, fontWeight: font.weight.semibold }}>✓</Text>
  );

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
        <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Task reminders</Text>
        <Text style={[styles.sectionHint, { color: t.textMuted }]}>
          A notification on this device for tasks with a due date.
        </Text>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: t.text, flex: 1 }]}>Remind me about due tasks</Text>
            <Switch value={reminders_enabled} onValueChange={toggleReminders} />
          </View>
        </View>

        {reminders_enabled && (
          <>
            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Time</Text>
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              {TIME_OPTIONS.map((opt, idx) => (
                <Pressable
                  key={opt.value}
                  onPress={() => saveReminders({ enabled: true, time: opt.value, lead_days: reminder_lead_days })}
                  style={({ pressed }) => [
                    styles.row,
                    idx < TIME_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.rowLabel, { color: t.text, flex: 1 }]}>{opt.label}</Text>
                  {checkmark(reminder_time === opt.value)}
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Remind me</Text>
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              {LEAD_OPTIONS.map((opt, idx) => (
                <Pressable
                  key={opt.value}
                  onPress={() => saveReminders({ enabled: true, time: reminder_time, lead_days: opt.value })}
                  style={({ pressed }) => [
                    styles.row,
                    idx < LEAD_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.rowLabel, { color: t.text, flex: 1 }]}>{opt.label}</Text>
                  {checkmark(reminder_lead_days === opt.value)}
                </Pressable>
              ))}
            </View>
          </>
        )}

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
