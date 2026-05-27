import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { useAuth } from '@/auth/AuthContext';
import { useTheme, font, spacing } from '@/theme';
import { ApiError } from '@/api/client';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleConfigured = Boolean(
  GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID
);

// Isolated component so useIdTokenAuthRequest only runs when credentials exist.
// React hooks must not be called conditionally, so we gate at the component level.
function GoogleLoginButton({
  onError,
}: {
  onError: (msg: string) => void;
}) {
  const { googleLogin } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [, googleResponse, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    clientId: GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type !== 'success') {
      if (googleResponse?.type === 'error') {
        onError('Google sign-in failed');
        setGoogleLoading(false);
      } else if (
        googleResponse?.type === 'dismiss' ||
        googleResponse?.type === 'cancel'
      ) {
        setGoogleLoading(false);
      }
      return;
    }
    const idToken = googleResponse.params?.id_token;
    if (!idToken) {
      onError('No id_token returned from Google');
      setGoogleLoading(false);
      return;
    }
    googleLogin(idToken)
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : 'Network error';
        onError(msg || 'Could not sign in');
      })
      .finally(() => setGoogleLoading(false));
  }, [googleResponse, googleLogin, onError]);

  const start = async () => {
    setGoogleLoading(true);
    try {
      await promptAsync();
    } catch {
      onError('Could not open Google sign-in');
      setGoogleLoading(false);
    }
  };

  return (
    <Button
      label="Continue with Google"
      variant="secondary"
      onPress={start}
      loading={googleLoading}
    />
  );
}

export function LoginScreen() {
  const t = useTheme();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await signup(email.trim(), password, name.trim() || undefined);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? 'Wrong email or password'
            : err.message || 'Something went wrong'
          : 'Network error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.flex}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>Todo</Text>
            <Text style={[styles.subtitle, { color: t.textMuted }]}>
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </Text>
          </View>

          <View style={styles.form}>
            {mode === 'signup' && (
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Optional"
              />
            )}
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              placeholder="••••••••"
              error={error ?? undefined}
            />

            <Button
              label={mode === 'login' ? 'Sign in' : 'Create account'}
              onPress={submit}
              loading={loading}
              disabled={!email || !password}
            />

            {googleConfigured && (
              <>
                <View style={styles.divider}>
                  <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
                  <Text style={[styles.dividerText, { color: t.textMuted }]}>or</Text>
                  <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
                </View>
                <GoogleLoginButton onError={(msg) => setError(msg)} />
              </>
            )}

            <Button
              label={
                mode === 'login'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'
              }
              variant="ghost"
              onPress={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
              style={styles.toggle}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    marginTop: spacing.xxl * 2,
    marginBottom: spacing.xxl,
    alignItems: 'flex-start',
  },
  title: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  subtitle: { fontSize: font.size.md, marginTop: spacing.xs },
  form: { flex: 1 },
  toggle: { marginTop: spacing.md },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontSize: font.size.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
