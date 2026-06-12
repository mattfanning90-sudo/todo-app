import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { AuthProvider } from '@/auth/AuthContext';
import { RootNavigator } from '@/navigation/RootNavigator';

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

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds the error boundary + touch/navigation context. The jest mock
// keeps wrap as the identity function so App stays the real component. (Note:
// boot.test mounts RootNavigator directly, so it doesn't execute this line.)
export default Sentry.wrap(App);
