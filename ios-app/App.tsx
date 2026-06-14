import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { api } from '@/api/client';
import { reconcileReminders } from '@/notifications/reminders';
import { RootNavigator, navigationRef } from '@/navigation/RootNavigator';

// Errors-only Sentry. Inert unless a DSN is provided (EXPO_PUBLIC_SENTRY_DSN is
// inlined by Metro at build time; `extra.sentryDsn` is the app.json fallback).
// Native crashes are captured automatically once initialised.
const dsn =
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  (Constants.expoConfig?.extra?.sentryDsn as string | undefined);

if (dsn) {
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0, // errors only — conserve the free-tier quota
    sendDefaultPii: false,
    // The default fetch breadcrumb records full URLs; strip query strings so
    // search terms (?q=) and board IDs don't ride along on captured events.
    beforeBreadcrumb(crumb) {
      if (crumb.category === 'fetch' && crumb.data?.url) {
        crumb.data.url = String(crumb.data.url).split('?')[0];
      }
      return crumb;
    },
  });
}

// Show reminder banners even if the app happens to be foregrounded when one fires.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Keeps the OS-scheduled task reminders in sync with the user's prefs + agenda:
// reconciles on prefs change and whenever the app returns to the foreground (so
// tasks added/completed elsewhere are reflected). Renders nothing.
function ReminderSync() {
  const { user } = useAuth();
  const enabled = user?.reminders_enabled ?? false;
  const time = user?.reminder_time ?? '09:00';
  const lead = user?.reminder_lead_days ?? 0;

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!enabled) {
        await reconcileReminders({ reminders_enabled: false, reminder_time: time, reminder_lead_days: lead }, []).catch(() => {});
        return;
      }
      try {
        const tasks = await api.reminderAgenda();
        if (cancelled) return;
        await reconcileReminders({ reminders_enabled: true, reminder_time: time, reminder_lead_days: lead }, tasks);
      } catch {
        // Offline/transient — leave the previously scheduled set in place.
      }
    };
    sync();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') sync(); });
    return () => { cancelled = true; sub.remove(); };
  }, [enabled, time, lead]);

  return null;
}

// Navigates to the Today tab when the user taps a reminder notification.
// The notification payload carries `data.taskId` (set in reminders.ts), but
// there is no GET /api/tasks/:id endpoint, so the safest reliable action is to
// bring the user to the Today screen where their upcoming tasks are listed.
// Handles both foreground taps (addNotificationResponseReceivedListener) and
// the cold-start case where the app was launched via the notification banner
// (getLastNotificationResponseAsync).
function NotificationDeepLink() {
  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse) {
      try {
        const taskId = response.notification.request.content.data?.taskId;
        if (!taskId) return; // not a reminder notification
        if (!navigationRef.isReady()) return;
        // Switch to the Today tab. (The stack inside Today is not reset —
        // the user lands wherever they left it within that tab.)
        navigationRef.navigate('Today' as never);
      } catch {
        // Guard: never let a navigation failure break the app startup.
      }
    }

    // Cold-start: the app was launched by tapping a notification banner.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => { if (response) handleResponse(response); })
      .catch(() => {});

    // Foreground taps (app already running).
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, []);

  return null;
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <StatusBar style="auto" />
            <ReminderSync />
            <NotificationDeepLink />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds the error boundary + touch/navigation context. The jest mock
// keeps wrap as the identity function so App stays the real component. (Note:
// boot.test mounts RootNavigator directly, so it doesn't execute this line.)
export default Sentry.wrap(App);
