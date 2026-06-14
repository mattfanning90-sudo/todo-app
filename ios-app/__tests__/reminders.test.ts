import * as Notifications from 'expo-notifications';
import { computeFireAt, reconcileReminders } from '@/notifications/reminders';
import type { ReminderTask } from '@/api/types';

jest.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const mockNotif = Notifications as jest.Mocked<typeof Notifications>;

const NOW = new Date('2026-06-15T10:00:00').getTime();
const enabled = { reminders_enabled: true, reminder_time: '09:00', reminder_lead_days: 0 };
const task = (id: number, due_date: string): ReminderTask =>
  ({ id, text: `task ${id}`, due_date, board_id: 1, board_name: 'Board' });

beforeEach(() => {
  jest.clearAllMocks();
  mockNotif.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' } as never);
  mockNotif.requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' } as never);
});

// computeFireAt — must match public/reminders.js exactly.
describe('computeFireAt', () => {
  it('fires on the due date at the reminder time when lead is 0', () => {
    const d = computeFireAt('2026-06-20', '09:00', 0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(9);
  });
  it('subtracts the lead days', () => {
    expect(computeFireAt('2026-06-20', '07:30', 2).getDate()).toBe(18);
  });
  it('rolls back across a month boundary', () => {
    const d = computeFireAt('2026-07-01', '09:00', 2);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(29);
  });
});

describe('reconcileReminders', () => {
  it('always cancels existing scheduled notifications first', async () => {
    await reconcileReminders(enabled, [], NOW);
    expect(mockNotif.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('schedules only future tasks, skipping past/today-past ones', async () => {
    const tasks = [
      task(1, '2026-06-20'), // future → scheduled
      task(2, '2026-06-15'), // due today, but 09:00 < 10:00 now → skipped
      task(3, '2026-06-10'), // past → skipped
    ];
    const n = await reconcileReminders(enabled, tasks, NOW);
    expect(n).toBe(1);
    expect(mockNotif.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = mockNotif.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.content.title).toBe('Task due');
    expect(arg.content.body).toBe('task 1 · Board');
  });

  it('caps scheduling at 60 to stay under the iOS 64-pending limit', async () => {
    const many = Array.from({ length: 70 }, (_, i) =>
      task(i, `2026-07-${String((i % 28) + 1).padStart(2, '0')}`));
    const n = await reconcileReminders(enabled, many, NOW);
    expect(n).toBe(60);
    expect(mockNotif.scheduleNotificationAsync).toHaveBeenCalledTimes(60);
  });

  it('does nothing (but still cancels) when reminders are disabled', async () => {
    const n = await reconcileReminders({ ...enabled, reminders_enabled: false }, [task(1, '2026-06-20')], NOW);
    expect(n).toBe(0);
    expect(mockNotif.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mockNotif.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules nothing when OS permission is denied', async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' } as never);
    mockNotif.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' } as never);
    const n = await reconcileReminders(enabled, [task(1, '2026-06-20')], NOW);
    expect(n).toBe(0);
    expect(mockNotif.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
