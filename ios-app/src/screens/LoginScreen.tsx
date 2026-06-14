import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { BrandMark } from '@/components/BrandMark';
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

// expo-auth-session@7 changed the native redirect URI to ${Application.applicationId}:/oauthredirect
// (the bundle ID). Google's iOS OAuth client only accepts the reversed-client-ID form, so we
// must override redirectUri explicitly to restore the correct value.
const GOOGLE_IOS_REDIRECT_URI = GOOGLE_IOS_CLIENT_ID
  ? `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}:/oauthredirect`
  : undefined;

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
    redirectUri: GOOGLE_IOS_REDIRECT_URI,
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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Classify errors: field-level for credential failures, banner for network/Google
  const handleAuthError = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        setFieldError('Wrong email or password');
      } else {
        setBannerError(err.message || 'Something went wrong');
      }
    } else {
      setBannerError('Network error');
    }
  };

  const handleGoogleError = (msg: string) => {
    setBannerError(msg);
  };

  const clearErrors = () => {
    setFieldError(null);
    setBannerError(null);
  };

  const submit = async () => {
    clearErrors();
    setLoading(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await signup(email.trim(), password, name.trim() || undefined);
    } catch (err) {
      handleAuthError(err);
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand header */}
          <View style={styles.header}>
            <BrandMark size={56} />
            <Text style={[styles.subtitle, { color: t.textMuted }]}>
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </Text>
          </View>

          {/* Network / Google error banner */}
          {bannerError ? (
            <View style={[styles.banner, { backgroundColor: t.danger + '18', borderColor: t.danger + '40' }]}>
              <Text style={[styles.bannerText, { color: t.danger }]}>{bannerError}</Text>
            </View>
          ) : null}

          {/* Form card */}
          <Card padded>
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
              error={fieldError ?? undefined}
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
                <GoogleLoginButton onError={handleGoogleError} />
              </>
            )}
          </Card>

          {/* Mode toggle */}
          <Button
            label={
              mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'
            }
            variant="ghost"
            onPress={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              clearErrors();
            }}
            style={styles.toggle}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginTop: spacing.xxl * 2,
    marginBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  subtitle: {
    fontSize: font.size.md,
    marginTop: spacing.xs,
  },
  banner: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: {
    fontSize: font.size.sm,
    fontWeight: '500',
  },
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
  toggle: { marginTop: spacing.md },
});
