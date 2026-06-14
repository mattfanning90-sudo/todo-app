// Manual mock so importing the screen tree (and the reminders module) under jest
// doesn't pull in the native module. reminders.test.ts overrides this with its
// own jest.mock to drive permission/schedule behaviour.
module.exports = {
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notif-id'),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  // Used by NotificationDeepLink in App.tsx to handle reminder taps.
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
};
