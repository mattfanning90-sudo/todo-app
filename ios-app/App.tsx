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

// Sentry.wrap adds the error boundary + touch/navigation context. In tests the
// mock makes this the identity function, so boot.test still mounts the real App.
export default Sentry.wrap(App);
