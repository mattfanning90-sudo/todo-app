import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard } from '@/components/SectionCard';
import { ListRow } from '@/components/ListRow';
import type { Nav } from '@/navigation/types';
import { spacing } from '@/theme';
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

const LEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'On the due date' },
  { value: 1, label: '1 day before' },
  { value: 2, label: '2 days before' },
];

/** Parse HH:MM into a Date (today's date, local time) for DateTimePicker. */
function timeStrToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** Format HH:MM as a readable 12-hour label. */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  const min = String(m).padStart(2, '0');
  return `${hour}:${min} ${ampm}`;
}

/** Convert a Date back to HH:MM. */
function dateToTimeStr(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function SettingsScreen({ onBack }: Props) {
  const nav = useNavigation<Nav>();
  const goBack = onBack ?? (() => nav.goBack());
  const { user, patchUser } = useAuth();
  const current = user?.digest_frequency ?? 'none';
  const [saving, setSaving] = useState<DigestFrequency | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

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

  const handleTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setTimePickerOpen(false);
    if (selected) {
      saveReminders({ enabled: true, time: dateToTimeStr(selected), lead_days: reminder_lead_days });
    }
  };

  return (
    <Screen>
      <ScreenHeader variant="detail" title="Settings" onBack={goBack} />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl, paddingTop: spacing.lg }}>
        <SectionCard eyebrow="Task reminders" style={{ marginBottom: spacing.lg }}>
          <ListRow
            title="Remind me about due tasks"
            trailing={
              <Switch value={reminders_enabled} onValueChange={toggleReminders} />
            }
            divider={reminders_enabled}
          />
          {reminders_enabled && (
            <>
              <ListRow
                title="Reminder time"
                subtitle={formatTime(reminder_time)}
                onPress={() => setTimePickerOpen(true)}
                accessory="chevron"
                divider
              />
              {timePickerOpen && (
                <DateTimePicker
                  value={timeStrToDate(reminder_time)}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                />
              )}
              {LEAD_OPTIONS.map((opt, idx) => (
                <ListRow
                  key={opt.value}
                  title={opt.label}
                  accessory="check"
                  selected={reminder_lead_days === opt.value}
                  divider={idx < LEAD_OPTIONS.length - 1}
                  onPress={() => saveReminders({ enabled: true, time: reminder_time, lead_days: opt.value })}
                />
              ))}
            </>
          )}
        </SectionCard>

        <SectionCard eyebrow="Email digest" style={{ marginBottom: spacing.lg }}>
          {OPTIONS.map((opt, idx) => {
            const active = current === opt.value;
            const isSaving = saving === opt.value;
            return (
              <ListRow
                key={opt.value}
                title={opt.label}
                subtitle={opt.sub}
                accessory={isSaving ? 'none' : 'check'}
                selected={active}
                trailing={isSaving ? <ActivityIndicator size="small" /> : undefined}
                divider={idx < OPTIONS.length - 1}
                onPress={saving ? undefined : () => select(opt.value)}
              />
            );
          })}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
