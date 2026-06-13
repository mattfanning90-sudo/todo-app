import * as Notifications from 'expo-notifications';
import type { ReminderTask } from '@/api/types';

// On-device task reminders (Phase 1). The OS fires these even when the app is
// closed — the advantage over the web client. computeFireAt is shared logic,
// mirrored in public/reminders.js (keep them in sync).

export interface ReminderPrefs {
  reminders_enabled: boolean;
  reminder_time: string;       // HH:MM, device-local
  reminder_lead_days: number;  // 0 | 1 | 2
}

// iOS allows 64 pending local notifications; stay safely under.
const MAX_SCHEDULED = 60;

// (due_date − lead_days) at reminder_time, in device-local time.
export function computeFireAt(due_date: string, reminder_time: string, lead_days: number): Date {
  const [y, m, d] = due_date.split('-').map(Number);
  const [hh, mm] = reminder_time.split(':').map(Number);
  return new Date(y, m - 1, d - (lead_days || 0), hh, mm, 0, 0);
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted || req.status === 'granted';
}

// Reconcile the OS-scheduled reminders to match prefs + the agenda: cancel all,
// then (if enabled + permitted) schedule one per future task, soonest first,
// capped at MAX_SCHEDULED. Returns the number scheduled (for tests/telemetry).
export async function reconcileReminders(
  prefs: ReminderPrefs,
  tasks: ReminderTask[],
  now: number = Date.now()
): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.reminders_enabled) return 0;
  if (!(await ensurePermission())) return 0;

  const sorted = [...tasks].sort((a, b) => a.due_date.localeCompare(b.due_date));
  let scheduled = 0;
  for (const t of sorted) {
    if (scheduled >= MAX_SCHEDULED) break;
    const fireAt = computeFireAt(t.due_date, prefs.reminder_time, prefs.reminder_lead_days);
    if (fireAt.getTime() <= now) continue; // skip past — no overdue spam
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Task due',
        body: t.board_name ? `${t.text} · ${t.board_name}` : t.text,
        data: { taskId: t.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    scheduled++;
  }
  return scheduled;
}
